const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const Report = require('../models/Report');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { logEvent } = require('../utils/auditLog');
const { findDuplicateCandidates } = require('../utils/patientDuplicates');
const {
  normalizeName,
  normalizePhone,
  escapeRegex,
  resolveAge,
  isValidDobString,
  isValidPhone,
  isValidEmail,
} = require('../utils/patientNormalize');

function parsePagination(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

function actorSnapshot(user) {
  return { userId: user._id, name: user.name, role: user.role };
}

// What the picker and every list row need — resolved age included, so no
// caller has to re-derive it and risk disagreeing about DOB vs recorded age.
function publicPatient(patient) {
  const age = resolveAge(patient);
  return {
    _id: patient._id,
    patientId: patient.patientId,
    name: patient.name,
    phone: patient.phone,
    email: patient.email,
    sex: patient.sex,
    dob: patient.dob,
    ageYears: patient.ageYears,
    ageRecordedAt: patient.ageRecordedAt,
    age: age.years,
    ageSource: age.source,
    address: patient.address,
    notes: patient.notes,
    isActive: patient.isActive,
    mergedInto: patient.mergedInto,
    createdAt: patient.createdAt,
    updatedAt: patient.updatedAt,
  };
}

// Decide what the technician typed before deciding how to look for it. Each
// branch seeks into a different index rather than scanning one.
function classifyQuery(raw) {
  const q = String(raw || '').trim();
  if (!q) return { kind: 'empty' };

  if (/^P-?\d+$/i.test(q)) {
    const digits = q.replace(/\D/g, '');
    return { kind: 'patientId', value: `P-${digits.padStart(6, '0')}` };
  }

  const digits = q.replace(/\D/g, '');
  // Mostly digits and long enough to be a phone fragment rather than a name.
  if (digits.length >= 4 && digits.length >= q.replace(/\s/g, '').length - 2) {
    return { kind: 'phone', value: digits.length > 10 ? digits.slice(-10) : digits };
  }

  return { kind: 'name', value: normalizeName(q) };
}

// Typeahead for the patient picker. Capped and projected deliberately: this
// fires on every keystroke (debounced), so it must stay cheap at any table
// size.
router.get('/search', isAuthenticated, async (req, res) => {
  try {
    const classified = classifyQuery(req.query.q);
    if (classified.kind === 'empty') {
      return res.json({ success: true, data: [], matchedOn: 'empty' });
    }

    const limit = Math.min(25, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const base = { mergedInto: null, isActive: true };
    let filter;

    if (classified.kind === 'patientId') {
      filter = { ...base, patientId: classified.value };
    } else if (classified.kind === 'phone') {
      // Anchored prefix on the normalized digits — index scan.
      filter = { ...base, phoneNormalized: new RegExp(`^${escapeRegex(classified.value)}`) };
    } else {
      // Anchored AND case-sensitive, against the pre-lowercased field. A /i
      // flag still "uses" the index but can no longer seek into it, so every
      // key gets read — the seek silently becomes a full index scan.
      filter = { ...base, nameNormalized: new RegExp(`^${escapeRegex(classified.value)}`) };
    }

    let patients = await Patient.find(filter).sort({ nameNormalized: 1 }).limit(limit);

    // Surname search: only when the anchored pass came up short, and still
    // capped, so the common prefix case never pays for this.
    if (classified.kind === 'name' && patients.length < limit) {
      const found = new Set(patients.map((p) => String(p._id)));
      const contains = await Patient.find({
        ...base,
        nameNormalized: new RegExp(escapeRegex(classified.value)),
        _id: { $nin: [...found] },
      })
        .sort({ nameNormalized: 1 })
        .limit(limit - patients.length);
      patients = patients.concat(contains);
    }

    // Last visit is what tells two same-named people apart at a glance, so
    // the picker gets it rather than having to ask per row.
    const ids = patients.map((p) => p._id);
    const lastVisits = ids.length
      ? await Report.aggregate([
          { $match: { patientId: { $in: ids } } },
          { $group: { _id: '$patientId', lastVisit: { $max: '$createdAt' } } },
        ])
      : [];
    const lastVisitBy = new Map(lastVisits.map((r) => [String(r._id), r.lastVisit]));

    res.json({
      success: true,
      matchedOn: classified.kind,
      data: patients.map((p) => ({
        ...publicPatient(p),
        lastVisit: lastVisitBy.get(String(p._id)) || null,
      })),
    });
  } catch (error) {
    console.error('Error searching patients:', error);
    res.status(500).json({ success: false, message: 'Failed to search patients' });
  }
});

// Duplicate check without creating anything — powers the live warning in the
// create dialog, so a technician sees the collision before they commit it.
router.post('/duplicates/check', isAuthenticated, async (req, res) => {
  try {
    const { name, phone, sex, dob, ageYears, excludeId } = req.body || {};
    if (!name) {
      return res.status(400).json({ success: false, message: 'name is required' });
    }

    const candidates = await findDuplicateCandidates(
      { name, phone, sex, dob, ageYears },
      { excludeId: excludeId || null }
    );

    res.json({
      success: true,
      data: candidates.map((c) => ({
        patient: publicPatient(c.patient),
        confidence: c.confidence,
        reasons: c.reasons,
      })),
    });
  } catch (error) {
    console.error('Error checking for duplicate patients:', error);
    res.status(500).json({ success: false, message: 'Failed to check for duplicates' });
  }
});

// Paginated list. Search here is the same classified lookup the typeahead
// uses, so the two can never disagree about what matches.
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req);
    const filter = { mergedInto: null };

    if (req.query.status === 'active') filter.isActive = true;
    else if (req.query.status === 'inactive') filter.isActive = false;

    if (req.query.search) {
      const classified = classifyQuery(req.query.search);
      if (classified.kind === 'patientId') filter.patientId = classified.value;
      else if (classified.kind === 'phone') {
        filter.phoneNormalized = new RegExp(`^${escapeRegex(classified.value)}`);
      } else if (classified.kind === 'name') {
        filter.nameNormalized = new RegExp(escapeRegex(classified.value));
      }
    }

    const [patients, total] = await Promise.all([
      Patient.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Patient.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: patients.map(publicPatient),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error('Error fetching patients:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch patients' });
  }
});

