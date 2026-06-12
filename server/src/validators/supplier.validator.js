// Supplier request schemas. | spec: B2
const { z } = require('zod');

const gstinRegex = /^[0-9A-Z]{15}$/;

// Strip HTML tags and cap length on free-form string fields. | bug #011.4, #011.5
const stripHtml = (v) => (typeof v === 'string' ? v.replace(/<[^>]*>/g, '').trim() : v);

const baseShape = {
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(120, 'Name must be 120 characters or fewer')
    .transform(stripHtml)
    .refine((v) => v.length >= 1, 'Name is required'),
  contactPerson: z.string().trim().max(120).transform(stripHtml).optional(),
  email: z
    .string()
    .trim()
    .email('Invalid email')
    .optional()
    .or(z.literal('')),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(500).transform(stripHtml).optional(),
  gst: z
    .string()
    .trim()
    .regex(gstinRegex, 'Invalid GSTIN (must be 15 chars, A-Z and 0-9)')
    .optional()
    .or(z.literal('')),
};

exports.createSupplierSchema = z.object(baseShape);

exports.updateSupplierSchema = z
  .object({
    ...baseShape,
    name: baseShape.name.optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field is required',
  });
