// Public health-check endpoint. | spec: B5
const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

router.get('/', (req, res) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  res.status(200).json({
    status: 'ok',
    db: dbState === 1 ? 'connected' : 'disconnected',
    uptime: Math.round(process.uptime()),
    version: '1.0.0',
  });
});

module.exports = router;
