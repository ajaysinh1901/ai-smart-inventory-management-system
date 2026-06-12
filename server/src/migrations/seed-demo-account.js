/**
 * Demo Account Seed — SmartStock AI
 *
 * ADDITIVE & IDEMPOTENT. Unlike seed.js / seed-professional.js this script
 * NEVER wipes a collection. It can be run repeatedly without creating
 * duplicates or corrupting existing data.
 *
 * What it sets up:
 *   1. Admin demo user        admin@mail.com / Admin@123  (role: admin)
 *   2. Settings/workspace      "Main Street Grocery", Gujarat, GST + UPI filled
 *   3. Onboarding              all 7 steps marked complete (skips the wizard)
 *   4. One supplier            "Gujarat Wholesale Mart"
 *   5. Ten grocery products    with realistic GST rates (one kept low-stock)
 *   6. Six demo sales          built via the app's own computeSale() — proper
 *                              GST split, round-off, stock decrement, ledger
 *
 * Idempotency strategy:
 *   - User / Settings / Supplier  → upsert (find, update-or-create)
 *   - Products                    → inserted only if the SKU is missing
 *   - Sales                       → skipped entirely if demo sales already exist
 *
 * Run:  node src/migrations/seed-demo-account.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const User        = require('../models/User.model');
const Settings    = require('../models/Settings.model');
const Supplier    = require('../models/Supplier.model');
const Product     = require('../models/Product.model');
const Sale        = require('../models/Sale.model');
const Transaction = require('../models/Transaction.model');
const Counter     = require('../models/Counter.model');
const { computeSale } = require('../utils/saleCompute');

const { Decimal128 } = mongoose.Types;
const d128 = (n) => Decimal128.fromString(String(n));

// ─── Demo data definitions ───────────────────────────────────────────────────

const DEMO = {
  user: { name: 'Demo Admin', email: 'admin@mail.com', password: 'Admin@123', role: 'admin' },
  workspace: {
    companyName:     'Main Street Grocery',
    legalName:       'Main Street Grocery',
    industry:        'Retail — Grocery',
    gstin:           '24AAACA1234B1Z9',
    gstRegistered:   true,
    address:         'Shop 3, Relief Road, Ahmedabad - 380001',
    state:           'Gujarat',
    pinCode:         '380001',
    fyStart:         '04-01',
    upiId:           'mainstreet@upi',
    payeeName:       'Main Street Grocery',
    bankLast4:       '4321',
    eInvoiceEnabled: false,
    storeProfile:    'small',
    storeType:       'kirana',
    defaultLang:     'en',
  },
  supplier: {
    name:          'Gujarat Wholesale Mart',
    contactPerson: 'Rakesh Patel',
    email:         'orders@gujaratwholesale.in',
    phone:         '+91 79 2630 8800',
    address:       'APMC Market, Vasna, Ahmedabad - 380007',
    gst:           '24AABCG5678K1Z3',
  },
  // All products are sold by piece (saleByWeight:false) so stock stays whole.
  products: [
    { name: 'India Gate Basmati Rice 5kg',  sku: 'DEMO-RICE-5KG',   category: 'Grains',        price: 145, gst: 5,  stock: 60,  reorder: 15, hsn: '1006' },
    { name: 'Aashirvaad Atta 5kg',          sku: 'DEMO-ATTA-5KG',   category: 'Grains',        price: 260, gst: 5,  stock: 80,  reorder: 15, hsn: '1101' },
    { name: 'Sugar 1kg Pack',               sku: 'DEMO-SUGAR-1KG',  category: 'Grocery',       price: 48,  gst: 5,  stock: 100, reorder: 20, hsn: '1701' },
    { name: 'Tata Tea Premium 250g',        sku: 'DEMO-TEA-250G',   category: 'Beverages',     price: 120, gst: 5,  stock: 8,   reorder: 15, hsn: '0902' },
    { name: 'Fortune Sunflower Oil 1L',     sku: 'DEMO-OIL-1L',     category: 'Grocery',       price: 140, gst: 5,  stock: 90,  reorder: 20, hsn: '1512' },
    { name: 'Amul Taaza Toned Milk 1L',     sku: 'DEMO-MILK-1L',    category: 'Dairy',         price: 54,  gst: 0,  stock: 120, reorder: 25, hsn: '0401' },
    { name: 'Lifebuoy Soap Bar',            sku: 'DEMO-SOAP-BAR',   category: 'Personal Care', price: 35,  gst: 18, stock: 150, reorder: 30, hsn: '3401' },
    { name: 'Surf Excel Matic 1kg',         sku: 'DEMO-SURF-1KG',   category: 'Home Care',     price: 180, gst: 18, stock: 65,  reorder: 15, hsn: '3402' },
    { name: 'Colgate Strong Teeth 200g',    sku: 'DEMO-PASTE-200G', category: 'Personal Care', price: 89,  gst: 18, stock: 110, reorder: 25, hsn: '3306' },
    { name: 'Parle-G Biscuits 250g',        sku: 'DEMO-PARLEG-250', category: 'Snacks',        price: 10,  gst: 18, stock: 300, reorder: 50, hsn: '1905' },
  ],
};

// Six demo sales. Dates are days-ago from today. customerState '' = walk-in.
const DEMO_SALES = [
  { daysAgo: 11, customer: { name: 'Walk-in Customer' },                                    items: [['DEMO-RICE-5KG', 2], ['DEMO-OIL-1L', 1]],                       mode: 'cash' },
  { daysAgo: 9,  customer: { name: 'Walk-in Customer' },                                    items: [['DEMO-MILK-1L', 3], ['DEMO-PARLEG-250', 5], ['DEMO-TEA-250G', 1]], mode: 'upi'  },
  { daysAgo: 7,  customer: { name: 'Sharma Kirana Store', phone: '+919825011223', state: 'Maharashtra' }, items: [['DEMO-SURF-1KG', 4], ['DEMO-SOAP-BAR', 6]],          mode: 'bank' },
  { daysAgo: 4,  customer: { name: 'Walk-in Customer' },                                    items: [['DEMO-ATTA-5KG', 1], ['DEMO-SUGAR-1KG', 2]],                    mode: 'cash' },
  { daysAgo: 2,  customer: { name: 'Walk-in Customer' },                                    items: [['DEMO-PASTE-200G', 2], ['DEMO-SOAP-BAR', 3]],                   mode: 'upi'  },
  { daysAgo: 0,  customer: { name: 'Walk-in Customer' },                                    items: [['DEMO-RICE-5KG', 1], ['DEMO-MILK-1L', 2], ['DEMO-PARLEG-250', 4]], mode: 'cash' },
];

const DEMO_SALE_MARKER = 'Demo seed sale — Main Street Grocery';

function dateDaysAgo(days, hour = 12) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 30, 0, 0);
  return d;
}

async function allocateInvoiceNumber() {
  const year = new Date().getFullYear();
  const counter = await Counter.findOneAndUpdate(
    { _id: `invoice-${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return `INV-${year}-${String(counter.seq).padStart(5, '0')}`;
}

(async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/MERNDB';
  console.log(`⏳ Connecting to ${mongoUri} ...`);
  await mongoose.connect(mongoUri);
  console.log('✅ Connected. Seeding demo account (additive — nothing is wiped).\n');

  // ── 1. Admin user (upsert) ─────────────────────────────────────────────────
  let user = await User.findOne({ email: DEMO.user.email });
  if (user) {
    user.name = DEMO.user.name;
    user.role = DEMO.user.role;
    user.password = DEMO.user.password; // pre-save hook re-hashes — keeps creds valid
    await user.save();
    console.log(`👤 User updated:  ${user.email} (password reset to demo value)`);
  } else {
    user = await User.create(DEMO.user);
    console.log(`👤 User created:  ${user.email}`);
  }

  // ── 2 + 3. Settings / workspace + onboarding (upsert) ──────────────────────
  let settings = await Settings.findOne({ userId: user._id });
  if (!settings) settings = new Settings({ userId: user._id });
  Object.assign(settings.workspace, DEMO.workspace);
  settings.onboarding.currentStep    = 7;
  settings.onboarding.completedSteps = [1, 2, 3, 4, 5, 6, 7];
  settings.onboarding.dismissed      = false;
  settings.onboarding.sampleSeedUsed = null; // products seeded directly, not via pack
  settings.onboarding.completedAt    = settings.onboarding.completedAt || new Date();
  await settings.save();
  console.log(`🏪 Workspace set: "${settings.workspace.companyName}" — onboarding marked complete (7/7)`);

  // ── 4. Supplier (upsert by name) ───────────────────────────────────────────
  let supplier = await Supplier.findOne({ name: DEMO.supplier.name });
  if (!supplier) {
    supplier = await Supplier.create(DEMO.supplier);
    console.log(`🏭 Supplier created: ${supplier.name}`);
  } else {
    console.log(`🏭 Supplier exists:  ${supplier.name} (kept as-is)`);
  }

  // ── 5. Products (insert only if SKU missing) ───────────────────────────────
  let inserted = 0;
  for (const p of DEMO.products) {
    const exists = await Product.findOne({ sku: p.sku });
    if (exists) continue;
    const product = await Product.create({
      name:         p.name,
      sku:          p.sku,
      category:     p.category,
      hsnCode:      p.hsn,
      pricePerUnit: d128(p.price),
      costPrice:    d128(Math.round(p.price * 0.8)),
      stock:        d128(p.stock),
      reorderLevel: d128(p.reorder),
      unit:         'pcs',
      saleByWeight: false,
      gstRate:      p.gst,
      supplierId:   supplier._id,
      schemaVersion: 2,
    });
    // Opening-stock IN ledger entry
    await Transaction.create({
      productId: product._id,
      type:      'IN',
      quantity:  p.stock,
      user:      user._id,
      supplierId: supplier._id,
      notes:     'Opening stock — demo seed',
      costPrice: Math.round(p.price * 0.8),
    });
    inserted += 1;
  }
  console.log(`📦 Products: ${inserted} new inserted, ${DEMO.products.length - inserted} already present`);

  // ── 6. Demo sales (skip entirely if already seeded) ────────────────────────
  const existingDemoSale = await Sale.findOne({ notes: DEMO_SALE_MARKER });
  if (existingDemoSale) {
    console.log('💸 Demo sales already present — skipping sale generation.');
  } else {
    // Build a productId-keyed map for computeSale
    const allDemoProducts = await Product.find({ sku: { $in: DEMO.products.map((p) => p.sku) } });
    const bySku = new Map(allDemoProducts.map((p) => [p.sku, p]));

    let made = 0;
    for (const s of DEMO_SALES) {
      const lines = s.items.map(([sku, qty]) => ({
        productId:   String(bySku.get(sku)._id),
        qty,
        amountFirst: false,
      }));
      const productMap = new Map(allDemoProducts.map((p) => [String(p._id), p]));

      const computed = computeSale({
        lines,
        products:       productMap,
        workspaceState: DEMO.workspace.state,
        customerState:  s.customer.state || '',
        saleType:       'sale',
        discount:       0,
      });

      const invoiceNumber = await allocateInvoiceNumber();
      const saleItems = computed.lines.map(({ _netQty, _saleByWeight, ...item }) => item);
      const saleDate = dateDaysAgo(s.daysAgo, 10 + made);

      const sale = await Sale.create({
        invoiceNumber,
        type:       'sale',
        customer:   {
          name:    s.customer.name || 'Walk-in Customer',
          phone:   s.customer.phone || '',
          state:   s.customer.state || '',
          email:   '', gstin: '', address: '',
        },
        seller: {
          companyName: settings.workspace.companyName,
          gstin:       settings.workspace.gstin,
          address:     settings.workspace.address,
          state:       settings.workspace.state,
        },
        intraState: computed.intraState,
        items:      saleItems,
        subtotal:   computed.subtotal,
        taxTotal:   computed.taxTotal,
        roundOff:   computed.roundOff,
        grandTotal: computed.grandTotal,
        discount:   0,
        paymentMode: s.mode,
        payment:    { mode: s.mode, received: computed.grandTotal },
        notes:      DEMO_SALE_MARKER,
        status:     'completed',
        createdBy:  user._id,
      });

      // Decrement stock + write OUT ledger entries
      for (const cl of computed.lines) {
        await Product.findByIdAndUpdate(cl.productId, {
          $inc: { stock: d128('-' + cl._netQty.toString()) },
        });
        await Transaction.create({
          productId: cl.productId,
          type:      'OUT',
          quantity:  Number(cl.qty.toString()),
          user:      user._id,
          notes:     `Sale — Invoice ${invoiceNumber}`,
          saleId:    sale._id,
        });
      }

      // Backdate the sale + its OUT transactions so the dashboard shows history.
      // Uses the raw driver: Mongoose marks `createdAt` immutable when timestamps
      // are enabled, so a Model.updateOne($set:createdAt) is silently dropped.
      await Sale.collection.updateOne({ _id: sale._id }, { $set: { createdAt: saleDate, updatedAt: saleDate } });
      await Transaction.collection.updateMany({ saleId: sale._id }, { $set: { createdAt: saleDate, updatedAt: saleDate } });
      made += 1;
    }
    console.log(`💸 Demo sales: ${made} invoices created (GST + stock + ledger applied)`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────');
  console.log('✨ Demo account ready. Log in with:');
  console.log(`   Email:    ${DEMO.user.email}`);
  console.log(`   Password: ${DEMO.user.password}`);
  console.log('   Onboarding wizard will NOT appear (marked 7/7 complete).');
  console.log('──────────────────────────────────────────────');

  await mongoose.disconnect();
  process.exit(0);
})().catch(async (err) => {
  console.error(`\n❌ Seed error: ${err.message}`);
  console.error(err.stack);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
