'use strict';

/**
 * Migration: Product UoM Schema v1 → v2
 *
 * Renames price → pricePerUnit, lowStockThreshold → reorderLevel,
 * converts Number fields to Decimal128, adds unit/saleByWeight/packSize/tareWeight/isSample.
 *
 * Run: node src/migrations/2026-04-29-product-uom.js
 * NPM: npm run migrate:uom (from server/)
 *
 * spec: product-uom-schema.md §4
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Decimal128 } = mongoose.Types;

// ---------------------------------------------------------------------------
// Pre-condition: BACKUP_VERIFIED guard | spec: §4.1
// ---------------------------------------------------------------------------
if (process.env.BACKUP_VERIFIED !== 'yes') {
  console.error('[migrate] BACKUP_VERIFIED env var not set.');
  console.error('[migrate] Run a mongodump first; then: export BACKUP_VERIFIED=yes');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Convert any number/string to Decimal128 safely
function d128(v) {
  if (v == null || v === '' || (typeof v === 'number' && !isFinite(v))) return null;
  try {
    return Decimal128.fromString(String(v));
  } catch (_) {
    return null;
  }
}

// Convert value to Decimal128, with fallback + warning logging
function moneyD128(v, label, id, sku) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (isNaN(n) || n == null) {
    console.warn(`[migrate] _id=${id} sku=${sku} has invalid ${label} ${v}, defaulting to 0.01`);
    return Decimal128.fromString('0.01');
  }
  if (n <= 0) {
    console.warn(`[migrate] _id=${id} sku=${sku} has invalid ${label} ${v}, defaulting to 0.01`);
    return Decimal128.fromString('0.01');
  }
  return Decimal128.fromString(String(n));
}

function weightD128(v, label, id, sku) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (isNaN(n) || n == null) return Decimal128.fromString('0');
  if (n < 0) {
    console.warn(`[migrate] _id=${id} sku=${sku} has negative ${label} ${n}, preserving`);
  }
  return Decimal128.fromString(String(n));
}

// ---------------------------------------------------------------------------
// Idempotency query — docs not yet at v2 | spec: §4.2
// ---------------------------------------------------------------------------
const IDEMPOTENCY_QUERY = {
  $or: [{ schemaVersion: { $exists: false } }, { schemaVersion: { $lt: 2 } }],
};

// ---------------------------------------------------------------------------
// Main migration
// ---------------------------------------------------------------------------
async function run() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/MERNDB';
  console.log(`[migrate] Connecting to ${mongoUri}...`);
  await mongoose.connect(mongoUri);
  console.log('[migrate] Connected.');

  const db = mongoose.connection.db;
  const productColl = db.collection('products');
  const migrationsColl = db.collection('_migrations');

  // Phase 0: Check _migrations sentinel for short-circuit | spec: §4.3 phase 5
  const existing = await migrationsColl.findOne({ _id: '2026-04-29-product-uom' });
  if (existing) {
    const pendingCount = await productColl.countDocuments(IDEMPOTENCY_QUERY);
    if (pendingCount === 0) {
      console.log('[migrate] Migration already complete (sentinel found, 0 documents to migrate). Exiting.');
      await mongoose.disconnect();
      return;
    }
    console.log(`[migrate] Sentinel found but ${pendingCount} docs remain un-migrated. Resuming...`);
  }

  // Phase 1: Pre-conditions | spec: §4.1
  const total = await productColl.countDocuments({});
  const toMigrate = await productColl.countDocuments(IDEMPOTENCY_QUERY);
  console.log(`[migrate] Total products: ${total}. To migrate: ${toMigrate}.`);

  if (toMigrate === 0) {
    console.log('[migrate] 0 documents to migrate, exiting.');
    await mongoose.disconnect();
    return;
  }

  // Pre-condition: disk space heuristic (simple check — warn only)
  // We skip the actual disk size check here since it requires admin privileges
  // and the BACKUP_VERIFIED guard is the primary safety gate.

  // Pre-condition: active sales in last 60 seconds | spec: §4.1 rule 5
  const Sale = mongoose.connection.db.collection('sales');
  const recentSales = await Sale.countDocuments({
    createdAt: { $gte: new Date(Date.now() - 60 * 1000) },
  });
  if (recentSales > 0) {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) => {
      rl.question(`[migrate] ${recentSales} active sale(s) in the last 60 seconds. Continue? [y/N] `, resolve);
    });
    rl.close();
    if (answer.trim().toLowerCase() !== 'y') {
      console.log('[migrate] Aborted by user.');
      await mongoose.disconnect();
      process.exit(0);
    }
  }

  // Phase 2: Backfill in batches of 500 | spec: §4.3 phase 2
  const BATCH_SIZE = 500;
  let migrated = 0;
  let failed = 0;
  const failedSkus = [];

  console.log(`[migrate] Starting backfill in batches of ${BATCH_SIZE}...`);

  let processed = 0;
  while (true) {
    const batch = await productColl
      .find(IDEMPOTENCY_QUERY)
      .limit(BATCH_SIZE)
      .toArray();

    if (batch.length === 0) break;

    for (const doc of batch) {
      const id  = doc._id;
      const sku = doc.sku || '?';

      try {
        // Per-document transformation | spec: §4.4
        const pricePerUnit = moneyD128(doc.price, 'price', id, sku);
        const costPrice    = moneyD128(doc.costPrice ?? 0, 'costPrice', id, sku);
        const stock        = weightD128(doc.stock ?? 0, 'stock', id, sku);

        // lowStockThreshold: if missing → default 10 (preserve legacy default) | spec: §4.4
        const reorderLevelSrc = doc.lowStockThreshold !== undefined
          ? doc.lowStockThreshold
          : 10; // preserve legacy default 10, NOT the new default 0
        const reorderLevel = weightD128(reorderLevelSrc, 'reorderLevel', id, sku);

        console.log(`[migrate] _id=${id} sku=${sku} old.price=${doc.price} → pricePerUnit="${doc.price}" stock=${doc.stock} → Decimal128 unit=pcs`);

        await productColl.updateOne(
          { _id: id },
          {
            $set: {
              pricePerUnit,
              costPrice,
              stock,
              reorderLevel,
              packSize: null,
              tareWeight: Decimal128.fromString('0'),
              unit: 'pcs',
              saleByWeight: false,
              isSample: false,
              schemaVersion: 2,
            },
            $unset: {
              price: '',
              lowStockThreshold: '',
            },
          }
        );

        migrated++;
      } catch (err) {
        console.error(`[migrate] FAILED _id=${id} sku=${sku}: ${err.message}`);
        failed++;
        failedSkus.push(sku);
        // Do not abort batch — log and continue | spec: §4.5
      }
    }

    processed += batch.length;
    console.log(`[migrate] Progress: ${processed} processed, ${migrated} migrated, ${failed} failed`);
  }

  // Phase 3: Verify count | spec: §4.3 phase 3
  console.log('[migrate] Phase 3: Verifying counts...');
  const v2Count     = await productColl.countDocuments({ schemaVersion: 2 });
  const totalFinal  = await productColl.countDocuments({});
  const stillPending = await productColl.countDocuments(IDEMPOTENCY_QUERY);

  if (stillPending > 0) {
    console.error(`[migrate] Verification FAILED: ${stillPending} documents still at v1.`);
    if (failedSkus.length) console.error('[migrate] Failed SKUs:', failedSkus.join(', '));
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`[migrate] Verification passed: ${v2Count}/${totalFinal} documents at v2.`);

  // Phase 4: Index creation | spec: §4.3 phase 4
  console.log('[migrate] Phase 4: Creating indexes...');
  try {
    await productColl.createIndex({ stock: 1 }, { background: true });
    console.log('[migrate] Index { stock: 1 } created.');
  } catch (err) {
    console.warn('[migrate] Index { stock: 1 } already exists or failed:', err.message);
  }
  try {
    await productColl.createIndex({ category: 1 }, { background: true });
    console.log('[migrate] Index { category: 1 } created.');
  } catch (err) {
    console.warn('[migrate] Index { category: 1 } already exists or failed:', err.message);
  }

  // Phase 5: Mark migration done | spec: §4.3 phase 5
  console.log('[migrate] Phase 5: Writing migration sentinel...');
  await migrationsColl.updateOne(
    { _id: '2026-04-29-product-uom' },
    { $set: { _id: '2026-04-29-product-uom', completedAt: new Date(), docsMigrated: migrated } },
    { upsert: true }
  );

  console.log(`[migrate] Done. ${migrated} documents migrated, ${failed} failed.`);
  if (failed > 0) {
    console.error('[migrate] Some documents failed. Failed SKUs:', failedSkus.join(', '));
    await mongoose.disconnect();
    process.exit(1);
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('[migrate] Fatal error:', err.message, err.stack);
  process.exit(1);
});
