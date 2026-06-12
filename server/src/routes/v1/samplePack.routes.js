'use strict';
// Sample-pack routes — onboarding wizard step 4 seeding | spec: setup-flow-and-units.md §C.3

const express  = require('express');
const { protect } = require('../../middlewares/auth.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const { seedPackSchema } = require('../../validators/samplePack.validator');
const {
  listPacks,
  seedPack,
  clearPack,
} = require('../../controllers/samplePack.controller');

const router = express.Router();

// All routes require authentication
router.use(protect);

// GET /api/v1/sample-packs — pack metadata list for wizard step 4 picker
router.get('/', listPacks);

// POST /api/v1/sample-packs/seed — bulk-insert chosen pack for authenticated user
router.post('/seed', validate(seedPackSchema), seedPack);

// DELETE /api/v1/sample-packs — clear all sample products (within 30-day window)
router.delete('/', clearPack);

module.exports = router;
