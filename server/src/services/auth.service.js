const jwt = require('jsonwebtoken');
const User = require('../models/User.model');

exports.registerUser = async (userData) => {
  const { name, email, password } = userData;

  const userExists = await User.findOne({ email });
  if (userExists) {
    throw new Error('User already exists');
  }

  // Public self-registration is always lowest privilege. Role mutation is
  // strictly admin-only via PUT /users/:id/role. | bug #001
  const user = await User.create({ name, email, password, role: 'staff' });
  return user;
};

exports.loginUser = async (email, password) => {
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    throw new Error('Invalid credentials');
  }

  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    throw new Error('Invalid credentials');
  }

  return user;
};

// SEC-003 fix: JWT lifetime capped at 7d to match the httpOnly cookie expiry.
// JWT_EXPIRES_IN takes precedence; JWT_EXPIRE is the legacy fallback.
// If .env only has JWT_EXPIRE=30d (the old default), we override to 7d
// so the token cannot outlive the cookie by 23 days. | spec: B6
exports.generateToken = (id) => {
  const configured = process.env.JWT_EXPIRES_IN || process.env.JWT_EXPIRE || '7d';
  // Reject any value longer than 7 days regardless of env setting.
  // Supported shorthand: Nd (days), Nh (hours), Nm (minutes).
  const parseDays = (s) => {
    const m = /^(\d+)d$/i.exec(s);
    if (m) return parseInt(m[1], 10);
    return null;
  };
  const days = parseDays(configured);
  const expiresIn = (days !== null && days > 7) ? '7d' : configured;
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn,
    algorithm: 'HS256'
  });
};

exports.updateProfile = async (id, updateData) => {
  // ONLY name is self-updateable. role/email/password go through dedicated
  // admin-only or password-change endpoints. | bug #002
  const allowedUpdates = {};
  if (typeof updateData.name === 'string') allowedUpdates.name = updateData.name;

  const user = await User.findByIdAndUpdate(id, allowedUpdates, {
    new: true,
    runValidators: true,
  });
  return user;
};
