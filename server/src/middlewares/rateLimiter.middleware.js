// Rate-limit middlewares. | spec: B3
// Skipped entirely in test mode so smoke tests aren't throttled.
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const isTest = () => process.env.NODE_ENV === 'test';

const buildLimiter = ({ windowMs, max, message }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    // ipKeyGenerator handles both IPv4 and IPv6 correctly
    keyGenerator: (req, res) => ipKeyGenerator(req.ip),
    skip: () => isTest(),
    handler: (req, res) => {
      res.status(429).json({ success: false, message });
    },
  });

// 15 req/min — login & register. Was 5/min, but that tripped before the
// per-account 15-min lockout could fire its clearer remediation message.
// Now leaves headroom for the account-level lockout in auth.controller. | bug #011.7
// A1-06 fix: message now distinguishable from account-level lockout 429 | spec: B3
exports.authLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 15,
  message: 'Too many requests from this IP. Please wait one minute before trying again.',
});

// 20 req/min — AI chat endpoint
exports.aiChatLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Too many AI requests. Please slow down and retry shortly.',
});

// 200 req/min — global app-wide
exports.globalLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 200,
  message: 'Too many requests from this IP. Please try again later.',
});

// 30 req/min — write-heavy endpoints (stock adjustments, OCR saves, transactions, sales)
// SEC-008 fix: moderate limiter for write endpoints to slow compromised accounts | spec: B3
exports.writeLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many write requests. Please slow down and try again shortly.',
});
