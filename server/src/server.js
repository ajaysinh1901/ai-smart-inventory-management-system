require('dotenv').config();
const app = require('./app');
const mongoose = require('mongoose');

const PORT = process.env.PORT || 5000;

// Last-resort safety net: a failure inside a background library worker
// (e.g. the tesseract.js OCR worker) must not take the whole server down for
// every user. Log it and keep serving — genuine fixes belong at the call site.
process.on('uncaughtException', (err) => {
  console.error('❌ uncaughtException (server kept alive):', err?.stack || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('❌ unhandledRejection (server kept alive):', reason?.stack || reason);
});

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/MERNDB');
    console.log(`✅ MongoDB Connected to MERNDB`);

    // Register background jobs once DB is ready | spec: C2
    try {
      const { scheduleSmartAlerts } = require('./crons/smartAlerts.cron');
      scheduleSmartAlerts(process.env.SMART_ALERTS_CRON || '0 9 * * *');
    } catch (err) {
      console.warn('⚠️  Could not register smart-alerts cron:', err.message);
    }
  } catch (error) {
    console.error(`❌ DB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

connectDB();

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
