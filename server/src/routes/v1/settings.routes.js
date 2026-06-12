const express = require('express');
const { getSettings, updateSettings, updatePassword } = require('../../controllers/settings.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const {
  updateSettingsSchema,
  updatePasswordSchema,
} = require('../../validators/settings.validator');

const router = express.Router();
router.use(protect);

router.get('/', getSettings);
router.put('/', validate(updateSettingsSchema), updateSettings);
router.put('/password', validate(updatePasswordSchema), updatePassword);

module.exports = router;
