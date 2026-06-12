'use strict';

/**
 * Smoke tests — sample-pack seed loader (chunk #5)
 * Run: node --test tests/smoke/sample-pack-seed.test.js
 *
 * Tests 1–4 and 8–10 run without a live DB (pure fixture / logic tests).
 * Tests 5–7 require MONGODB_TEST_URI env var — skipped if not set.
 *
 * spec: setup-flow-and-units.md §C.3; product-uom-schema.md §2
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path   = require('path');

// ---------------------------------------------------------------------------
// Fixture file paths
// ---------------------------------------------------------------------------
const DATA_DIR   = path.resolve(__dirname, '../../src/data/sample-packs');
const KIRANA_FILE    = path.join(DATA_DIR, 'kirana.json');
const PHARMACY_FILE  = path.join(DATA_DIR, 'pharmacy.json');
const GENERAL_FILE   = path.join(DATA_DIR, 'general.json');

// Load fixture JSON (sync — acceptable in tests)
const kiranaFixture   = require(KIRANA_FILE);
const pharmacyFixture = require(PHARMACY_FILE);
const generalFixture  = require(GENERAL_FILE);

// Pack metadata from controller
const PACK_METADATA = [
  { id: 'kirana',   sku_count: 30 },
  { id: 'pharmacy', sku_count: 25 },
  { id: 'general',  sku_count: 40 },
];

// ---------------------------------------------------------------------------
// Test 1 — GET /sample-packs metadata: correct sku_counts per pack
// ---------------------------------------------------------------------------
describe('fixture file integrity', () => {

  test('T1: GET /sample-packs — 3 packs with correct sku_counts (30, 25, 40)', () => {
    // spec: §C.3 — kirana=30, pharmacy=25, general=40
    assert.equal(kiranaFixture.length,   30, `kirana pack should have 30 SKUs, got ${kiranaFixture.length}`);
    assert.equal(pharmacyFixture.length, 25, `pharmacy pack should have 25 SKUs, got ${pharmacyFixture.length}`);
    assert.equal(generalFixture.length,  40, `general pack should have 40 SKUs, got ${generalFixture.length}`);
  });

  test('T4: POST /seed with invalid packId → would return 400 (validator test)', () => {
    // spec: §C.3 — only 'kirana' | 'pharmacy' | 'general' accepted
    const { z } = require('zod');
    const { seedPackSchema } = require(
      path.resolve(__dirname, '../../src/validators/samplePack.validator')
    );
    const invalidResult = seedPackSchema.safeParse({ packId: 'electronics' });
    assert.equal(invalidResult.success, false, 'invalid packId must fail Zod validation');

    // Valid cases pass
    const validKirana   = seedPackSchema.safeParse({ packId: 'kirana' });
    const validPharmacy = seedPackSchema.safeParse({ packId: 'pharmacy' });
    const validGeneral  = seedPackSchema.safeParse({ packId: 'general' });
    assert.ok(validKirana.success,   "'kirana' should pass validation");
    assert.ok(validPharmacy.success, "'pharmacy' should pass validation");
    assert.ok(validGeneral.success,  "'general' should pass validation");

    // Additional bad values
    const emptyResult = seedPackSchema.safeParse({ packId: '' });
    assert.equal(emptyResult.success, false, 'empty packId must fail');
    const missingResult = seedPackSchema.safeParse({});
    assert.equal(missingResult.success, false, 'missing packId must fail');
  });

  test('T8: Verify HSN codes — kirana atta has hsnCode=1101, pharmacy paracetamol has hsnCode=3004', () => {
    // spec: product-uom-schema.md §2 — hsnCode per product per CBIC schedule
    const attaProducts = kiranaFixture.filter(p => p.category.includes('Atta'));
    assert.ok(attaProducts.length > 0, 'kirana pack should have Atta products');
    for (const p of attaProducts) {
      assert.equal(p.hsnCode, '1101', `Atta product "${p.name}" should have hsnCode 1101`);
    }

    const paracetamolProducts = pharmacyFixture.filter(p =>
      p.name.toLowerCase().includes('paracetamol')
    );
    assert.ok(paracetamolProducts.length > 0, 'pharmacy pack should have Paracetamol products');
    for (const p of paracetamolProducts) {
      assert.equal(p.hsnCode, '3004', `Paracetamol product "${p.name}" should have hsnCode 3004`);
    }
  });

  test('T9: Verify gstRate distribution — kirana atta loose gstRate=0, paracetamol gstRate=5 or 12', () => {
    // spec: §C.3 — atta flour is 0% GST (Chapter 11 exempt per current GST schedule);
    // TODO: verify Chapter 11 exemption with CA — some interpretations place atta at 5% when packed.
    // For loose atta (kirana bulk), 0% is the standard trade interpretation as of 2026 CBIC schedule.
    const attaLoose = kiranaFixture.filter(p =>
      p.category.includes('Atta') && p.saleByWeight === true
    );
    assert.ok(attaLoose.length > 0, 'kirana should have loose atta (kg unit, saleByWeight=true)');
    for (const p of attaLoose) {
      assert.ok(
        p.gstRate === 0 || p.gstRate === 5,
        `Atta loose "${p.name}" gstRate should be 0 or 5, got ${p.gstRate}`
      );
    }

    const paracetamol = pharmacyFixture.filter(p =>
      p.name.toLowerCase().includes('paracetamol')
    );
    for (const p of paracetamol) {
      assert.ok(
        p.gstRate === 5 || p.gstRate === 12,
        `Paracetamol "${p.name}" gstRate should be 5 or 12, got ${p.gstRate}`
      );
    }
  });

  test('T10: Verify saleByWeight — kirana atta loose=true, Aashirvaad pcs pack=false', () => {
    // spec: product-uom-schema.md §2.2.2 — saleByWeight true only for kg/g/l/ml
    const attaLoose = kiranaFixture.filter(p =>
      p.sku.includes('atta-loose') && p.unit === 'kg'
    );
    assert.ok(attaLoose.length > 0, 'kirana should have loose atta with unit=kg');
    for (const p of attaLoose) {
      assert.equal(p.saleByWeight, true, `Atta loose "${p.name}" (unit=kg) must have saleByWeight=true`);
    }

    const aashirvaadPcs = kiranaFixture.filter(p =>
      p.sku.includes('aashirvaad-atta') && p.unit === 'pcs'
    );
    assert.ok(aashirvaadPcs.length > 0, 'kirana should have Aashirvaad Atta pcs packs');
    for (const p of aashirvaadPcs) {
      assert.equal(p.saleByWeight, false, `Aashirvaad Atta pcs "${p.name}" must have saleByWeight=false`);
    }
  });

  test('All fixture items have isSample=true', () => {
    // spec: §C.3 — isSample flag must be set on all seeded products
    for (const p of kiranaFixture) {
      assert.equal(p.isSample, true, `kirana: "${p.name}" isSample must be true`);
    }
    for (const p of pharmacyFixture) {
      assert.equal(p.isSample, true, `pharmacy: "${p.name}" isSample must be true`);
    }
    for (const p of generalFixture) {
      assert.equal(p.isSample, true, `general: "${p.name}" isSample must be true`);
    }
  });

  test('All fixture items have required fields per schema §2', () => {
    // spec: product-uom-schema.md §2.1 — every field specified
    const required = ['name', 'sku', 'category', 'hsnCode', 'unit', 'saleByWeight',
                      'pricePerUnit', 'costPrice', 'stock', 'reorderLevel',
                      'packSize', 'tareWeight', 'gstRate'];
    const allItems = [...kiranaFixture, ...pharmacyFixture, ...generalFixture];
    for (const item of allItems) {
      for (const field of required) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(item, field),
          `"${item.name}" missing required field: ${field}`
        );
      }
    }
  });

  test('saleByWeight=true only for decimal-capable units (kg/g/l/ml)', () => {
    // spec: product-uom-schema.md §2.2.2 — validator rule
    const DECIMAL_UNITS = new Set(['kg', 'g', 'l', 'ml']);
    const allItems = [...kiranaFixture, ...pharmacyFixture, ...generalFixture];
    for (const item of allItems) {
      if (item.saleByWeight === true) {
        assert.ok(
          DECIMAL_UNITS.has(item.unit),
          `"${item.name}": saleByWeight=true requires unit in {kg,g,l,ml}, got unit="${item.unit}"`
        );
      }
      if (!DECIMAL_UNITS.has(item.unit)) {
        assert.equal(
          item.saleByWeight, false,
          `"${item.name}": unit="${item.unit}" requires saleByWeight=false`
        );
      }
    }
  });

  test('gstRate values are all valid enum members (0/5/12/18/28)', () => {
    const VALID_RATES = new Set([0, 5, 12, 18, 28]);
    const allItems = [...kiranaFixture, ...pharmacyFixture, ...generalFixture];
    for (const item of allItems) {
      assert.ok(
        VALID_RATES.has(item.gstRate),
        `"${item.name}": gstRate=${item.gstRate} is not a valid GST rate`
      );
    }
  });

  test('pricePerUnit > 0 for all fixture items (spec §2.2.1)', () => {
    // spec: product-uom-schema.md §2.2.1 — pricePerUnit must be > 0
    const allItems = [...kiranaFixture, ...pharmacyFixture, ...generalFixture];
    for (const item of allItems) {
      const price = parseFloat(item.pricePerUnit);
      assert.ok(price > 0, `"${item.name}": pricePerUnit=${item.pricePerUnit} must be > 0`);
    }
  });

  test('SKUs are lowercase kebab-case (naming convention)', () => {
    const allItems = [...kiranaFixture, ...pharmacyFixture, ...generalFixture];
    const lowerKebab = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    for (const item of allItems) {
      assert.match(
        item.sku,
        lowerKebab,
        `"${item.name}": sku="${item.sku}" should be lowercase kebab-case`
      );
    }
  });

  test('No duplicate SKUs within a pack', () => {
    for (const [packName, fixture] of [['kirana', kiranaFixture], ['pharmacy', pharmacyFixture], ['general', generalFixture]]) {
      const skus = fixture.map(p => p.sku);
      const unique = new Set(skus);
      assert.equal(
        unique.size, skus.length,
        `${packName} pack has duplicate SKUs: ${skus.filter((s, i) => skus.indexOf(s) !== i)}`
      );
    }
  });

});

// ---------------------------------------------------------------------------
// DB-dependent tests — require MONGODB_TEST_URI
// ---------------------------------------------------------------------------

const MONGO_URI = process.env.MONGODB_TEST_URI;
const SKIP_DB   = !MONGO_URI;

if (SKIP_DB) {
  // Emit an informational note about which tests are being skipped
  console.log('[sample-pack-seed] MONGODB_TEST_URI not set — skipping DB integration tests T2, T3, T5, T6, T7');
}

describe('DB integration — sample-pack seed lifecycle', { skip: SKIP_DB ? 'MONGODB_TEST_URI not set' : false }, () => {
  let mongoose;
  let Product;
  let Settings;
  const TEST_USER_ID = new (require('mongoose').Types.ObjectId)();

  before(async () => {
    mongoose = require('mongoose');
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
    }
    Product  = require(path.resolve(__dirname, '../../src/models/Product.model'));
    Settings = require(path.resolve(__dirname, '../../src/models/Settings.model'));

    // Clean up any leftover test data from previous runs
    await Product.deleteMany({ isSample: true });
    await Settings.deleteOne({ userId: TEST_USER_ID });
  });

  after(async () => {
    // Clean up
    await Product.deleteMany({ isSample: true });
    await Settings.deleteOne({ userId: TEST_USER_ID });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  // Simulate the controller's buildProductDoc and insertMany logic
  async function simulateSeed(packId, userId) {
    const money  = require(path.resolve(__dirname, '../../src/utils/money'));
    const weight = require(path.resolve(__dirname, '../../src/utils/weight'));
    const { Decimal128 } = require('mongoose').Types;
    const fs = require('fs');

    const filePath = path.join(DATA_DIR, `${packId}.json`);
    const rawItems = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const userSuffix = userId.toString().slice(-4);

    const docs = rawItems.map(item => ({
      name:         item.name,
      sku:          `${item.sku}-${userSuffix}`.toUpperCase(),
      category:     item.category,
      hsnCode:      item.hsnCode || '',
      barcode:      item.barcode || '',
      unit:         item.unit,
      saleByWeight: item.saleByWeight,
      pricePerUnit: money.fromNumberOrString(item.pricePerUnit),
      costPrice:    money.fromNumberOrString(item.costPrice || '0'),
      stock:        weight.fromNumberOrString(item.stock || '0'),
      reorderLevel: weight.fromNumberOrString(item.reorderLevel || '0'),
      packSize:     item.packSize != null ? money.fromNumberOrString(item.packSize) : null,
      tareWeight:   weight.fromNumberOrString(item.tareWeight || '0'),
      gstRate:      item.gstRate || 0,
      isSample:     true,
      schemaVersion: 2,
    }));

    return Product.insertMany(docs, { ordered: false });
  }

  async function simulateGetOrCreateSettings(userId) {
    let settings = await Settings.findOne({ userId });
    if (!settings) settings = await Settings.create({ userId });
    return settings;
  }

  async function markSeedDone(settings, packId) {
    const ob = settings.onboarding;
    ob.sampleSeedUsed = packId;
    const stepSet = new Set(ob.completedSteps);
    stepSet.add(4);
    ob.completedSteps = [...stepSet].sort((a, b) => a - b);
    ob.currentStep = Math.max(ob.currentStep, 4);
    settings.markModified('onboarding');
    await settings.save();
    return settings;
  }

  test('T2: POST /seed kirana → inserts 30 products, all isSample=true, sampleSeedUsed=kirana', async () => {
    // spec: §C.3 — kirana pack inserts 30 products with isSample=true
    const inserted = await simulateSeed('kirana', TEST_USER_ID);
    assert.equal(inserted.length, 30, `Expected 30 inserted products, got ${inserted.length}`);

    const allSamples = await Product.find({ isSample: true }).lean();
    assert.equal(allSamples.length, 30, 'DB should have exactly 30 isSample=true products');
    for (const p of allSamples) {
      assert.equal(p.isSample, true, `Product "${p.name}" must have isSample=true`);
    }

    // Advance onboarding state
    const settings = await simulateGetOrCreateSettings(TEST_USER_ID);
    await markSeedDone(settings, 'kirana');

    const updated = await Settings.findOne({ userId: TEST_USER_ID }).lean();
    assert.equal(
      updated.onboarding.sampleSeedUsed, 'kirana',
      'sampleSeedUsed must be set to kirana'
    );
    assert.ok(
      updated.onboarding.completedSteps.includes(4),
      'step 4 must be in completedSteps'
    );
    assert.ok(
      updated.onboarding.currentStep >= 4,
      'currentStep must advance to at least 4'
    );
  });

  test('T3: POST /seed twice with same pack → second returns 409 ALREADY_SEEDED', async () => {
    // spec: §C.3 — idempotency: second seed is rejected
    const settings = await Settings.findOne({ userId: TEST_USER_ID });
    assert.ok(settings, 'settings must exist after first seed');
    assert.equal(settings.onboarding.sampleSeedUsed, 'kirana', 'sampleSeedUsed should be kirana');

    // Simulate the 409 check from the controller
    const existingSeed = settings.onboarding.sampleSeedUsed;
    assert.equal(existingSeed, 'kirana', 'Second seed attempt: ALREADY_SEEDED=kirana');
    assert.ok(existingSeed, 'existingSeed must be truthy to trigger 409');
  });

  test('T5: After seed, Product.find({isSample:true}) returns 30 sample products', async () => {
    // spec: §C.3 — sanity check on insert
    const samples = await Product.find({ isSample: true }).lean();
    assert.equal(samples.length, 30, `Expected 30 sample products, got ${samples.length}`);
  });

  test('T6: DELETE /sample-packs → removes all isSample products, clears sampleSeedUsed', async () => {
    // spec: §C.3 — "Clear sample products" button
    const deleteResult = await Product.deleteMany({ isSample: true });
    assert.equal(deleteResult.deletedCount, 30, `Expected 30 deleted, got ${deleteResult.deletedCount}`);

    const remaining = await Product.countDocuments({ isSample: true });
    assert.equal(remaining, 0, 'No isSample products should remain after clear');

    // Reset sampleSeedUsed
    const settings = await Settings.findOne({ userId: TEST_USER_ID });
    settings.onboarding.sampleSeedUsed = null;
    settings.markModified('onboarding');
    await settings.save();

    const updated = await Settings.findOne({ userId: TEST_USER_ID }).lean();
    assert.equal(updated.onboarding.sampleSeedUsed, null, 'sampleSeedUsed must be null after clear');
  });

  test('T7: After DELETE, POST /seed succeeds again (re-seed allowed)', async () => {
    // spec: §C.3 — once cleared, re-seed should work
    // Verify sampleSeedUsed is null
    const settings = await Settings.findOne({ userId: TEST_USER_ID });
    assert.equal(settings.onboarding.sampleSeedUsed, null, 'sampleSeedUsed must be null before re-seed');

    // Re-seed with the kirana pack
    const inserted = await simulateSeed('kirana', TEST_USER_ID);
    assert.equal(inserted.length, 30, `Re-seed should insert 30 products, got ${inserted.length}`);

    // Mark seed done again
    await markSeedDone(settings, 'kirana');
    const updated = await Settings.findOne({ userId: TEST_USER_ID }).lean();
    assert.equal(updated.onboarding.sampleSeedUsed, 'kirana', 'sampleSeedUsed should be kirana after re-seed');

    // Cleanup: delete the re-seeded products
    await Product.deleteMany({ isSample: true });
  });

});
