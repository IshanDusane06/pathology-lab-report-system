// One-time migration: rewrites Report.status from the old flat-shape
// { status: 'pending'|'verified'|..., actionTakenBy } to the new
// { value: 'draft'|'pendingApproval'|..., updatedBy, updatedAt, remarks }
// shape, and backfills a legacy `signatures[]` entry for anything already
// 'verified' (marked distinguishably — no real content hash/HMAC can be
// computed retroactively, so never claim cryptographic integrity for these).
//
// Uses the raw MongoDB driver (not the Mongoose model) so this is safe to run
// regardless of exactly when models/Report.js's schema change lands relative
// to this script — it doesn't go through Mongoose casting either way.
require('dotenv').config();
const mongoose = require('mongoose');

const STATUS_MAP = {
  pending: 'pendingApproval',
  verified: 'signed',
  rejected: 'rejected',
  requestChange: 'changesRequested',
  completed: 'pendingApproval', // dead value — no live code path ever set this
};

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  const reports = mongoose.connection.db.collection('reports');

  const cursor = reports.find({});
  let migrated = 0;
  let skipped = 0;
  const ops = [];

  for await (const doc of cursor) {
    const oldValue = doc.status && doc.status.status;
    const alreadyMigrated = doc.status && doc.status.value;

    if (!oldValue || alreadyMigrated) {
      skipped++;
      continue;
    }

    const newValue = STATUS_MAP[oldValue] || 'draft';

    const set = {
      status: {
        value: newValue,
        updatedBy: {
          userId: (doc.doctor && doc.doctor.userId) || (doc.technician && doc.technician.userId) || null,
          name:
            (doc.status && doc.status.actionTakenBy) ||
            (doc.doctor && doc.doctor.name) ||
            (doc.technician && doc.technician.name) ||
            null,
          role: doc.doctor && doc.doctor.userId ? 'Doctor' : 'Technician',
        },
        updatedAt: doc.verifiedAt || doc.updatedAt || doc.createdAt || new Date(),
        remarks: doc.remarks || null,
      },
    };

    if (newValue === 'signed') {
      set.signatures = [
        {
          signedBy: {
            userId: (doc.doctor && doc.doctor.userId) || null,
            name: (doc.doctor && doc.doctor.name) || null,
            role: 'Doctor',
          },
          signedAt: doc.verifiedAt || doc.updatedAt || doc.createdAt || new Date(),
          contentHash: null,
          hmac: null,
          algorithm: 'legacy-backfill',
          invalidatedAt: null,
          invalidatedReason: null,
        },
      ];
    }

    ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: set } } });
    migrated++;
  }

  if (ops.length) {
    await reports.bulkWrite(ops);
  }

  console.log(
    `Migration complete: ${migrated} report(s) migrated, ${skipped} skipped (already migrated or no recognizable old status).`
  );
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