// Create. Answers 409 with candidates rather than silently making a second
// record for someone the lab already knows — unless the caller has seen them
// and said to go ahead.
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const { name, phone, email, sex, dob, ageYears, address, notes, force } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Patient name is required' });
    }
    if (!sex || !['male', 'female', 'other'].includes(sex)) {
      return res.status(400).json({ success: false, message: 'Sex must be male, female or other' });
    }
    if (dob && !isValidDobString(dob)) {
      return res.status(400).json({ success: false, message: "That date of birth isn't a valid date" });
    }
    if (dob && new Date(dob) > new Date()) {
      return res.status(400).json({ success: false, message: "Date of birth can't be in the future" });
    }
    if (ageYears != null && (Number.isNaN(Number(ageYears)) || Number(ageYears) < 0 || Number(ageYears) > 150)) {
      return res.status(400).json({ success: false, message: 'Age must be between 0 and 150' });
    }
    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({ success: false, message: 'Mobile number must be exactly 10 digits' });
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: "That doesn't look like a valid email address" });
    }

    if (!force) {
      const candidates = await findDuplicateCandidates({ name, phone, sex, dob, ageYears });
      if (candidates.length) {
        return res.status(409).json({
          success: false,
          message: 'This may already be an existing patient',
          data: {
            candidates: candidates.map((c) => ({
              patient: publicPatient(c.patient),
              confidence: c.confidence,
              reasons: c.reasons,
            })),
          },
        });
      }
    }

    const patient = new Patient({
      name: String(name).trim(),
      phone: phone ? String(phone).trim() : null,
      email: email ? String(email).trim() : null,
      sex,
      dob: dob || null,
      // Only meaningful as a fallback — a recorded age alongside a known DOB
      // would just be a second, staler answer to the same question.
      ageYears: !dob && ageYears != null ? Number(ageYears) : null,
      ageRecordedAt: !dob && ageYears != null ? new Date() : null,
      address: address || null,
      notes: notes || null,
      createdBy: actorSnapshot(req.user),
      updatedBy: actorSnapshot(req.user),
    });
    await patient.save();

    await logEvent({
      actor: req.user,
      action: 'patient.create',
      category: 'Patient',
      description: `Registered ${patient.name} as ${patient.patientId}`,
      targetType: 'Patient',
      targetId: patient._id,
    });

    res.status(201).json({ success: true, data: publicPatient(patient) });
  } catch (error) {
    // The unique index on patientId is the last line of defence if two
    // allocations ever collided; surface it as a retryable conflict rather
    // than a 500.
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Patient ID collision — please try again',
      });
    }
    console.error('Error creating patient:', error);
    res.status(500).json({ success: false, message: 'Failed to create patient' });
  }
});

