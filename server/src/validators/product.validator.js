'use strict';

// Product request schemas — UoM migration (v2) | spec: product-uom-schema.md §6
// Legacy compat: POST/PUT with `price` / `lowStockThreshold` fields are
// accepted and mapped to `pricePerUnit` / `reorderLevel` via .transform.
// spec: §4.6 (legacy-API compat, 90-day deprecation window)

const { z } = require('zod');

// ---------------------------------------------------------------------------
// Shared field validators
// ---------------------------------------------------------------------------

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID');

// HTML-stripped, length-capped string
const safeShortString = (label, max) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`)
    .transform((v) => v.replace(/<[^>]*>/g, '').trim())
    .refine((v) => v.length >= 1, `${label} is required`);

const name = safeShortString('Name', 120);
const sku  = safeShortString('SKU', 64);
const category = safeShortString('Category', 80);

// pricePerUnit: number > 0; mapped from legacy `price` in transform
const pricePerUnit = z
  .number({ invalid_type_error: 'pricePerUnit must be a number' })
  .gt(0, 'pricePerUnit must be greater than 0');

// New: unit enum — lowercase only (spec §2.2.6)
const unit = z.enum(
  ['pcs', 'kg', 'g', 'l', 'ml', 'dozen', 'box', 'packet'],
  { errorMap: () => ({ message: 'unit must be one of: pcs, kg, g, l, ml, dozen, box, packet' }) }
);

// New: saleByWeight boolean
const saleByWeight = z.boolean({ invalid_type_error: 'saleByWeight must be a boolean' });

// stock: any number (integer or decimal), negative allowed (spec §2.3)
// Removed .int() per spec §6
const stock = z.number({ invalid_type_error: 'Stock must be a number' });

// reorderLevel: >= 0; mapped from legacy `lowStockThreshold`
const reorderLevel = z
  .number({ invalid_type_error: 'reorderLevel must be a number' })
  .gte(0, 'reorderLevel must be 0 or greater');

// New: tareWeight >= 0
const tareWeight = z
  .number({ invalid_type_error: 'tareWeight must be a number' })
  .gte(0, 'tareWeight must be >= 0');

// New: packSize > 0 or null
const packSize = z
  .number({ invalid_type_error: 'packSize must be a number' })
  .gt(0, 'packSize must be > 0')
  .nullable();

// hsnCode: 4/6/8 digits or empty
const hsnCode = z
  .string()
  .regex(/^(\d{4}|\d{6}|\d{8})?$/, 'hsnCode must be empty or 4, 6, or 8 digits')
  .optional();

// barcode: optional freeform string
const barcode = z.string().trim().optional();

// gstRate: whole-percent enum (0, 5, 12, 18, 28); optional — model defaults to 0.
// NEW-01 fix: without this field the validate middleware stripped gstRate from
// req.body, so every product saved at 0% → ₹0 GST on every invoice.
const gstRate = z
  .number({ invalid_type_error: 'gstRate must be a number' })
  .refine((v) => [0, 5, 12, 18, 28].includes(v), 'gstRate must be one of: 0, 5, 12, 18, 28')
  .optional();

// ---------------------------------------------------------------------------
// Legacy-field transform (spec §4.6)
// Maps `price` → `pricePerUnit` and `lowStockThreshold` → `reorderLevel`
// when the new fields are absent from the body.
// ---------------------------------------------------------------------------
function applyLegacyFieldMap(obj) {
  const out = { ...obj };

  // price → pricePerUnit (only when pricePerUnit absent)
  if (out.pricePerUnit === undefined && out.price !== undefined) {
    out.pricePerUnit = out.price;
  }
  delete out.price;

  // lowStockThreshold → reorderLevel (only when reorderLevel absent)
  if (out.reorderLevel === undefined && out.lowStockThreshold !== undefined) {
    out.reorderLevel = out.lowStockThreshold;
  }
  delete out.lowStockThreshold;

  return out;
}

// ---------------------------------------------------------------------------
// createProductSchema
// ---------------------------------------------------------------------------
exports.createProductSchema = z
  .object({
    name,
    sku,
    category,
    // New name — required. Also accepted as legacy `price`.
    pricePerUnit: pricePerUnit.optional(),
    // Legacy compat field — mapped to pricePerUnit in transform
    price: z.number({ invalid_type_error: 'price must be a number' }).gt(0).optional(),
    // New fields
    unit: unit.default('pcs'),
    saleByWeight: saleByWeight.default(false),
    stock: stock.default(0),
    // New name — also accepted as legacy `lowStockThreshold`
    reorderLevel: reorderLevel.optional(),
    // Legacy compat field
    lowStockThreshold: z.number().gte(0).optional(),
    // New fields
    tareWeight: tareWeight.optional(),
    packSize: packSize.optional(),
    hsnCode,
    barcode,
    gstRate,
    supplierId: objectId.optional().or(z.literal('').transform(() => undefined)),
    isSample: z.boolean().optional(),
  })
  .transform(applyLegacyFieldMap)
  .refine((obj) => obj.pricePerUnit !== undefined, {
    message: 'pricePerUnit (or legacy price) is required',
    path: ['pricePerUnit'],
  });

// ---------------------------------------------------------------------------
// updateProductSchema
// ---------------------------------------------------------------------------
exports.updateProductSchema = z
  .object({
    name: name.optional(),
    sku: sku.optional(),
    category: category.optional(),
    pricePerUnit: pricePerUnit.optional(),
    // Legacy compat
    price: z.number({ invalid_type_error: 'price must be a number' }).gt(0).optional(),
    unit: unit.optional(),
    saleByWeight: saleByWeight.optional(),
    stock: stock.optional(),
    reorderLevel: reorderLevel.optional(),
    // Legacy compat
    lowStockThreshold: z.number().gte(0).optional(),
    tareWeight: tareWeight.optional(),
    packSize: packSize.optional(),
    hsnCode,
    barcode,
    gstRate,
    supplierId: objectId.optional().or(z.literal('').transform(() => undefined)),
    isSample: z.boolean().optional(),
  })
  .transform(applyLegacyFieldMap)
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one field is required',
  });

// ---------------------------------------------------------------------------
// stockAdjustSchema — for PATCH /products/:id/stock
// Accepts decimal quantities (spec §2.3)
// ---------------------------------------------------------------------------
exports.stockAdjustSchema = z.object({
  type: z.enum(['increase', 'decrease']),
  quantity: z
    .number({ invalid_type_error: 'Quantity must be a number' })
    .gt(0, 'Quantity must be greater than 0'),
});
