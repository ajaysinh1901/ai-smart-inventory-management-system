'use strict';

// Product schema — UoM migration (v2) | spec: product-uom-schema.md §2
const mongoose = require('mongoose');
const money = require('../utils/money');
const weight = require('../utils/weight');

const { Decimal128 } = mongoose.Types;

// Decimal-capable units per spec §2.2.2
const DECIMAL_UNITS = new Set(['kg', 'g', 'l', 'ml']);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [1, 'Name must be at least 1 character'],
      maxlength: [120, 'Name must be 120 characters or fewer'],
      set: (v) => (typeof v === 'string' ? v.replace(/<[^>]*>/g, '').trim() : v),
    },
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      trim: true,
      minlength: [1, 'SKU must be at least 1 character'],
      maxlength: [64, 'SKU must be 64 characters or fewer'],
      unique: true,
      uppercase: true,
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      minlength: [1, 'Category must be at least 1 character'],
      maxlength: [80, 'Category must be 80 characters or fewer'],
    },
    hsnCode: {
      type: String,
      default: '',
      validate: {
        validator: (v) => /^(\d{4}|\d{6}|\d{8})?$/.test(v || ''),
        message: 'hsnCode must be empty or 4, 6, or 8 digits',
      },
    },
    barcode: {
      // A4-02 fix: no `default: ''` — an empty-string default collides under
      // the unique+sparse index (sparse only skips `undefined`/missing, not '').
      type: String,
      trim: true,
      index: { unique: true, sparse: true },
    },
    // NEW: unit of measure — locked enum, lowercase only (spec §2.2.6)
    unit: {
      type: String,
      required: [true, 'unit is required'],
      default: 'pcs',
      enum: {
        values: ['pcs', 'kg', 'g', 'l', 'ml', 'dozen', 'box', 'packet'],
        message: 'unit must be one of: pcs, kg, g, l, ml, dozen, box, packet',
      },
    },
    // NEW: scale-mode flag (spec §2.2.2)
    saleByWeight: {
      type: Boolean,
      required: true,
      default: false,
    },
    // RENAMED from price — stored as Decimal128 (spec §2.1)
    pricePerUnit: {
      type: Decimal128,
      required: [true, 'pricePerUnit is required'],
    },
    // costPrice — converted from Number (spec §2.1)
    costPrice: {
      type: Decimal128,
      default: () => Decimal128.fromString('0'),
    },
    // stock — Decimal128, negative allowed (spec §2.3)
    stock: {
      type: Decimal128,
      required: true,
      default: () => Decimal128.fromString('0'),
    },
    // RENAMED from lowStockThreshold (spec §2.1); new doc default = 0 (spec §2.1 note)
    reorderLevel: {
      type: Decimal128,
      default: () => Decimal128.fromString('0'),
    },
    // NEW: optional pack hint (spec §2.1)
    packSize: {
      type: Decimal128,
      default: null,
    },
    // NEW: tare weight for containers (spec §2.1)
    tareWeight: {
      type: Decimal128,
      default: () => Decimal128.fromString('0'),
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
    },
    // GST rate in whole-percent integers (0, 5, 12, 18, 28).
    // Read by sale controller for per-line tax computation | spec: chunk #3
    // Falls back to 0% if not set (tax-exempt or not yet configured).
    gstRate: {
      type: Number,
      default: 0,
      enum: {
        values: [0, 5, 12, 18, 28],
        message: 'gstRate must be one of: 0, 5, 12, 18, 28',
      },
    },
    // NEW: sample-pack sentinel (spec §2.1)
    isSample: {
      type: Boolean,
      default: false,
    },
    // Migration sentinel — 1 = legacy, 2 = UoM migrated (spec §2.1)
    schemaVersion: {
      type: Number,
      default: 2,
      enum: [1, 2],
    },
  },
  { timestamps: true }
);

// ---------------------------------------------------------------------------
// §2.4 Indexes
// ---------------------------------------------------------------------------
productSchema.index({ stock: 1 });    // low-stock cron + analytics
productSchema.index({ category: 1 }); // analytics groupBy

