const express = require('express');
const { register, login, getMe, updateProfile, logout } = require('../../controllers/auth.controller');
const { protect } = require('../../middlewares/auth.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const { authLimiter } = require('../../middlewares/rateLimiter.middleware');
const {
  registerSchema,
  loginSchema,
  updateProfileSchema,
} = require('../../validators/auth.validator');

const router = express.Router();

router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login',    authLimiter, validate(loginSchema),    login);
router.get('/me', protect, getMe);
router.put('/update', protect, validate(updateProfileSchema), updateProfile);
router.post('/logout', logout);

module.exports = router;
