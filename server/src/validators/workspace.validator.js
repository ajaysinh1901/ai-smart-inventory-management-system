// Zod schemas for workspace and onboarding request bodies.
// spec: setup-flow-and-units.md §A, §B.8, §C.2, §C.5
'use strict';

const { z } = require('zod');

// ---------------------------------------------------------------------------
// Shared regex constants
// ---------------------------------------------------------------------------

// Standard 15-character GSTIN format — matches GST Portal spec.
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// VPA (Virtual Payment Address) shape: <handle>@<provider>
// Allows alphanumeric, dots, hyphens, underscores before @.
const UPI_REGEX = /^[\w.\-]+@[\w]+$/;

// All 28 states + 8 UTs registered under GST — canonical names from
// GST Portal / CBIC. State value on workspace must match one of these
// so CGST/SGST vs IGST determination is unambiguous.
const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  // Union Territories
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
];

// ---------------------------------------------------------------------------
// PATCH /workspace — partial workspace update
// ---------------------------------------------------------------------------

// Strict schema: any key not in this list will cause Zod to reject with 400.
// This guards against typo-keys silently being ignored.
exports.patchWorkspaceSchema = z
  .object({
    companyName:      z.string().trim().optional(),
    industry:         z.string().trim().optional(),
    website:          z.string().trim().url('Must be a valid URL').optional().or(z.literal('')),
    timezone:         z.string().trim().optional(),
    description:      z.string().trim().optional(),
    gstin:            z
      .string()
      .transform(v => v.trim().toUpperCase())
      .refine(v => v === '' || GSTIN_REGEX.test(v), {
        message: 'Invalid GSTIN. Must be 15 chars, e.g. 27AAPFU0939F1ZV',
      })
      .optional(),
    address:          z.string().trim().optional(),
    state:            z
      .string()
      .refine(v => v === '' || INDIAN_STATES.includes(v), {
        message: 'state must be a valid Indian state or union territory name',
      })
      .optional(),
    pinCode:          z.string().trim().optional(),
    upiId:            z
      .string()
      .refine(v => v === '' || UPI_REGEX.test(v.trim()), {
        message: 'Invalid UPI ID. Use format like yourstore@upi or 9876543210@ybl',
      })
      .optional(),
    payeeName:        z.string().trim().optional(),
    storeProfile:     z.enum(['small', 'big']).optional(),
    storeType:        z.enum(['kirana', 'pharmacy', 'general', 'wholesale', 'restaurant', 'other']).optional(),
    defaultLang:      z.enum(['en', 'hi', 'gu']).optional(),
    gstRegistered:    z.boolean().optional(),
    legalName:        z.string().trim().optional(),
    fyStart:          z.string().regex(/^\d{2}-\d{2}$/, 'fyStart must be MM-DD format').optional(),
    bankLast4:        z.string().max(4).regex(/^\d{0,4}$/, 'bankLast4 must be up to 4 digits').optional(),
    eInvoiceEnabled:  z.boolean().optional(),
    weightDisplay:    z.enum(['mixed', 'decimal']).optional(),
    paiseDisplay:     z.boolean().optional(),
  })
  .strict(); // rejects unknown keys → 400

// ---------------------------------------------------------------------------
// PATCH /workspace/onboarding — step progress + optional stepData
// ---------------------------------------------------------------------------

// Per-step field whitelists.  Any key outside these lists is rejected with 400.
// spec: §C.2 step table + deliverable B per-step whitelist.
const STEP_WHITELISTS = {
  1: ['companyName', 'storeType', 'storeProfile', 'defaultLang', 'state'],
  2: ['gstin', 'legalName', 'address', 'fyStart', 'gstRegistered', 'eInvoiceEnabled'],
  3: ['upiId', 'bankLast4'],
  4: ['sampleSeedUsed'],
  5: [], // handled by /transactions
  6: [], // handled by /suppliers
  7: [], // handled by /sales
};

// stepData sub-schemas per step (zod-validated per the whitelist above).
const stepDataSchemas = {
  1: z.object({
    companyName:  z.string().trim().optional(),
    storeType:    z.enum(['kirana', 'pharmacy', 'general', 'wholesale', 'restaurant', 'other']).optional(),
    storeProfile: z.enum(['small', 'big']).optional(),
    defaultLang:  z.enum(['en', 'hi', 'gu']).optional(),
    state:        z
      .string()
      .refine(v => v === '' || INDIAN_STATES.includes(v), {
        message: 'state must be a valid Indian state or union territory name',
      })
      .optional(),
  }).strict(),
  2: z.object({
    gstin:           z
      .string()
      .transform(v => v.trim().toUpperCase())
      .refine(v => v === '' || GSTIN_REGEX.test(v), {
        message: 'Invalid GSTIN. Must be 15 chars, e.g. 27AAPFU0939F1ZV',
      })
      .optional(),
    legalName:       z.string().trim().optional(),
    address:         z.string().trim().optional(),
    fyStart:         z.string().regex(/^\d{2}-\d{2}$/, 'fyStart must be MM-DD format').optional(),
    gstRegistered:   z.boolean().optional(),
    eInvoiceEnabled: z.boolean().optional(),
  }).strict(),
  3: z.object({
    upiId:    z
      .string()
      .refine(v => v === '' || UPI_REGEX.test(v.trim()), {
        message: 'Invalid UPI ID. Use format like yourstore@upi',
      })
      .optional(),
    bankLast4: z.string().max(4).regex(/^\d{0,4}$/, 'bankLast4 must be up to 4 digits').optional(),
  }).strict(),
  4: z.object({
    sampleSeedUsed: z.enum(['kirana', 'pharmacy', 'general']).optional(),
  }).strict(),
  5: z.object({}).strict(),
  6: z.object({}).strict(),
  7: z.object({}).strict(),
};

// The PATCH /workspace/onboarding body.
// Accepts both `stepNumber` (spec naming) and `currentStep` (frontend naming).
// `complete` triggers completedAt = now.
// `dismissed` (sent by dismissOnboarding()) is also accepted here for the
// dismiss path that frontend calls via PATCH rather than POST.
exports.patchOnboardingSchema = z
  .object({
    stepNumber:     z.number().int().min(0).max(7).optional(),
    currentStep:    z.number().int().min(0).max(7).optional(),
    completedSteps: z.array(z.number().int().min(1).max(7)).optional(),
    complete:       z.boolean().optional(),
    dismissed:      z.boolean().optional(),
    stepData:       z.object({}).passthrough().optional(), // validated separately per step number
  })
  .strict();

// Export helpers used by the controller for per-step stepData validation.
exports.validateStepData = function validateStepData(stepNumber, rawData) {
  const schema = stepDataSchemas[stepNumber];
  if (!schema) {
    return { ok: false, message: `Unknown step number: ${stepNumber}` };
  }
  const result = schema.safeParse(rawData);
  if (!result.success) {
    const errors = result.error.issues.map(i => ({
      field:   i.path.join('.') || '(root)',
      message: i.message,
    }));
    return { ok: false, errors, message: 'Validation failed for stepData' };
  }
  return { ok: true, data: result.data };
};

// Export the full state list so the controller can reuse it if needed.
exports.INDIAN_STATES = INDIAN_STATES;
