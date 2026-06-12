'use strict';

// Sale request schemas — chunk #3 scale-mode body + legacy compat.
// spec: setup-flow-and-units.md §B.4, chunk #3

const { z } = require('zod');

const objectId   = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId');
const gstinRegex = /^[0-9A-Z]{15}$/;

// ── New scale-mode line item ──────────────────────────────────────────────────
// qty and enteredAmount are string or number (Decimal128 string is preferred).
const scaleModeLineSchema = z.object({
  productId:     objectId,
  qty:           z.union([z.string(), z.number()]).optional(),
  tareApplied:   z.union([z.string(), z.number()]).optional(),
  amountFirst:   z.boolean().default(false),
  enteredAmount: z.union([z.string(), z.number()]).optional().nullable(),
  hsnCode:       z.string().trim().optional(),
}).refine(
  (v) => v.amountFirst ? v.enteredAmount != null : v.qty != null,
  { message: 'qty is required when amountFirst is false; enteredAmount is required when amountFirst is true' }
);

// ── Legacy integer line item (kept for 90-day compat) ─────────────────────────
const legacyLineSchema = z.object({
  productId: objectId,
  quantity:  z.number({ invalid_type_error: 'Quantity must be a number' })
               .int('Quantity must be an integer')
               .gt(0, 'Quantity must be greater than 0'),
  unitPrice: z.number({ invalid_type_error: 'unitPrice must be a number' })
               .gte(0, 'unitPrice must be 0 or greater')
               .optional(),
  hsnCode:   z.string().trim().optional(),
});

// ── Shared sub-schemas ────────────────────────────────────────────────────────
const customerSchema = z.object({
  name:    z.string().trim().optional(),
  email:   z.string().trim().email('Invalid email').optional().or(z.literal('')),
  phone:   z.string().trim().optional(),
  gstin:   z.string().trim().regex(gstinRegex, 'Invalid GSTIN').optional().or(z.literal('')),
  address: z.string().trim().optional(),
  state:   z.string().trim().optional(),
}).partial().optional();

const paymentSchema = z.object({
  mode:     z.enum(['cash', 'upi', 'bank', 'cheque', 'card', 'credit']).optional(),
  received: z.union([z.string(), z.number()]).optional().nullable(),
}).optional();

// ── createSaleSchema — accepts either new `lines` or legacy `items` ───────────
exports.createSaleSchema = z.object({
  // New scale-mode lines (preferred)
  lines:    z.array(scaleModeLineSchema).min(1).optional(),
  // Legacy integer items (90-day compat)
  items:    z.array(legacyLineSchema).optional(),

  customer:    customerSchema,
  payment:     paymentSchema,

  // Legacy fields
  seller:      z.object({
    companyName: z.string().trim().optional(),
    gstin: z.string().trim().regex(gstinRegex).optional().or(z.literal('')),
    address: z.string().trim().optional(),
    state:   z.string().trim().optional(),
  }).partial().optional(),
  gst: z.object({
    isInterstate: z.boolean(),
    cgstRate:     z.number().gte(0).lte(28).optional(),
    sgstRate:     z.number().gte(0).lte(28).optional(),
    igstRate:     z.number().gte(0).lte(28).optional(),
  }).optional(),
  taxRate:     z.number().gte(0).lte(28).optional(),
  discount:    z.number().gte(0).optional(),
  notes:       z.string().trim().max(2000).optional(),
  paymentMode: z.enum(['cash', 'upi', 'bank', 'cheque', 'card', 'credit']).optional(),
}).refine(
  (v) => !!(v.lines?.length || v.items?.length),
  { message: 'Either lines or items must be provided with at least one entry', path: ['lines'] }
).transform((v) => {
  // Normalise legacy items → lines so the controller only sees `lines`
  if (!v.lines?.length && v.items?.length) {
    v.lines = v.items.map((it) => ({
      productId:   it.productId,
      qty:         String(it.quantity),
      amountFirst: false,
    }));
  }
  return v;
});

// ── previewSaleSchema — identical body shape to createSaleSchema ──────────────
exports.previewSaleSchema = exports.createSaleSchema;

// ── refundSaleSchema ──────────────────────────────────────────────────────────
exports.refundSaleSchema = z.object({
  lines: z.array(z.object({
    saleLineId: objectId,
    qty:        z.union([z.string(), z.number()]),
  })).min(1, 'Refund must specify at least one line'),
});
