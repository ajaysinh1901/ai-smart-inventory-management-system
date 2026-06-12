'use strict';
// Sample-pack seed controller — onboarding wizard step 4 | spec: setup-flow-and-units.md §C.3

const path    = require('path');
const fs      = require('fs');
const Product = require('../models/Product.model');
const Settings = require('../models/Settings.model');
const money  = require('../utils/money');
const weight = require('../utils/weight');

// ---------------------------------------------------------------------------
// Pack metadata — returned by GET /api/v1/sample-packs
// Labels are i18n keys; frontend translates them.
// ---------------------------------------------------------------------------
const PACK_METADATA = [
  {
    id:               'kirana',
    label:            'samplePacks.kirana.label',
    sku_count:        30,
    description:      'samplePacks.kirana.description',
    recommended_for:  ['kirana', 'general'],
  },
  {
    id:               'pharmacy',
    label:            'samplePacks.pharmacy.label',
    sku_count:        25,
    description:      'samplePacks.pharmacy.description',
    recommended_for:  ['pharmacy'],
  },
  {
    id:               'general',
    label:            'samplePacks.general.label',
    sku_count:        40,
    description:      'samplePacks.general.description',
    recommended_for:  ['general', 'wholesale', 'other'],
  },
];

const VALID_PACK_IDS = new Set(PACK_METADATA.map(p => p.id));

// Resolve path to a pack JSON file from the data directory
function packFilePath(packId) {
  return path.resolve(__dirname, '../data/sample-packs', `${packId}.json`);
}

// Transform a raw JSON fixture record into a Mongoose-compatible product doc.
// Decimal128 fields are converted via the money/weight helpers.
// SKU is suffixed with the user-id tail to avoid global collisions across
// testers sharing a dev DB.
// TODO: remove the userId suffix once multi-tenancy spec ships (userId-scoped
// compound unique index on {userId, sku} will replace the global sku unique index).
function buildProductDoc(rawItem, userId) {
  const userSuffix = userId.toString().slice(-4);
  const { Decimal128 } = require('mongoose').Types;

  // Helper: convert string/null to Decimal128 or null
  const toD128orNull = (v) => {
    if (v === null || v === undefined) return null;
    return money.fromNumberOrString(v);
  };

  return {
    name:         rawItem.name,
    // Suffix SKU to avoid global collisions — temporary multi-tenancy workaround
    sku:          `${rawItem.sku}-${userSuffix}`.toUpperCase(),
    category:     rawItem.category,
    hsnCode:      rawItem.hsnCode || '',
    barcode:      rawItem.barcode || '',
    unit:         rawItem.unit,
    saleByWeight: rawItem.saleByWeight,
    pricePerUnit: money.fromNumberOrString(rawItem.pricePerUnit),
    costPrice:    money.fromNumberOrString(rawItem.costPrice || '0'),
    stock:        weight.fromNumberOrString(rawItem.stock || '0'),
    reorderLevel: weight.fromNumberOrString(rawItem.reorderLevel || '0'),
    packSize:     toD128orNull(rawItem.packSize),
    tareWeight:   weight.fromNumberOrString(rawItem.tareWeight || '0'),
    gstRate:      rawItem.gstRate || 0,
    isSample:     true,
    schemaVersion: 2,
    // userId is not yet a schema field (multi-tenancy gap per spec §0).
    // We store it in a loose field so "Clear sample products" can scope deletion.
    // This is a no-op until the userId field is added to the Product schema.
    // TODO: add userId to Product schema when multi-tenancy spec ships.
  };
}

// ---------------------------------------------------------------------------
// GET /api/v1/sample-packs
// Returns metadata for all packs (used by wizard step 4 picker).
// spec: setup-flow-and-units.md §C.3
// ---------------------------------------------------------------------------
exports.listPacks = async (req, res) => {
  // Returns pack metadata list for onboarding wizard step 4 picker | spec: setup-flow-and-units §C.3
  res.json({ success: true, data: PACK_METADATA });
};

