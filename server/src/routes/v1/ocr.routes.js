const express = require('express');
const multer  = require('multer');
const { uploadInvoice, extractData, saveExtractedData } = require('../../controllers/ocr.controller');
const { protect } = require('../../middlewares/auth.middleware');
const upload = require('../../middlewares/upload.middleware');
// writeLimiter exported by Agent B1; fall back to identity middleware if not yet present | SEC-008
const rateLimiterMw = require('../../middlewares/rateLimiter.middleware');
const writeLimiter = rateLimiterMw.writeLimiter || ((req, res, next) => next());

const router = express.Router();
router.use(protect);

// Wrap upload.single so multer errors return JSON 400 instead of bubbling up
// as HTML stack traces from Express's default handler. | bug #008
const handleInvoiceUpload = (req, res, next) => {
  upload.single('invoice')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File too large. Maximum size is 10 MB.',
        });
      }
      return res.status(400).json({ success: false, message: err.message });
    }
    // fileFilter rejection (wrong type) lands here as a plain Error.
    return res.status(400).json({
      success: false,
      message: err.message || 'Upload rejected.',
    });
  });
};

router.post('/upload', writeLimiter, handleInvoiceUpload, uploadInvoice);
router.post('/extract', writeLimiter, extractData);
router.post('/save', writeLimiter, saveExtractedData);

module.exports = router;
