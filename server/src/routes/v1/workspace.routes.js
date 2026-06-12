// Workspace + onboarding routes.
// All routes require auth (protect middleware).
// spec: setup-flow-and-units.md §C.2, §C.5
'use strict';

const express = require('express');
const { protect } = require('../../middlewares/auth.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const {
  patchWorkspaceSchema,
  patchOnboardingSchema,
} = require('../../validators/workspace.validator');
const {
  getWorkspace,
  patchWorkspace,
  getOnboarding,
  patchOnboarding,
  dismissOnboarding,
} = require('../../controllers/workspace.controller');

const router = express.Router();

// All workspace routes require a valid JWT
router.use(protect);

// Full workspace block (workspace + onboarding)
router.get('/', getWorkspace);
router.patch('/', validate(patchWorkspaceSchema), patchWorkspace);

// Onboarding resume state
router.get('/onboarding', getOnboarding);
router.patch('/onboarding', validate(patchOnboardingSchema), patchOnboarding);

// Dismiss the wizard (moves it to Settings → Setup, never deleted)
router.post('/onboarding/dismiss', dismissOnboarding);

module.exports = router;
