/**
 * Professional Store Seed — SmartStock AI
 *
 * Wipes Product / Supplier / Sale / Transaction / Counter collections (Users preserved)
 * and populates the database with a realistic ~6 month dataset for a
 * Gujarat-based Indian electronics retailer ("Apex Electro Distributors"):
 *   - 6 distributor suppliers with valid-format GSTINs
 *   - 40 SKUs across 8 categories (laptops, monitors, components, peripherals,
 *     networking, storage, printers, accessories)
 *   - ~100 sales spanning 2025-11-01 → 2026-04-28
 *     · 70% intra-state Gujarat (CGST 9% + SGST 9%)
 *     · 30% inter-state (IGST 18%)
 *   - Mirror IN/OUT transactions for every stock movement
 *   - Counter `invoice-2026` synced to last invoice number issued
 *
 * Run: node src/migrations/seed-professional.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../models/User.model');
const Product = require('../models/Product.model');
const Supplier = require('../models/Supplier.model');
const Sale = require('../models/Sale.model');
const Transaction = require('../models/Transaction.model');
const Counter = require('../models/Counter.model');

// ---------- Deterministic PRNG so re-runs are reproducible ----------
let __seed = 1729;
function rand() {
  __seed = (__seed * 9301 + 49297) % 233280;
  return __seed / 233280;
}
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function weightedPick(items) {
  const total = items.reduce((s, i) => s + i.w, 0);
  let r = rand() * total;
  for (const it of items) { if ((r -= it.w) <= 0) return it.v; }
  return items[items.length - 1].v;
}

// ---------- Seller (us) ----------
const SELLER = {
  companyName: 'Apex Electro Distributors',
  gstin: '24AAACA1234B1Z9',
  address: 'Shop 14, Iscon Mega Mall, S.G. Highway, Ahmedabad - 380015',
  state: 'Gujarat',
};

// ---------- Suppliers ----------
const SUPPLIERS = [
  { name: 'Ingram Micro India Pvt Ltd',  contactPerson: 'Rohit Mehra',     email: 'rohit.mehra@ingrammicro.in',  phone: '+91 22 6661 8000', address: 'A Wing, Marathon Futurex, NM Joshi Marg, Mumbai - 400013', gst: '27AABCI1234L1Z3' },
  { name: 'Redington (India) Limited',   contactPerson: 'Suresh Iyer',     email: 'suresh.iyer@redington.co.in', phone: '+91 44 4224 3434', address: 'Centre Point, Plot No 11, Old Mahabalipuram Rd, Chennai - 600096', gst: '33AAACR3456M1Z8' },
  { name: 'Rashi Peripherals Pvt Ltd',   contactPerson: 'Neha Kapoor',     email: 'neha.kapoor@rptechindia.com', phone: '+91 22 4087 0000', address: 'Plot 6, MIDC, Andheri (E), Mumbai - 400093', gst: '27AABCR7890K1Z1' },
  { name: 'Compuage Infocom Limited',    contactPerson: 'Vikram Shah',     email: 'vikram.shah@compuageindia.com', phone: '+91 22 6726 0000', address: 'D-601, Lotus Corporate Park, Goregaon (E), Mumbai - 400063', gst: '27AAACC4567P1Z2' },
  { name: 'Iris Global Services Pvt',    contactPerson: 'Ankita Sharma',   email: 'ankita@irisglobal.in',        phone: '+91 11 4905 0000', address: 'Plot No 16, Udyog Vihar Phase IV, Gurugram - 122015', gst: '06AAACI8901Q1Z4' },
  { name: 'Acro Engineering Co.',         contactPerson: 'Pratik Desai',    email: 'pratik@acroengg.in',          phone: '+91 79 2658 4321', address: 'GIDC Vatva, Ahmedabad - 382445', gst: '24AABCA2345R1Z7' },
];

// ---------- Product catalog ----------
// HSN codes (used on sale line items, not on Product itself):
//   8471 = computers/laptops, 8528 = monitors, 8542 = GPUs/integrated circuits,
//   8473 = parts/accessories of computers, 8443 = printers, 8517 = networking,
//   8536 = cables/connectors, 8523 = SSD/HDD storage media
const CATALOG = [
  // Laptops (Ingram)
  { name: 'Dell Inspiron 15 3520 i5 12th Gen 8GB/512GB',     sku: 'LAP-DELL-INS3520-I5',  category: 'Laptops',     price: 56500, hsn: '8471', sup: 0 },
  { name: 'HP Pavilion 14 Ryzen 5 7530U 16GB/512GB',          sku: 'LAP-HP-PAV14-R5',      category: 'Laptops',     price: 64900, hsn: '8471', sup: 0 },
  { name: 'Lenovo IdeaPad Slim 3 i3 12th Gen 8GB/256GB',      sku: 'LAP-LEN-IPS3-I3',      category: 'Laptops',     price: 38900, hsn: '8471', sup: 0 },
  { name: 'ASUS Vivobook 15 i5 13th Gen 16GB/512GB',          sku: 'LAP-ASUS-VB15-I5',     category: 'Laptops',     price: 67500, hsn: '8471', sup: 1 },
  { name: 'Acer Aspire 5 i7 13th Gen 16GB/512GB',             sku: 'LAP-ACER-A5-I7',       category: 'Laptops',     price: 78900, hsn: '8471', sup: 1 },
  // Monitors (Redington)
  { name: 'LG 22MK430H 22" Full HD IPS Monitor',              sku: 'MON-LG-22MK430',       category: 'Monitors',    price: 8499,  hsn: '8528', sup: 1 },
  { name: 'Samsung LS24R350 24" IPS 75Hz Monitor',            sku: 'MON-SAM-LS24R350',     category: 'Monitors',    price: 11200, hsn: '8528', sup: 1 },
  { name: 'Dell P2422H 24" IPS Full HD Monitor',              sku: 'MON-DELL-P2422H',      category: 'Monitors',    price: 14600, hsn: '8528', sup: 0 },
  { name: 'BenQ GW2780 27" Eye-care IPS Monitor',             sku: 'MON-BENQ-GW2780',      category: 'Monitors',    price: 17200, hsn: '8528', sup: 1 },
  { name: 'LG 27UP650 27" 4K UHD HDR Monitor',                sku: 'MON-LG-27UP650',       category: 'Monitors',    price: 32400, hsn: '8528', sup: 1 },
  // Components — Rashi
  { name: 'Intel Core i5-13400F Processor',                   sku: 'CPU-INTEL-13400F',     category: 'Components',  price: 19800, hsn: '8542', sup: 2 },
  { name: 'AMD Ryzen 5 7600 Processor',                       sku: 'CPU-AMD-7600',         category: 'Components',  price: 22500, hsn: '8542', sup: 2 },
  { name: 'MSI B760M PRO-VDH WiFi Motherboard',               sku: 'MB-MSI-B760M-PROVDH',  category: 'Components',  price: 14200, hsn: '8473', sup: 2 },
  { name: 'ASUS PRIME B650-PLUS Motherboard',                 sku: 'MB-ASUS-B650PLUS',     category: 'Components',  price: 18900, hsn: '8473', sup: 2 },
  { name: 'Corsair Vengeance 16GB DDR5 5600MHz',              sku: 'RAM-COR-V16G-DDR5',    category: 'Components',  price: 4800,  hsn: '8473', sup: 2 },
  { name: 'G.Skill Ripjaws 32GB(2x16) DDR4 3600',             sku: 'RAM-GS-RJ32G-DDR4',    category: 'Components',  price: 6900,  hsn: '8473', sup: 2 },
  { name: 'NVIDIA RTX 4060 8GB MSI Ventus 2X',                sku: 'GPU-MSI-RTX4060-V2X',  category: 'Components',  price: 31800, hsn: '8542', sup: 2 },
  { name: 'NVIDIA RTX 4070 12GB Gigabyte WindForce',          sku: 'GPU-GB-RTX4070-WF',    category: 'Components',  price: 53200, hsn: '8542', sup: 2 },
  { name: 'Corsair RM750e 750W 80+ Gold PSU',                 sku: 'PSU-COR-RM750E',       category: 'Components',  price: 8400,  hsn: '8473', sup: 2 },
  // Peripherals — Compuage
  { name: 'Logitech MK270r Wireless Keyboard Mouse Combo',    sku: 'PER-LOG-MK270R',       category: 'Peripherals', price: 1499,  hsn: '8473', sup: 3 },
  { name: 'Logitech G102 Lightsync Gaming Mouse',             sku: 'PER-LOG-G102',         category: 'Peripherals', price: 1099,  hsn: '8473', sup: 3 },
  { name: 'HP K500F Membrane Wired Gaming Keyboard',          sku: 'PER-HP-K500F',         category: 'Peripherals', price: 999,   hsn: '8473', sup: 3 },
  { name: 'Logitech C270 HD Webcam 720p',                     sku: 'PER-LOG-C270',         category: 'Peripherals', price: 1799,  hsn: '8473', sup: 3 },
  { name: 'Logitech H390 USB Headset',                        sku: 'PER-LOG-H390',         category: 'Peripherals', price: 2299,  hsn: '8473', sup: 3 },
  { name: 'JBL Tune 510BT Wireless Headphones',               sku: 'PER-JBL-T510BT',       category: 'Peripherals', price: 2799,  hsn: '8518', sup: 3 },
  // Networking — Iris
  { name: 'TP-Link Archer C6 AC1200 Router',                  sku: 'NET-TPL-C6',           category: 'Networking',  price: 2099,  hsn: '8517', sup: 4 },
  { name: 'TP-Link Archer AX23 WiFi6 Router',                 sku: 'NET-TPL-AX23',         category: 'Networking',  price: 4499,  hsn: '8517', sup: 4 },
  { name: 'D-Link DGS-1008A 8-Port Gigabit Switch',           sku: 'NET-DLI-DGS1008A',     category: 'Networking',  price: 1899,  hsn: '8517', sup: 4 },
  { name: 'TP-Link TL-WN725N USB WiFi Adapter',               sku: 'NET-TPL-WN725N',       category: 'Networking',  price: 449,   hsn: '8517', sup: 4 },
  // Storage — Rashi
  { name: 'Samsung 980 NVMe 1TB SSD',                         sku: 'STO-SAM-980-1TB',      category: 'Storage',     price: 6499,  hsn: '8523', sup: 2 },
  { name: 'WD Blue SN570 500GB NVMe SSD',                     sku: 'STO-WD-SN570-500',     category: 'Storage',     price: 3399,  hsn: '8523', sup: 2 },
  { name: 'Seagate Barracuda 2TB 7200RPM HDD',                sku: 'STO-SEA-BAR-2TB',      category: 'Storage',     price: 4799,  hsn: '8523', sup: 2 },
  { name: 'SanDisk Ultra 64GB USB 3.0 Pen Drive',             sku: 'STO-SD-ULT-64G',       category: 'Storage',     price: 549,   hsn: '8523', sup: 4 },
  // Printers — Ingram / Redington
  { name: 'HP DeskJet 2331 All-in-One Printer',               sku: 'PRN-HP-DJ2331',        category: 'Printers',    price: 4699,  hsn: '8443', sup: 0 },
  { name: 'Canon PIXMA G3010 Ink Tank Printer',               sku: 'PRN-CAN-G3010',        category: 'Printers',    price: 13499, hsn: '8443', sup: 1 },
  { name: 'Epson EcoTank L3210 All-in-One',                   sku: 'PRN-EPS-L3210',        category: 'Printers',    price: 13899, hsn: '8443', sup: 1 },
  { name: 'Brother HL-B2000D Mono Laser Printer',             sku: 'PRN-BRO-B2000D',       category: 'Printers',    price: 14200, hsn: '8443', sup: 1 },
  // Accessories — Acro / Compuage
  { name: 'AmazonBasics HDMI 2.0 Cable 2m',                   sku: 'ACC-AMZ-HDMI-2M',      category: 'Accessories', price: 299,   hsn: '8536', sup: 5 },
  { name: 'Anker PowerLine USB-C to USB-C 1m',                sku: 'ACC-ANK-USBC-1M',      category: 'Accessories', price: 699,   hsn: '8536', sup: 5 },
  { name: 'APC Back-UPS BX600C-IN 600VA',                     sku: 'ACC-APC-BX600',        category: 'Accessories', price: 4299,  hsn: '8504', sup: 3 },
  { name: 'Belkin SurgeMaster 6-Outlet Surge Protector',      sku: 'ACC-BLK-6OUT-SURGE',   category: 'Accessories', price: 1499,  hsn: '8536', sup: 5 },
];

// ---------- Customers ----------
// 70% Gujarat (intra-state) / 30% other states (inter-state)
const GUJARAT_CUSTOMERS = [
  { name: 'Walk-in Customer', email: '', phone: '', gstin: '', address: '', state: 'Gujarat' },
  { name: 'Patel Computer Solutions', email: 'orders@patelcompsol.in', phone: '+91 79 2630 1212', gstin: '24AABCP5566N1Z3', address: 'Shop 22, Sindhubhavan Road, Ahmedabad - 380054', state: 'Gujarat' },
  { name: 'Shah Office Systems', email: 'shahoffice@gmail.com', phone: '+91 98250 11223', gstin: '24AAACS9988L1Z2', address: 'Ring Road, Surat - 395002', state: 'Gujarat' },
  { name: 'Vadodara Tech Hub LLP', email: 'sales@vadodaratechhub.com', phone: '+91 265 235 4477', gstin: '24AABFV3344K1Z9', address: 'Alkapuri, Vadodara - 390007', state: 'Gujarat' },
  { name: 'Rajkot Digital World', email: 'rajkotdigital@yahoo.com', phone: '+91 281 244 9090', gstin: '24AABCR1122M1Z5', address: '150 Ft Ring Road, Rajkot - 360005', state: 'Gujarat' },
  { name: 'Mehta Stationers & IT', email: 'mehta.stationers@rediffmail.com', phone: '+91 79 4042 5151', gstin: '', address: 'CG Road, Ahmedabad - 380009', state: 'Gujarat' },
  { name: 'Krishna Enterprise', email: 'krishna.ent@gmail.com', phone: '+91 98985 33445', gstin: '24AAGFK7788P1Z6', address: 'Maninagar, Ahmedabad - 380008', state: 'Gujarat' },
  { name: 'Anand Bharti', email: 'anand.bharti@gmail.com', phone: '+91 99098 22115', gstin: '', address: 'Bopal, Ahmedabad - 380058', state: 'Gujarat' },
  { name: 'Kavita Trivedi', email: 'k.trivedi@outlook.com', phone: '+91 97120 88774', gstin: '', address: 'Vesu, Surat - 395007', state: 'Gujarat' },
  { name: 'Gandhinagar Govt Stationery Dept', email: 'procurement@ggsd.gov.in', phone: '+91 79 2325 6677', gstin: '24AAAGG1010T1ZQ', address: 'Sector 17, Gandhinagar - 382017', state: 'Gujarat' },
];
const INTERSTATE_CUSTOMERS = [
  { name: 'Mumbai Computer Bazaar', email: 'mcb.sales@gmail.com', phone: '+91 22 6655 8899', gstin: '27AABCM4321K1Z6', address: 'Lamington Road, Mumbai - 400007', state: 'Maharashtra' },
  { name: 'Delhi IT Plaza', email: 'orders@delhiitplaza.in', phone: '+91 11 4567 1212', gstin: '07AABFD9988R1Z3', address: 'Nehru Place, New Delhi - 110019', state: 'Delhi' },
  { name: 'Bangalore Tech Mart', email: 'sales@bangaloretechmart.com', phone: '+91 80 4123 5566', gstin: '29AAACB6677Q1Z1', address: 'SP Road, Bangalore - 560002', state: 'Karnataka' },
  { name: 'Pune Hardware Hub', email: 'pune.hwhub@gmail.com', phone: '+91 20 2566 3344', gstin: '27AABCP3322L1Z8', address: 'Deccan Gymkhana, Pune - 411004', state: 'Maharashtra' },
  { name: 'Jaipur Digital Stores', email: 'jaipurdigital@yahoo.in', phone: '+91 141 222 8800', gstin: '08AABCJ5544N1Z4', address: 'MI Road, Jaipur - 302001', state: 'Rajasthan' },
  { name: 'Chennai Compu Mart', email: 'cmm.sales@gmail.com', phone: '+91 44 2811 9090', gstin: '33AABCC7711M1Z2', address: 'Ritchie Street, Chennai - 600002', state: 'Tamil Nadu' },
  { name: 'Hyderabad IT Corner', email: 'hyd.itcorner@gmail.com', phone: '+91 40 2345 1212', gstin: '36AABCH8800P1Z9', address: 'CTC Complex, Hyderabad - 500001', state: 'Telangana' },
  { name: 'Karan Malhotra', email: 'karan.malhotra87@gmail.com', phone: '+91 98101 44556', gstin: '', address: 'Saket, New Delhi - 110017', state: 'Delhi' },
];

// ---------- Helpers ----------
function isoDate(daysAgoFromNow, hour = null, minute = null) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgoFromNow);
  d.setHours(hour ?? randInt(10, 19), minute ?? randInt(0, 59), randInt(0, 59), 0);
  return d;
}
function round2(n) { return Math.round(n * 100) / 100; }

(async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/MERNDB';
  console.log(`⏳ Connecting to ${mongoUri}...`);
  await mongoose.connect(mongoUri);

  // ----- Wipe inventory + sales data (preserve users) -----
  console.log('\n🧹 Wiping inventory / sales / counters (users preserved)...');
  await Promise.all([
    Product.deleteMany({}),
    Supplier.deleteMany({}),
    Sale.deleteMany({}),
    Transaction.deleteMany({}),
    Counter.deleteMany({}),
  ]);
  console.log('   ✓ collections cleared');

  // ----- Pick admin user for `createdBy` / transaction `user` -----
  const admin = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 }).lean();
  if (!admin) {
    console.error('❌ No admin user found — cannot seed (need a user for createdBy/user fields).');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`   ↳ using admin: ${admin.email}`);

  // ----- Suppliers -----
  console.log('\n📦 Creating suppliers...');
  const supplierDocs = await Supplier.insertMany(SUPPLIERS);
  console.log(`   ✓ ${supplierDocs.length} suppliers inserted`);

  // ----- Products + initial stock -----
  console.log('\n🛒 Creating products with initial stock...');
  const { Decimal128 } = require('mongoose').Types;
  const d128 = (n) => Decimal128.fromString(String(n));

  const productDocsToInsert = CATALOG.map(p => {
    // Initial stock: laptops/printers lower (8-25), components mid (15-40), accessories higher (40-120)
    let initialStock;
    if (['Laptops', 'Printers', 'Monitors'].includes(p.category)) initialStock = randInt(8, 25);
    else if (p.category === 'Components') initialStock = randInt(12, 35);
    else if (p.category === 'Storage') initialStock = randInt(15, 40);
    else initialStock = randInt(30, 90);
    // field names updated: price → pricePerUnit, lowStockThreshold → reorderLevel | spec: §6
    return {
      name: p.name,
      sku: p.sku,
      category: p.category,
      pricePerUnit: d128(p.price),
      costPrice: d128(Math.round(p.price * 0.75)),
      stock: d128(initialStock),
      reorderLevel: d128(p.category === 'Laptops' || p.category === 'Printers' ? 5 : 10),
      unit: 'pcs',
      saleByWeight: false,
      schemaVersion: 2,
      supplierId: supplierDocs[p.sup]._id,
    };
  });
  const productDocs = await Product.insertMany(productDocsToInsert);
  // Build lookup: sku -> {doc, hsn, originalStock}
  const skuMap = {};
  productDocs.forEach((doc, i) => {
    skuMap[doc.sku] = { doc, hsn: CATALOG[i].hsn, originalStock: doc.stock };
  });
  console.log(`   ✓ ${productDocs.length} products inserted`);

  // ----- Initial IN transactions (purchase orders) -----
  console.log('\n📥 Logging initial purchase IN transactions...');
  const inTxns = productDocs.map(p => ({
    productId: p._id,
    type: 'IN',
    quantity: p.stock,
    user: admin._id,
    notes: `Opening stock — initial purchase from supplier`,
    createdAt: isoDate(190, 10, 30), // ~6.3 months ago
    updatedAt: isoDate(190, 10, 30),
  }));
  await Transaction.insertMany(inTxns, { timestamps: false });
  console.log(`   ✓ ${inTxns.length} IN transactions logged`);

  // ----- Generate sales (~110 over last ~180 days) -----
  console.log('\n💸 Generating historical sales (Nov 2025 → Apr 2026)...');
  const NUM_SALES = 110;
  const sales = [];
  const outTxns = [];
  // Track per-product stock as we sell
  const stockLeft = {};
  productDocs.forEach(p => { stockLeft[p._id.toString()] = p.stock; });

  let invoiceSeq2025 = 0;
  let invoiceSeq2026 = 0;

  // Generate sale dates with weighted distribution: more sales recent
  // Days ago from today distributed more densely toward 0
  const saleDates = [];
  for (let i = 0; i < NUM_SALES; i++) {
    // bias towards smaller daysAgo (recent) using sqrt distribution
    const r = rand();
    const daysAgo = Math.floor(Math.pow(r, 1.6) * 178) + 1; // 1..178 days ago
    saleDates.push(daysAgo);
  }
  saleDates.sort((a, b) => b - a); // oldest first so invoice numbers stay chronological

  for (let i = 0; i < NUM_SALES; i++) {
    const daysAgo = saleDates[i];
    const saleDate = isoDate(daysAgo);
    const year = saleDate.getFullYear();

    // 70/30 intra/inter-state
    const isInterstate = rand() < 0.30;
    const customer = isInterstate ? pick(INTERSTATE_CUSTOMERS) : pick(GUJARAT_CUSTOMERS);

    // 1-5 line items, weighted toward 1-2
    const numLines = weightedPick([
      { v: 1, w: 35 }, { v: 2, w: 28 }, { v: 3, w: 18 }, { v: 4, w: 11 }, { v: 5, w: 8 },
    ]);

    // Sometimes prefer high-ticket (laptops/monitors) ~ 25% of sales
    const isHighTicket = rand() < 0.25;
    const eligibleProducts = productDocs.filter(p => {
      if (stockLeft[p._id.toString()] <= 0) return false;
      if (isHighTicket) return ['Laptops', 'Monitors', 'Printers', 'Components'].includes(p.category);
      return true;
    });
    if (eligibleProducts.length === 0) continue;

    const items = [];
    let subtotal = 0;
    const usedIds = new Set();

    for (let l = 0; l < numLines; l++) {
      // pick a product not already in this sale
      const candidates = eligibleProducts.filter(p => !usedIds.has(p._id.toString()) && stockLeft[p._id.toString()] > 0);
      if (candidates.length === 0) break;
      const product = pick(candidates);
      usedIds.add(product._id.toString());

      // Quantity: cheap items 1-5, expensive items 1-2
      let qty;
      if (product.price > 30000) qty = randInt(1, 2);
      else if (product.price > 8000) qty = randInt(1, 3);
      else qty = randInt(1, 5);
      qty = Math.min(qty, stockLeft[product._id.toString()]);
      if (qty <= 0) continue;

      stockLeft[product._id.toString()] -= qty;
      const lineSubtotal = round2(qty * product.price);
      subtotal += lineSubtotal;

      items.push({
        productId: product._id,
        productName: product.name,
        sku: product.sku,
        quantity: qty,
        unitPrice: product.price,
        subtotal: lineSubtotal,
        hsnCode: skuMap[product.sku].hsn,
      });
    }

    if (items.length === 0) continue;

    // Discount: 0 most of the time, occasional 2-8% off subtotal for high-value
    let discount = 0;
    if (subtotal > 25000 && rand() < 0.35) {
      const pct = randInt(2, 8) / 100;
      discount = round2(subtotal * pct);
    }
    const taxableBase = round2(subtotal - discount);
    const taxRate = 18;
    const taxAmount = round2(taxableBase * taxRate / 100);

    let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;
    if (isInterstate) {
      igstAmount = taxAmount;
    } else {
      cgstAmount = round2(taxAmount / 2);
      sgstAmount = round2(taxAmount - cgstAmount);
    }
    const total = round2(taxableBase + taxAmount);

    // Invoice number per fiscal/calendar year (matches model logic which uses calendar year)
    let invoiceNumber;
    if (year === 2025) {
      invoiceSeq2025 += 1;
      invoiceNumber = `INV-2025-${String(invoiceSeq2025).padStart(5, '0')}`;
    } else {
      invoiceSeq2026 += 1;
      invoiceNumber = `INV-2026-${String(invoiceSeq2026).padStart(5, '0')}`;
    }

    const saleId = new mongoose.Types.ObjectId();
    sales.push({
      _id: saleId,
      invoiceNumber,
      customer: {
        name: customer.name,
        email: customer.email || '',
        phone: customer.phone || '',
        gstin: customer.gstin || '',
        address: customer.address || '',
        state: customer.state,
      },
      seller: { ...SELLER },
      gst: {
        isInterstate,
        cgstRate: 9,
        sgstRate: 9,
        igstRate: 18,
        cgstAmount,
        sgstAmount,
        igstAmount,
      },
      items,
      subtotal: round2(subtotal),
      taxRate,
      taxAmount,
      discount,
      total,
      notes: '',
      status: 'completed',
      createdBy: admin._id,
      createdAt: saleDate,
      updatedAt: saleDate,
    });

    // Mirror OUT transactions
    items.forEach(line => {
      outTxns.push({
        productId: line.productId,
        type: 'OUT',
        quantity: line.quantity,
        user: admin._id,
        notes: `Sale ${invoiceNumber}`,
        saleId,
        createdAt: saleDate,
        updatedAt: saleDate,
      });
    });
  }

  // Bulk insert sales (bypass pre-save hook because invoiceNumber is pre-set)
  await Sale.insertMany(sales, { timestamps: false });
  console.log(`   ✓ ${sales.length} sales inserted (${invoiceSeq2025} in 2025, ${invoiceSeq2026} in 2026)`);

  // Insert OUT transactions
  await Transaction.insertMany(outTxns, { timestamps: false });
  console.log(`   ✓ ${outTxns.length} OUT transactions logged`);

  // Update product stock to reflect all sales
  console.log('\n📉 Updating product stock to reflect sales...');
  // stock is Decimal128 in v2 schema | spec: §6
  const stockUpdates = productDocs.map(p =>
    Product.updateOne({ _id: p._id }, { $set: { stock: d128(stockLeft[p._id.toString()]) } })
  );
  await Promise.all(stockUpdates);
  console.log('   ✓ stock levels updated');

  // ----- Sync counters -----
  console.log('\n🔢 Syncing invoice counters...');
  await Counter.findOneAndUpdate(
    { _id: 'invoice-2025' },
    { $set: { seq: invoiceSeq2025 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await Counter.findOneAndUpdate(
    { _id: 'invoice-2026' },
    { $set: { seq: invoiceSeq2026 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log(`   ✓ invoice-2025 → ${invoiceSeq2025}`);
  console.log(`   ✓ invoice-2026 → ${invoiceSeq2026}`);

  // ----- Summary -----
  const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
  const totalTax = sales.reduce((s, x) => s + x.taxAmount, 0);
  const intra = sales.filter(s => !s.gst.isInterstate).length;
  const inter = sales.length - intra;
  // reorderLevel (renamed) | spec: §6
  const lowStock = productDocs.filter(p => stockLeft[p._id.toString()] <= Number(p.reorderLevel.toString())).length;
  const outOfStock = productDocs.filter(p => stockLeft[p._id.toString()] <= 0).length;

  console.log('\n📊 Seed summary:');
  console.log(`   suppliers:        ${supplierDocs.length}`);
  console.log(`   products:         ${productDocs.length}`);
  console.log(`   sales:            ${sales.length}  (intra ${intra} / inter ${inter})`);
  console.log(`   transactions:     ${inTxns.length + outTxns.length}  (IN ${inTxns.length} / OUT ${outTxns.length})`);
  console.log(`   total revenue:    ₹${totalRevenue.toLocaleString('en-IN')}`);
  console.log(`   total GST:        ₹${totalTax.toLocaleString('en-IN')}`);
  console.log(`   low-stock items:  ${lowStock}  (out-of-stock: ${outOfStock})`);

  console.log('\n✨ Professional store seed complete.');
  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error(`\n❌ Seed error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
