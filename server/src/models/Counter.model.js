// Atomic sequence allocator for invoice numbers (and any future counters). | spec: C3, bug #009
// _id is namespaced (e.g. "invoice-2026"); seq is monotonically incremented via
// findOneAndUpdate({_id}, {$inc:{seq:1}}, {upsert:true, new:true}) which is
// atomic at the document level on MongoDB.
const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model('Counter', counterSchema);
