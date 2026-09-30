const mongoose = require('mongoose');

// Atomic named sequences. The only consumer today is patient ID allocation,
// where two technicians registering someone at the same moment must never be
// handed the same number. A single findOneAndUpdate with $inc is atomic in
// MongoDB, so this needs no lock, no transaction and no retry loop.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

counterSchema.statics.next = async function next(name) {
  const doc = await this.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return doc.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
