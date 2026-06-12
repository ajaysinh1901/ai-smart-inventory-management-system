const mongoose = require('mongoose');

// A2-07 fix: added schema-level validators so Zod bypass cannot write corrupt data | spec: supplier-schema.md
const supplierSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Supplier name is required'],
    trim: true,
    minlength: [1, 'Name must be at least 1 character'],
    maxlength: [120, 'Name must be 120 characters or fewer'],
  },
  contactPerson: {
    type: String,
    trim: true,
    maxlength: [120, 'Contact person name must be 120 characters or fewer'],
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      message: 'Invalid email address format',
    },
  },
  phone: {
    type: String,
    trim: true,
    maxlength: [20, 'Phone must be 20 characters or fewer'],
  },
  address: {
    type: String,
    trim: true,
    maxlength: [300, 'Address must be 300 characters or fewer'],
  },
  // gst stores the 15-character GSTIN — format: 2-digit state code + 10-char PAN + 3 chars
  gst: {
    type: String,
    trim: true,
    uppercase: true,
    validate: {
      validator: (v) => !v || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v),
      message: 'GSTIN must be a valid 15-character GST Identification Number',
    },
  },
}, { timestamps: true });

module.exports = mongoose.model('Supplier', supplierSchema);
