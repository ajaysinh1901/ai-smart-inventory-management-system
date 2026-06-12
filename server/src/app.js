const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const v1Routes = require('./routes/v1');
const { globalLimiter } = require('./middlewares/rateLimiter.middleware');
const errorMiddleware = require('./middlewares/error.middleware');

const app = express();

// Request logging — quiet during tests
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.use(express.json());
app.use(cookieParser());
// SEC-004 fix: localhost wildcard is only active in non-production environments.
// In production CLIENT_URL is a comma-separated allowlist; in dev an explicit allowlist is used. | spec: B3
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:3000'];

// Parse CLIENT_URL as comma-separated list (e.g. preview + alias on Vercel)
const PROD_ORIGINS = (process.env.CLIENT_URL || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow server-to-server / same-origin requests (no Origin header)
    if (!origin) return callback(null, true);

    if (process.env.NODE_ENV === 'production') {
      // Exact-match allowlist
      if (PROD_ORIGINS.includes(origin)) return callback(null, true);
      // Vercel per-deploy preview URLs: opt-in via VERCEL_PROJECT_SLUG env var
      // (matches https://<project>-<hash>-<scope>.vercel.app for the same project)
      const projectSlug = process.env.VERCEL_PROJECT_SLUG;
      if (projectSlug && /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) {
        try {
          const host = new URL(origin).hostname;
          if (host.startsWith(`${projectSlug}-`) || host === `${projectSlug}.vercel.app`) {
            return callback(null, true);
          }
        } catch (_) { /* fall through */ }
      }
      return callback(new Error(`CORS: origin ${origin} not allowed in production`));
    }

    // Development: allow an explicit list of known local origins
    if (DEV_ORIGINS.includes(origin) || origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }

    callback(new Error(`CORS: origin ${origin} not in allowlist`));
  },
  credentials: true
}));

// App-wide rate limit on the v1 API surface | spec: B3
app.use('/api/v1', globalLimiter);

app.use('/api/v1', v1Routes);

app.use((req, res, next) => {
  res.status(404).json({ success: false, message: 'API Route Not Found' });
});

// Global error handler — must be the last `app.use`. | bug #008
app.use(errorMiddleware);

module.exports = app;
