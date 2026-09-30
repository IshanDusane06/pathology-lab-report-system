const express = require('express');
const router = express.Router();
const ReportType = require('../models/ReportType');
const Report = require('../models/Report');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { logEvent } = require('../utils/auditLog');
const { sanitizeRemarks } = require('../utils/sanitizeRemarks');

function parsePagination(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

function validateUniqueSectionKeys(sections) {
  if (!sections || !sections.length) return true;
  const keys = sections.map((s) => s.key);
  return new Set(keys).size === keys.length;
}

// The report-filling form (both create and edit) and the signed-report
// renderer all key a parameter's value by its `name` — there's no separate
// stable identifier threaded through that pipeline. Two parameters sharing a
// name therefore silently collapse into one shared value the instant a
// report is filled in: editing one edits both, and a signed report renders
// the same text for both rows. Blocking the duplicate here, at the one place
// names are actually chosen, is far safer than trying to make every
// consumer (data entry, PDF/print rendering, the signature content hash)
// tolerate duplicate names instead.
function findDuplicateParameterName(parameters) {
  if (!parameters || !parameters.length) return null;
  const seen = new Set();
  for (const p of parameters) {
    const name = (p?.name || '').trim();
    if (!name) continue;
    if (seen.has(name)) return name;
    seen.add(name);
  }
  return null;
}

// A parameter left unnamed (e.g. an "+ Add parameter" row nobody filled in)
// isn't caught by findDuplicateParameterName above — it explicitly skips
// blank names, since a blank name isn't a duplicate of anything. Without this
// separate check, an unnamed parameter reaches the DB write, where the
// schema's `required: true` on `name` throws a Mongoose ValidationError that
// the route's catch block turns into an opaque 500.
function hasBlankParameterName(parameters) {
  if (!parameters || !parameters.length) return false;
  return parameters.some((p) => !(p?.name || '').trim());
}

// Same "one name = one value" hazard as findDuplicateParameterName above,
// one level deeper: a `breakdown` parameter's sub-fields are looked up by
// their own label (report-fill UI, read-only rendering), so a blank or
// duplicate sub-field label within one parameter would silently collapse two
// sub-items into one value. Returns a message describing the first problem
// found, or null if every breakdown parameter's sub-fields are well-formed.
function findBreakdownSubFieldIssue(parameters) {
  if (!parameters || !parameters.length) return null;
  for (const p of parameters) {
    if (p?.type !== 'breakdown') continue;
    const subFields = p.subFields || [];
    const paramName = p.name || 'a breakdown parameter';
    const seen = new Set();
    for (const sf of subFields) {
      const label = (sf?.label || '').trim();
      if (!label) {
        return `"${paramName}" has a sub-item with no label — every sub-item needs one before you can save.`;
      }
      if (seen.has(label)) {
        return `"${paramName}" has two sub-items both named "${label}" — give each a distinct label, or the report form won't be able to tell them apart.`;
      }
      seen.add(label);
    }
  }
  return null;
}

// Each section can carry its own rich-text defaultRemarks (section-wise
// remarks mode) — sanitize every one of them, same as the template's
// top-level defaultRemarks, since both are user-authored HTML.
function sanitizeSections(sections) {
  if (!sections || !sections.length) return sections;
  return sections.map((s) => ({
    ...s,
    defaultRemarks: 'defaultRemarks' in s ? sanitizeRemarks(s.defaultRemarks) : s.defaultRemarks
  }));
}

// Get all report types
router.get('/', async (req, res) => {
  try {
    const reportTypes = await ReportType.find({ isActive: true })
      .sort({ name: 1 });

    res.json({
      success: true,
      data: reportTypes
    });
  } catch (error) {
    console.error('Error fetching report types:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch report types'
    });
  }
});

// Get all report types, including drafts (Admin only) — paginated. Placed
// before GET /:id so "admin" isn't swallowed as an :id param.
router.get('/admin', [isAuthenticated, isAdmin], async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req);
    const filter = {};
    if (req.query.search) {
      const re = new RegExp(req.query.search.trim(), 'i');
      filter.$or = [{ name: re }, { code: re }];
    }
    if (req.query.status === 'active') filter.isActive = true;
    else if (req.query.status === 'draft') filter.isActive = false;

    const [reportTypes, total] = await Promise.all([
      ReportType.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
      ReportType.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: reportTypes,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error('Error fetching report types (admin):', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch report types'
    });
  }
});

// Get a specific report type
router.get('/:id', async (req, res) => {
  try {
    const reportType = await ReportType.findById(req.params.id);

    if (!reportType) {
      return res.status(404).json({
        success: false,
        message: 'Report type not found'
      });
    }

    res.json({
      success: true,
      data: reportType
    });
  } catch (error) {
    console.error('Error fetching report type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch report type'
    });
  }
});