// ---------------------------------------------------------------------------
// POST /api/v1/sample-packs/seed
// Inserts all products from a chosen sample pack for the authenticated user.
// Idempotent: returns 409 if already seeded.
// spec: setup-flow-and-units.md §C.3
// ---------------------------------------------------------------------------
exports.seedPack = async (req, res) => {
  // Bulk-inserts a sample pack's products and advances onboarding step 4 | spec: setup-flow-and-units §C.3
  const { packId } = req.body; // validated by Zod middleware
  const userId = req.user.id;

  // Guard: validate packId even though Zod already caught most cases
  if (!VALID_PACK_IDS.has(packId)) {
    return res.status(400).json({ success: false, message: 'Invalid packId', error: 'INVALID_PACK' });
  }

  // Idempotency: check if a pack has already been seeded for this user
  let settings = await Settings.findOne({ userId });
  if (!settings) {
    settings = await Settings.create({ userId });
  }

  const existingSeed = settings.onboarding && settings.onboarding.sampleSeedUsed;
  if (existingSeed) {
    return res.status(409).json({
      success:  false,
      error:    'ALREADY_SEEDED',
      existing: existingSeed,
      message:  `Sample pack '${existingSeed}' is already seeded. Use DELETE /api/v1/sample-packs to clear first.`,
    });
  }

  // Read the fixture JSON file
  const filePath = packFilePath(packId);
  if (!fs.existsSync(filePath)) {
    return res.status(500).json({ success: false, message: `Pack file not found: ${packId}` });
  }

  const rawItems = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Build Mongoose-compatible docs with Decimal128 fields
  const docs = rawItems.map(item => buildProductDoc(item, userId));

  // Bulk insert — ordered:false so a single SKU collision doesn't abort all
  let result;
  try {
    result = await Product.insertMany(docs, { ordered: false });
  } catch (err) {
    // BulkWriteError: some docs may have been inserted despite the error
    if (err.name === 'MongoBulkWriteError' || err.code === 11000) {
      const inserted = err.result ? err.result.nInserted : 0;
      // Still update settings so the seed is marked
      await _markSeedDone(settings, packId);
      return res.status(207).json({
        success:  true,
        inserted,
        packId,
        warning:  'Some SKUs already existed and were skipped (duplicate key)',
        settings: settings.onboarding,
      });
    }
    throw err; // rethrow — error middleware handles it
  }

  // Update onboarding state
  await _markSeedDone(settings, packId);

  res.json({
    success:  true,
    inserted: result.length,
    packId,
    settings: settings.onboarding,
  });
};

// ---------------------------------------------------------------------------
// DELETE /api/v1/sample-packs
// Removes all isSample=true products for the user and clears sampleSeedUsed.
// Soft-cap: only permitted within 30 days of the seed.
// spec: setup-flow-and-units.md §C.3
// ---------------------------------------------------------------------------
exports.clearPack = async (req, res) => {
  // Deletes all isSample products for the user and resets sampleSeedUsed | spec: setup-flow-and-units §C.3
  const userId = req.user.id;

  const settings = await Settings.findOne({ userId });
  if (!settings || !settings.onboarding || !settings.onboarding.sampleSeedUsed) {
    return res.status(400).json({ success: false, message: 'No sample pack is currently seeded' });
  }

  // Soft-cap: check if seed was done within last 30 days.
  // We use completedAt (set at step 7 / activation). If step 4 hasn't been
  // timestamped explicitly, we fall back to searching product createdAt.
  // Find oldest sample product to compute seed age (scoped to isSample only) | bug A1-08
  const oldestSample = await Product.findOne({ isSample: true })
    .sort({ createdAt: 1 })
    .select('createdAt')
    .lean();

  if (oldestSample) {
    const seedAge = Date.now() - new Date(oldestSample.createdAt).getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    if (seedAge > thirtyDaysMs) {
      return res.status(403).json({
        success: false,
        error:   'CLEAR_WINDOW_EXPIRED',
        message: 'Sample products can only be cleared within 30 days of seeding',
      });
    }
  }

  // Delete only sample products — isSample:true guard is mandatory (never removes real inventory) | bug A1-08
  // Single-shop app: all staff share one shop, so deleting all isSample products is correct scope.
  const deleteResult = await Product.deleteMany({ isSample: true });

  // Reset sampleSeedUsed
  settings.onboarding.sampleSeedUsed = null;
  settings.markModified('onboarding');
  await settings.save();

  res.json({
    success: true,
    deleted: deleteResult.deletedCount,
  });
};

// ---------------------------------------------------------------------------
// Internal helper: advance onboarding state to step 4 done
// ---------------------------------------------------------------------------
async function _markSeedDone(settings, packId) {
  const ob = settings.onboarding;
  ob.sampleSeedUsed = packId;

  // Dedup-push step 4 into completedSteps
  const stepSet = new Set(ob.completedSteps);
  stepSet.add(4);
  ob.completedSteps = [...stepSet].sort((a, b) => a - b);

  // Advance currentStep to at least 4
  ob.currentStep = Math.max(ob.currentStep, 4);

  settings.markModified('onboarding');
  await settings.save();
}
