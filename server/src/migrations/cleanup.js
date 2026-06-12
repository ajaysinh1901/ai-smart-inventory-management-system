require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../models/User.model');
const Product = require('../models/Product.model');
const Sale = require('../models/Sale.model');
const Counter = require('../models/Counter.model');

(async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/MERNDB';
  console.log(`⏳ Connecting to ${mongoUri}...`);
  await mongoose.connect(mongoUri);

  const rogueEmailRegex = /^(sneaky-|proof2-|sneaky-verify|normal-verify|staff@test|qa-)/i;
  const rogueUsers = await User.find({ email: rogueEmailRegex }, 'email role').lean();
  console.log(`🧹 Rogue users to remove: ${rogueUsers.length}`);
  rogueUsers.forEach(u => console.log(`   - ${u.email} (${u.role})`));
  const userResult = await User.deleteMany({ email: rogueEmailRegex });
  console.log(`   removed: ${userResult.deletedCount}`);

  const testSkuRegex = /^(QA-TEST|LONG-VERIFY|VERIFY-)/i;
  const testProducts = await Product.find({ sku: testSkuRegex }, 'sku name').lean();
  console.log(`🧹 Test probe products to remove: ${testProducts.length}`);
  testProducts.forEach(p => console.log(`   - ${p.sku} ${p.name?.slice(0, 40)}`));
  const productResult = await Product.deleteMany({ sku: testSkuRegex });
  console.log(`   removed: ${productResult.deletedCount}`);

  const allSales = await Sale.countDocuments();
  console.log(`🧹 Sales documents to purge: ${allSales}`);
  const saleResult = await Sale.deleteMany({});
  console.log(`   removed: ${saleResult.deletedCount}`);

  const counterResult = await Counter.deleteMany({});
  console.log(`🧹 Counter docs reset: ${counterResult.deletedCount}`);

  console.log(`\n✨ Cleanup complete. Demo DB restored.`);
  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error(`❌ Cleanup error: ${err.message}`);
  process.exit(1);
});