// Create a new report type (Admin only)
router.post('/', [isAuthenticated, isAdmin], async (req, res) => {
  try {
    const { name, description, code, parameters, sections, method, defaultRemarks, sectionWiseRemarks, sectionWiseMethod } = req.body;

    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: 'Name and code are required'
      });
    }

    if (!validateUniqueSectionKeys(sections)) {
      return res.status(400).json({
        success: false,
        message: 'Section keys must be unique within a report type'
      });
    }

    if (hasBlankParameterName(parameters)) {
      return res.status(400).json({
        success: false,
        message: 'Every parameter needs a name — fill in the blank one before saving.'
      });
    }

    const duplicateParamName = findDuplicateParameterName(parameters);
    if (duplicateParamName) {
      return res.status(400).json({
        success: false,
        message: `Two parameters are both named "${duplicateParamName}" — give each parameter a distinct name, or the report form won't be able to tell them apart.`
      });
    }

    const breakdownIssue = findBreakdownSubFieldIssue(parameters);
    if (breakdownIssue) {
      return res.status(400).json({ success: false, message: breakdownIssue });
    }

    // Check if code already exists
    const existingType = await ReportType.findOne({ code: code.toLowerCase() });
    if (existingType) {
      return res.status(400).json({
        success: false,
        message: 'Report type code already exists'
      });
    }

    const reportType = new ReportType({
      name,
      description,
      code: code.toLowerCase(),
      parameters,
      sections: sanitizeSections(sections),
      method,
      defaultRemarks: sanitizeRemarks(defaultRemarks),
      sectionWiseRemarks,
      sectionWiseMethod
    });

    await reportType.save();

    await logEvent({
      actor: req.user,
      action: 'reportType.create',
      category: 'Template',
      description: `Created ${reportType.name} template${reportType.isActive ? '' : ' (draft)'}`,
      targetType: 'ReportType',
      targetId: reportType._id,
    });

    res.status(201).json({
      success: true,
      message: 'Report type created successfully',
      data: reportType
    });
  } catch (error) {
    console.error('Error creating report type:', error);
    // A schema requirement we haven't specifically checked above (e.g. some
    // future required field) still shouldn't surface as an opaque 500 —
    // Mongoose's own message says exactly what's missing/invalid.
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to create report type'
    });
  }
});

// Update a report type (Admin only)
router.put('/:id', [isAuthenticated, isAdmin], async (req, res) => {
  try {
    const updates = req.body;
    if ('defaultRemarks' in updates) {
      updates.defaultRemarks = sanitizeRemarks(updates.defaultRemarks);
    }
    if ('sections' in updates) {
      updates.sections = sanitizeSections(updates.sections);
    }

    if (!validateUniqueSectionKeys(updates.sections)) {
      return res.status(400).json({
        success: false,
        message: 'Section keys must be unique within a report type'
      });
    }

    if (hasBlankParameterName(updates.parameters)) {
      return res.status(400).json({
        success: false,
        message: 'Every parameter needs a name — fill in the blank one before saving.'
      });
    }

    const duplicateParamName = findDuplicateParameterName(updates.parameters);
    if (duplicateParamName) {
      return res.status(400).json({
        success: false,
        message: `Two parameters are both named "${duplicateParamName}" — give each parameter a distinct name, or the report form won't be able to tell them apart.`
      });
    }

    const breakdownIssue = findBreakdownSubFieldIssue(updates.parameters);
    if (breakdownIssue) {
      return res.status(400).json({ success: false, message: breakdownIssue });
    }

    const before = await ReportType.findById(req.params.id);
    if (!before) {
      return res.status(404).json({
        success: false,
        message: 'Report type not found'
      });
    }

    const updatedType = await ReportType.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    if ('isActive' in updates && updates.isActive !== before.isActive) {
      await logEvent({
        actor: req.user,
        action: 'reportType.setActive',
        category: 'Template',
        description: `Set ${updatedType.name} template to ${updatedType.isActive ? 'active' : 'draft'}`,
        targetType: 'ReportType',
        targetId: updatedType._id,
      });
    } else {
      await logEvent({
        actor: req.user,
        action: 'reportType.update',
        category: 'Template',
        description: `Edited ${updatedType.name} template`,
        targetType: 'ReportType',
        targetId: updatedType._id,
      });
    }

    res.json({
      success: true,
      message: 'Report type updated successfully',
      data: updatedType
    });
  } catch (error) {
    console.error('Error updating report type:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to update report type'
    });
  }
});

// Delete a report type (Admin only) — a real, permanent delete, guarded
// against removing a template that real reports still reference (their
// rendering live-joins the template for parameter definitions, method,
// default remarks, and reference ranges). Use PUT { isActive: false }
// ("Set to draft") to retire a template that's actually been used.
router.delete('/:id', [isAuthenticated, isAdmin], async (req, res) => {
  try {
    const reportType = await ReportType.findById(req.params.id);
    if (!reportType) {
      return res.status(404).json({
        success: false,
        message: 'Report type not found'
      });
    }

    const usageCount = await Report.countDocuments({ reportTypeId: req.params.id });
    if (usageCount > 0) {
      return res.status(400).json({
        success: false,
        message: `This template has been used by ${usageCount} report(s) — set it to draft instead of deleting it.`
      });
    }

    await ReportType.findByIdAndDelete(req.params.id);

    await logEvent({
      actor: req.user,
      action: 'reportType.delete',
      category: 'Template',
      description: `Deleted ${reportType.name} template`,
      targetType: 'ReportType',
      targetId: reportType._id,
    });

    res.json({
      success: true,
      message: 'Report type deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting report type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete report type'
    });
  }
});

module.exports = router;