// ---------------------------------------------------------------------------
// §2.2 Validator rules — pre-validate hook
// ---------------------------------------------------------------------------
// C1 fix: converted from sync function(next) to async — Mongoose 9/Kareem 3 no longer passes next | spec: product-uom-schema.md §2.2
productSchema.pre('validate', async function () {
  // NEW-03: validation failures throw with statusCode 400 so controllers
  // map them to HTTP 400 (a plain Error → 500).
  const e400 = (msg) => Object.assign(new Error(msg), { statusCode: 400 });

  // Rule 2: saleByWeight=true requires unit in decimal-capable set
  if (this.saleByWeight === true && !DECIMAL_UNITS.has(this.unit)) {
    throw e400('saleByWeight requires unit kg/g/l/ml');
  }

  // Rule 3: saleByWeight=false requires whole-number stock
  if (this.saleByWeight === false && this.stock != null) {
    if (!weight.isWhole(this.stock)) {
      throw e400('Decimal qty not allowed for non-weight unit (saleByWeight=false)');
    }
  }

  // Rule 1: pricePerUnit must be > 0
  if (this.pricePerUnit != null) {
    try {
      const ppu = Number(this.pricePerUnit.toString());
      if (ppu <= 0) {
        throw e400('pricePerUnit must be greater than 0');
      }
    } catch (e) {
      if (e.message === 'pricePerUnit must be greater than 0') throw e;
      // otherwise caught by Mongoose type validation
    }
  }

  // Rule 4: reorderLevel >= 0
  if (this.reorderLevel != null) {
    try {
      const rl = Number(this.reorderLevel.toString());
      if (rl < 0) {
        throw e400('reorderLevel must be >= 0');
      }
    } catch (e) {
      if (e.message === 'reorderLevel must be >= 0') throw e;
    }
  }

  // Rule 5: tareWeight < 1e9 sanity cap; if packSize also set, tareWeight < packSize
  if (this.tareWeight != null) {
    try {
      const tw = Number(this.tareWeight.toString());
      if (tw >= 1e9) {
        throw e400('tareWeight exceeds sanity cap of 1e9');
      }
      if (this.packSize != null) {
        const ps = Number(this.packSize.toString());
        if (tw >= ps) {
          throw e400('tareWeight must be less than packSize when both are set');
        }
      }
    } catch (e) {
      if (e.message.startsWith('tareWeight')) throw e;
    }
  }

  // Rule: packSize > 0 when set
  if (this.packSize != null) {
    try {
      const ps = Number(this.packSize.toString());
      if (ps <= 0) {
        throw e400('packSize must be > 0 when set');
      }
    } catch (e) {
      if (e.message === 'packSize must be > 0 when set') throw e;
    }
  }
});

// ---------------------------------------------------------------------------
// §2.5 Virtuals
// ---------------------------------------------------------------------------

// Legacy field mirror for 90-day API compat (spec §4.6)
productSchema.virtual('price').get(function () {
  if (this.pricePerUnit == null) return null;
  return money.toString(this.pricePerUnit);
});

// Legacy field mirror — was Number, keep as Number for old clients
productSchema.virtual('lowStockThreshold').get(function () {
  if (this.reorderLevel == null) return 0;
  return Number(this.reorderLevel.toString());
});

// Stock status for UI — distinguishes oversold/out/low/healthy (spec §2.3)
productSchema.virtual('stockStatus').get(function () {
  if (this.stock == null) return 'out';
  const s = Number(this.stock.toString());
  const r = this.reorderLevel != null ? Number(this.reorderLevel.toString()) : 0;
  if (s < 0) return 'oversold';
  if (s === 0) return 'out';
  if (r > 0 && s <= r) return 'low';
  return 'healthy';
});

// ---------------------------------------------------------------------------
// §5.2 toJSON transform — flatten Decimal128 to unit-aware strings
// ---------------------------------------------------------------------------
productSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    const unit = ret.unit || 'pcs';

    // Money fields — always 2 dp
    ['pricePerUnit', 'costPrice'].forEach((f) => {
      if (ret[f] != null && ret[f]._bsontype === 'Decimal128') {
        ret[f] = money.toString(ret[f]);
      }
    });

    // Weight-like fields — precision depends on unit (spec §5.2)
    ['stock', 'reorderLevel', 'packSize', 'tareWeight'].forEach((f) => {
      if (ret[f] == null) return; // null stays null (packSize)
      if (ret[f]._bsontype === 'Decimal128') {
        ret[f] = weight.toString(ret[f], unit);
      }
    });

    return ret;
  },
});

productSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Product', productSchema);
