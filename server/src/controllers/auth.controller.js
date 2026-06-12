const authService = require('../services/auth.service');

// In-memory failed-login tracker. | spec: B6
// Limitation: process-local map; if the server runs multi-instance the lockout
// is per-instance, not global. Acceptable for single-instance MVP. Replace with
// Redis-backed counter for horizontal scaling.
const FAILED_ATTEMPTS = new Map(); // email -> { count, firstAttemptAt, lockedUntil }
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 min sliding window
const LOCK_DURATION_MS = 15 * 60 * 1000;  // 15 min lockout

const getRecord = (email) => FAILED_ATTEMPTS.get(email);

const isLocked = (record) =>
  !!record && record.lockedUntil && record.lockedUntil > Date.now();

const registerFailure = (email) => {
  const now = Date.now();
  const existing = FAILED_ATTEMPTS.get(email);

  // Reset window if last attempt is older than window
  if (!existing || now - existing.firstAttemptAt > ATTEMPT_WINDOW_MS) {
    FAILED_ATTEMPTS.set(email, { count: 1, firstAttemptAt: now, lockedUntil: null });
    return;
  }

  existing.count += 1;
  if (existing.count >= MAX_ATTEMPTS) {
    existing.lockedUntil = now + LOCK_DURATION_MS;
  }
  FAILED_ATTEMPTS.set(email, existing);
};

const clearFailures = (email) => {
  FAILED_ATTEMPTS.delete(email);
};

const sendTokenResponse = (user, statusCode, res) => {
  const token = authService.generateToken(user._id);

  const options = {
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days | spec: B6
    httpOnly: true,
  };

  if (process.env.NODE_ENV === 'production') {
    options.secure = true;
  }

  // SEC-007 note: token is returned in the JSON body for API / mobile client compatibility.
  // Browser clients should rely on the httpOnly cookie instead of storing this value.
  // Risk is mitigated by the 7-day lifetime cap applied in auth.service.generateToken. | spec: B6
  res.status(statusCode).cookie('token', token, options).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
};

// 1. POST /api/auth/register | creates a user and returns JWT cookie
exports.register = async (req, res) => {
  try {
    const user = await authService.registerUser(req.body);
    sendTokenResponse(user, 201, res);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// 2. POST /api/auth/login | with lockout after 5 failed attempts in 15 min | spec: B6
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide an email and password' });
    }

    const record = getRecord(email);
    if (isLocked(record)) {
      const minutesLeft = Math.max(1, Math.ceil((record.lockedUntil - Date.now()) / 60000));
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`,
      });
    }

    let user;
    try {
      user = await authService.loginUser(email, password);
    } catch (err) {
      registerFailure(email);
      const after = getRecord(email);
      if (isLocked(after)) {
        const minutesLeft = Math.max(1, Math.ceil((after.lockedUntil - Date.now()) / 60000));
        return res.status(429).json({
          success: false,
          message: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`,
        });
      }
      return res.status(401).json({ success: false, message: err.message });
    }

    clearFailures(email);
    sendTokenResponse(user, 200, res);
  } catch (error) {
    res.status(401).json({ success: false, message: error.message });
  }
};

// 3. GET /api/auth/me | returns the authenticated user
exports.getMe = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// 4. PUT /api/auth/update | updates the authenticated user's profile
exports.updateProfile = async (req, res) => {
  try {
    const user = await authService.updateProfile(req.user.id, req.body);
    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// 5. POST /api/auth/logout | clears the auth cookie
exports.logout = async (req, res) => {
  try {
    res.cookie('token', 'none', {
      expires: new Date(Date.now() + 10 * 1000),
      httpOnly: true,
    });

    res.status(200).json({
      success: true,
      data: {},
      message: 'User logged out successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
