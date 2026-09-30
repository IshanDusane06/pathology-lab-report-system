// One-time index setup for the Patient Management Module.
//
// This script creates indexes and TOUCHES NO DOCUMENTS. That is deliberate:
// existing reports are left unlinked (patientId: null) rather than having a
// script guess which of eleven same-named rows are the same human. Linking a
// historical report is a human decision, made on demand from the report
// itself.
//
// Uses the raw MongoDB driver rather than the Mongoose models, for the same
// reason migrate-report-status.js does: it stays correct regardless of when
// the schema changes land relative to this script. Idempotent — createIndex
// is a no-op when an identical index already exists, so re-running is safe.
require('dotenv').config();
const mongoose = require('mongoose');

const INDEXES = [
  // Patient identity and search. Every one of these backs a specific query in
  // routes/patients.js; none is speculative.
  { collection: 'patients', key: { patientId: 1 }, options: { unique: true } },
  { collection: 'patients', key: { phoneNormalized: 1 }, options: {} },
  { collection: 'patients', key: { nameNormalized: 1 }, options: {} },
  { collection: 'patients', key: { namePhonetic: 1, sex: 1 }, options: {} },
  { collection: 'patients', key: { createdAt: -1 }, options: {} },

  // Patient report history (Phase 2 populates patientId; the index is
  // created now so it's in place before the first write).
  { collection: 'reports', key: { patientId: 1, createdAt: -1 }, options: {} },

  // Pre-existing gap, fixed while this collection is being touched: the
  // verification queue and every status filter query status.value and sort by
  // createdAt, with no index behind either today.
  { collection: 'reports', key: { 'status.value': 1, createdAt: -1 }, options: {} },
];

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  let created = 0;
  let existing = 0;

  for (const spec of INDEXES) {
    const collection = db.collection(spec.collection);
    const before = await collection.indexes().catch(() => []);
    const beforeNames = new Set(before.map((i) => i.name));

    // Default (server-assigned) names, so this agrees with whatever Mongoose's
    // own autoIndex already built from the schema rather than colliding with it.
    const name = await collection.createIndex(spec.key, spec.options);

    if (beforeNames.has(name)) {
      existing += 1;
      console.log(`  = ${spec.collection}.${name} (already present)`);
    } else {
      created += 1;
      console.log(`  + ${spec.collection}.${name}`);
    }
  }

  console.log(`\nIndexes created: ${created}, already present: ${existing}`);
  console.log('Documents modified: 0 (by design — existing reports stay unlinked)');

  await mongoose.disconnect();
}

migrate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Index migration failed:', error);
    process.exit(1);
  });
