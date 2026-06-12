const multer = require('multer');
const path   = require('path');

const uploadDir = path.join(__dirname, '..', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  // Image formats only — the OCR engine (tesseract.js) cannot decode PDFs and
  // crashes its worker process when handed one. Reject PDFs at the door.
  const allowedTypes = /jpg|jpeg|png/;
  const extMatch  = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimeMatch = allowedTypes.test(file.mimetype.split('/')[1]);

  if (extMatch && mimeMatch) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, JPEG, and PNG image files are supported. PDF is not supported.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

module.exports = upload;
