// Customer request schemas. Mirrors sale.validator gstin/objectId style.
const { z } = require('zod');
const { INDIAN_STATES } = require('../constants/indianStates');

const objectId   = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID');
const gstinRegex = /^[0-9A-Z]{15}$/;
// Accept any of: 10-digit, +91 prefix, 91 prefix, with optional spaces/dashes.
// Final normalized form is +91XXXXXXXXXX (controller normalises before save).
const phoneInputRegex = /^(\+?91[\s-]?)?[6-9]\d{9}$/;
const pinRegex   = /^\d{6}$/;
const stateEnum  = z.enum(['', ...INDIAN_STATES]);

const baseFields = {
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().regex(phoneInputRegex, 'Invalid Indian mobile number').optional().or(z.literal('')),
  email: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  gstin: z.string().trim().regex(gstinRegex, 'Invalid GSTIN (15 chars, A-Z and 0-9)').optional().or(z.literal('')),
  addressLine1: z.string().trim().max(200).optional().or(z.literal('')),
  addressLine2: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  state: stateEnum.optional(),
  pinCode: z.string().trim().regex(pinRegex, 'PIN must be 6 digits').optional().or(z.literal('')),
  creditLimit: z.number().gte(0).optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
  tags: z.array(z.string().max(30)).max(10).optional(),
};

exports.createCustomerSchema = z.object({
  ...baseFields,
  openingBalance: z.number().finite().optional(),
});

// Disallow openingBalance on PATCH — corrections must go through Adjustment so
// the ledger stays in sync. (E15)
exports.updateCustomerSchema = z.object({
  ...baseFields,
  isActive: z.boolean().optional(),
  openingBalance: z.never({ invalid_type_error: 'Use an Adjustment to correct opening balance' }).optional(),
}).partial();

// Normalize a phone string to +91XXXXXXXXXX, return '' if empty.
// Rejects landline-style leading-0 numbers (E14).
exports.normalizePhone = (raw) => {
  if (!raw) return '';
  const cleaned = String(raw).replace(/[\s-]/g, '').trim();
  if (!cleaned) return '';
  if (/^0/.test(cleaned)) throw new Error('Landline-style leading 0 not supported; use 10-digit mobile');
  const match = cleaned.match(/^(?:\+?91)?([6-9]\d{9})$/);
  if (!match) throw new Error('Invalid Indian mobile number');
  return `+91${match[1]}`;
};