// One patient. A merged record resolves to its survivor instead of 404ing,
// so older links and printed IDs keep working after a merge.
// Candidate duplicate groups for cleanup (Admin only). Grouped by
// { namePhonetic, sex } — the same "medium confidence" signal used at
// creation time — so this specifically surfaces the near-duplicates that got
// through creation via force:true, not families sharing a phone number
// (which is a normal, expected case, not something to flag for merging).
// Declared before GET /:id so "duplicates" is never swallowed as an :id param.
router.get('/duplicates', [isAuthenticated, isAdmin], async (req, res) => {
  try {
    const groups = await Patient.aggregate([
      { $match: { mergedInto: null, isActive: true, namePhonetic: { $ne: '' } } },
      {
        $group: {
          _id: { namePhonetic: '$namePhonetic', sex: '$sex' },
          ids: { $push: '$_id' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gte: 2 } } },
      { $sort: { count: -1 } },
      { $limit: 50 },
    ]);

    const allIds = groups.flatMap((g) => g.ids);
    const patients = allIds.length ? await Patient.find({ _id: { $in: allIds } }) : [];
    const byId = new Map(patients.map((p) => [String(p._id), p]));

    const data = groups
      .map((g) => {
        const members = g.ids
          .map((id) => byId.get(String(id)))
          .filter(Boolean)
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        if (members.length < 2) return null;

        const names = new Set(members.map((m) => m.nameNormalized));
        const sharesPhone =
          members.every((m) => m.phoneNormalized) &&
          new Set(members.map((m) => m.phoneNormalized)).size === 1;

        return {
          key: `${g._id.namePhonetic}-${g._id.sex}`,
          reason: names.size === 1 ? 'Same name' : 'Similar-sounding names',
          sharesPhone,
          patients: members.map(publicPatient),
        };
      })
      .filter(Boolean);

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error finding duplicate patients:', error);
    res.status(500).json({ success: false, message: 'Failed to find duplicate patients' });
  }
});

router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    if (patient.mergedInto) {
      const survivor = await Patient.findById(patient.mergedInto);
      if (survivor) {
        return res.json({
          success: true,
          data: publicPatient(survivor),
          mergedFrom: publicPatient(patient),
        });
      }
    }

    res.json({ success: true, data: publicPatient(patient) });
  } catch (error) {
    if (error?.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    console.error('Error fetching patient:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch patient' });
  }
});

// That patient's complete report history, newest first.
router.get('/:id/reports', isAuthenticated, async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req);
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }

    // Follow the tombstone, so a merged patient's page shows the reports that
    // moved to the survivor rather than an empty history.
    const targetId = patient.mergedInto || patient._id;
    const filter = { patientId: targetId };

    const [reports, total] = await Promise.all([
      Report.find(filter)
        .select('_id reportTypeId reportTypeCode patientInfo status createdAt updatedAt signatures technician')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Report.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: reports,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    if (error?.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    console.error('Error fetching patient reports:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch patient reports' });
  }
});

