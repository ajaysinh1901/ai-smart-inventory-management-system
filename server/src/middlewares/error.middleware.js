// Global error handler — JSON only, no stack traces in response. | bug #008, bug #011
// Wired in app.js as the LAST middleware. Catches anything thrown by routes
// (including multer errors that escaped the route-level handler).
const multer = require('multer');

module.exports = (err, req, res, next) => {
  // If the response was already sent, defer to Express.
  if (res.headersSent) return next(err);

  // Multer-specific errors (size, field, etc.)
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? 'File too large. Maximum size is 10 MB.'
      : err.message;
    return res.status(400).json({ success: false, message });
  }

  // Mongoose CastError (malformed ObjectId reaching here = unguarded route)
  if (err && err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid ID' });
  }

  // Mongo duplicate key
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    const value = (err.keyValue && err.keyValue[field]) || '';
    return res.status(409).json({
      success: false,
      message: `A record with ${field.toUpperCase()} "${value}" already exists.`,
    });
  }

  // Mongoose validation
  if (err && err.name === 'ValidationError') {
    const first = Object.values(err.errors || {})[0];
    return res.status(400).json({ success: false, message: first?.message || 'Validation failed' });
  }

  // Log internally; never leak stack traces to clients. | bug #008
  console.error('[error.middleware]', err?.message || err);

  const status = err?.status || err?.statusCode || 500;
  const message = status >= 500 ? 'Internal server error.' : (err?.message || 'Request failed.');
  return res.status(status).json({ success: false, message });
};
