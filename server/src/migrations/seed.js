require('dotenv').config();
const mongoose = require('mongoose');

// Import Models
const User = require('../models/User.model');
const Product = require('../models/Product.model');
const Supplier = require('../models/Supplier.model');
const Transaction = require('../models/Transaction.model');

const migrateDatabase = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/MERNDB';
    
    console.log(`⏳ Connecting to MongoDB instance...`);
    await mongoose.connect(mongoUri);
    console.log(`✅ Connected successfully to: ${mongoUri}`);

    // Flush existing collections for a clean migration state
    console.log(`🧹 Dropping existing collections to prevent duplicates...`);
    await User.deleteMany();
    await Product.deleteMany();
    await Supplier.deleteMany();
    await Transaction.deleteMany();

    // 1. Seed Global Admin Account
    console.log(`🔐 Creating Global Admin Account...`);
    const adminUser = await User.create({
      name: 'System Administrator',
      email: 'admin@smartstock.ai',
      password: 'password123', // Bcrypt hook encrypts automatically
      role: 'admin'
    });

    // 2. Seed Initial Supplier Infrastructure
    console.log(`🏭 Establishing Supply Chain Nodes...`);
    const supplierTech = await Supplier.create({
      name: 'Global Tech Components',
      contactPerson: 'Sarah Chen',
      email: 'logistics@globaltech.com',
      phone: '1-800-555-0199',
      address: 'Silicon Valley Logistics Hub, CA'
    });

    // 3. Seed Production Inventory Data
    // field names updated: price → pricePerUnit, lowStockThreshold → reorderLevel | spec: §6
    console.log(`📦 Populating Initial Inventory Load...`);
    const { Decimal128 } = require('mongoose').Types;
    const d128 = (n) => Decimal128.fromString(String(n));

    const gpuProduct = await Product.create({
      name: 'NVIDIA RTX 4090 GPU Accelerator',
      sku: 'GPU-NV-4090-001',
      category: 'Hardware',
      pricePerUnit: d128(1599.99),
      stock: d128(45),
      reorderLevel: d128(10),
      unit: 'pcs',
      saleByWeight: false,
      schemaVersion: 2,
      supplierId: supplierTech._id
    });

    const displayProduct = await Product.create({
      name: 'Samsung 32" Odyssey OLED Workstation',
      sku: 'MON-SAM-OLED-32',
      category: 'Displays',
      pricePerUnit: d128(899.00),
      stock: d128(5), // Intentionally low to trigger AI/Dashboard alerts
      reorderLevel: d128(15),
      unit: 'pcs',
      saleByWeight: false,
      schemaVersion: 2,
      supplierId: supplierTech._id
    });

    // 4. Seed Initial Transaction Ledger History
    console.log(`🧾 Generating Network Ledger History...`);
    await Transaction.create({
      productId: gpuProduct._id,
      type: 'IN',
      quantity: 45,
      user: adminUser._id,
      notes: 'Initial systemic load from supplier'
    });

    console.log(`✨ MERNDB MIGRATION COMPLETED SUCCESSFULLY!`);
    console.log(`===============================================`);
    console.log(`Email: admin@smartstock.ai`);
    console.log(`Password: password123`);
    console.log(`===============================================`);
    
    process.exit(0);
  } catch (error) {
    console.error(`❌ FATAL MIGRATION ERROR: ${error.message}`);
    process.exit(1);
  }
};

// Execute Migration
migrateDatabase();