// Update. Never touches any report's patientInfo snapshot — a signed report
// keeps rendering the details it was signed against, by design.
// Merge one patient into another (Admin only). Every report belonging to the
// source is re-pointed at the target's patientId; the source becomes a
// tombstone (mergedInto set, deactivated) rather than being deleted, so any
// existing link — a bookmark, a printed patient ID, another report's
// patientId before this call resolves it — keeps working via GET /:id's
// tombstone-following.
//
// What this deliberately does NOT do: touch any report's patientInfo
// snapshot, or reconcile which record's phone/email/address "wins". A signed
// report keeps rendering exactly what it was signed against regardless of
// which patient record now owns the link — merging is a correction to
// identity bookkeeping, not a rewrite of history.
router.post('/:id/merge', [isAuthenticated, isAdmin], async (req, res) => {
  try {
    const { targetId } = req.body || {};
    if (!targetId) {
      return res.status(400).json({ success: false, message: 'targetId is required' });
    }

    const source = await Patient.findById(req.params.id);
    if (!source) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    if (source.mergedInto) {
      return res.status(400).json({ success: false, message: 'This record has already been merged' });
    }

    let target = await Patient.findById(targetId);
    if (!target) {
      return res.status(400).json({ success: false, message: 'Target patient could not be found' });
    }

    // Resolve the target to its ultimate survivor, so merging into an
    // already-merged record lands on the real destination rather than
    // building a chain of tombstones. Bounded by a visited-set in case of a
    // cycle, which normal operation can never produce but a bug shouldn't be
    // allowed to loop on.
    const visited = new Set();
    while (target.mergedInto) {
      if (visited.has(String(target._id))) break;
      visited.add(String(target._id));
      const next = await Patient.findById(target.mergedInto);
      if (!next) break;
      target = next;
    }

    if (String(target._id) === String(source._id)) {
      return res.status(400).json({ success: false, message: "Can't merge a patient into themselves" });
    }

    const moveResult = await Report.updateMany(
      { patientId: source._id },
      { $set: { patientId: target._id } }
    );

    source.mergedInto = target._id;
    source.isActive = false;
    source.updatedBy = actorSnapshot(req.user);
    await source.save();

    await logEvent({
      actor: req.user,
      action: 'patient.merge',
      category: 'Patient',
      description: `Merged ${source.name} (${source.patientId}) into ${target.name} (${target.patientId}) — ${moveResult.modifiedCount} report(s) moved`,
      targetType: 'Patient',
      targetId: target._id,
    });

    res.json({
      success: true,
      data: {
        survivor: publicPatient(target),
        merged: publicPatient(source),
        reportsMoved: moveResult.modifiedCount,
      },
    });
  } catch (error) {
    if (error?.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid patient id' });
    }
    console.error('Error merging patients:', error);
    res.status(500).json({ success: false, message: 'Failed to merge patients' });
  }
});

router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    if (patient.mergedInto) {
      return res.status(400).json({
        success: false,
        message: 'This record was merged into another patient — edit that one instead',
      });
    }

    const { name, phone, email, sex, dob, ageYears, address, notes, isActive } = req.body || {};

    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.status(400).json({ success: false, message: 'Patient name is required' });
      }
      patient.name = String(name).trim();
    }
    if (sex !== undefined) {
      if (!['male', 'female', 'other'].includes(sex)) {
        return res.status(400).json({ success: false, message: 'Sex must be male, female or other' });
      }
      patient.sex = sex;
    }
    if (dob !== undefined) {
      if (dob && !isValidDobString(dob)) {
        return res.status(400).json({ success: false, message: "That date of birth isn't a valid date" });
      }
      if (dob && new Date(dob) > new Date()) {
        return res.status(400).json({ success: false, message: "Date of birth can't be in the future" });
      }
      patient.dob = dob || null;
      // A known DOB supersedes the recorded-age fallback outright.
      if (dob) {
        patient.ageYears = null;
        patient.ageRecordedAt = null;
      }
    }
    if (ageYears !== undefined && !patient.dob) {
      if (ageYears != null && (Number.isNaN(Number(ageYears)) || Number(ageYears) < 0 || Number(ageYears) > 150)) {
        return res.status(400).json({ success: false, message: 'Age must be between 0 and 150' });
      }
      patient.ageYears = ageYears == null ? null : Number(ageYears);
      patient.ageRecordedAt = ageYears == null ? null : new Date();
    }
    if (phone !== undefined) {
      if (phone && !isValidPhone(phone)) {
        return res.status(400).json({ success: false, message: 'Mobile number must be exactly 10 digits' });
      }
      patient.phone = phone ? String(phone).trim() : null;
    }
    if (email !== undefined) {
      if (email && !isValidEmail(email)) {
        return res.status(400).json({ success: false, message: "That doesn't look like a valid email address" });
      }
      patient.email = email ? String(email).trim() : null;
    }
    if (address !== undefined) patient.address = address || null;
    if (notes !== undefined) patient.notes = notes || null;
    if (isActive !== undefined) patient.isActive = !!isActive;

    patient.updatedBy = actorSnapshot(req.user);
    await patient.save();

    await logEvent({
      actor: req.user,
      action: 'patient.update',
      category: 'Patient',
      description: `Updated ${patient.name} (${patient.patientId})`,
      targetType: 'Patient',
      targetId: patient._id,
    });

    res.json({ success: true, data: publicPatient(patient) });
  } catch (error) {
    if (error?.name === 'CastError') {
      return res.status(404).json({ success: false, message: 'Patient not found' });
    }
    console.error('Error updating patient:', error);
    res.status(500).json({ success: false, message: 'Failed to update patient' });
  }
});

module.exports = router;
