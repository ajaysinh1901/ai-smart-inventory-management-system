'use strict';

// ocr.service.js — invoice extraction.
// Primary engine: Gemini Vision (gemini-2.5-flash) — reads the invoice image
// directly and returns structured JSON. Fallback: tesseract.js + regex, used
// only when GEMINI_API_KEY is absent or the Gemini call fails.
//
// Every path returns ONE canonical shape (see toCanonical) so the controller
// and the React ScannerPage never have to guess field names.

const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// tesseract.js can only decode raster images. Handed anything else (notably a
// PDF) it throws inside its worker via process.nextTick — an uncaught
// exception that crashes the whole server. Gate the input before OCR runs.
const OCR_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png']);

const e400 = (msg) => Object.assign(new Error(msg), { statusCode: 400 });

// 15-char GSTIN: 2-digit state + 10-char PAN + entity + 'Z' + checksum.
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// ---------------------------------------------------------------------------
// Canonical shape — the single contract the frontend reads.
// ---------------------------------------------------------------------------
function num(v) {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function toCanonical(raw, source, rawText) {
  const items = Array.isArray(raw.items) ? raw.items : [];
  const cleanItems = items
    .map((it) => {
      const quantity  = num(it.quantity);
      const unitPrice = num(it.unitPrice != null ? it.unitPrice : it.price);
      const total     = num(it.total) || quantity * unitPrice;
      return {
        name:      String(it.name || '').trim(),
        quantity,
        unitPrice,
        total,
        hsn:       String(it.hsn || it.hsnCode || '').trim(),
        confidence: it.confidence != null ? Number(it.confidence) : undefined,
      };
    })
    .filter((it) => it.name); // drop nameless rows

  const subtotal   = num(raw.subtotal) || cleanItems.reduce((s, it) => s + it.total, 0);
  const tax        = num(raw.tax);
  const grandTotal = num(raw.grandTotal != null ? raw.grandTotal : raw.total) || subtotal + tax;

  return {
    vendor: {
      name:  String(raw.vendor?.name || raw.vendorName || '').trim(),
      taxId: String(raw.vendor?.taxId || raw.vendor?.gstin || raw.gstin || '').trim().toUpperCase(),
    },
    invoiceNumber: String(raw.invoiceNumber || '').trim(),
    date:          String(raw.date || '').trim(),
    items:         cleanItems,
    subtotal,
    tax,
    total:         grandTotal,
    grandTotal,
    source,                       // 'gemini' | 'ocr'
    rawText: rawText || undefined,
  };
}

// ---------------------------------------------------------------------------
// Gemini Vision extraction
// ---------------------------------------------------------------------------
const GEMINI_PROMPT = `You are an invoice/bill data extractor for an Indian retail inventory app.
Read the attached invoice or bill image and return ONLY valid JSON (no markdown, no commentary).

JSON schema:
{
  "vendor": { "name": string, "gstin": string },
  "invoiceNumber": string,
  "date": string,
  "items": [
    { "name": string, "quantity": number, "unitPrice": number, "total": number, "hsn": string }
  ],
  "subtotal": number,
  "tax": number,
  "grandTotal": number
}

Rules:
- All numbers must be plain numbers — no currency symbols, no thousands separators.
- "quantity" = units/weight purchased; "unitPrice" = price per single unit; "total" = line total.
- "tax" = total tax amount on the invoice (sum of CGST + SGST + IGST if present).
- "gstin" = the vendor's 15-character GST number if printed, else "".
- "date" = the bill date exactly as printed.
- If a value is not visible, use "" for strings and 0 for numbers; "items" may be [].
- Never invent data. Extract only what is actually visible in the image.`;

async function extractWithGemini(absPath, mimeType) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  });

  const base64 = fs.readFileSync(absPath).toString('base64');
  const parts = [GEMINI_PROMPT, { inlineData: { data: base64, mimeType } }];

  // Retry transient 503 / overload, mirroring ai.controller's chat handler.
  const isTransient = (e) => e?.status === 503 || /high demand|overload|503/i.test(e?.message || '');
  const delays = [0, 700, 1800];
  let lastErr;
  for (const wait of delays) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      const result = await model.generateContent(parts);
      const text = result.response.text();
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      if (e instanceof SyntaxError || !isTransient(e)) break;
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Tesseract OCR (fallback engine)
// ---------------------------------------------------------------------------
/**
 * Run Tesseract OCR on an image file and return raw text.
 * @param {string} imagePath - Absolute path to the image file
 * @returns {Promise<string>} - Extracted raw text
 */
async function extractText(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  if (!OCR_IMAGE_EXT.has(ext)) {
    throw e400('OCR supports JPG, JPEG, and PNG images only. PDF is not supported.');
  }
  const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
  return text;
}

/**
 * Parse raw invoice text into structured data using regex / heuristics.
 * @param {string} rawText - Raw OCR text
 * @returns {object} - Structured invoice data (pre-canonical)
 */
function parseInvoiceData(rawText) {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);

  const invoiceNumMatch = rawText.match(/(?:invoice|inv|bill)\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Z0-9\-]+)/i);
  const invoiceNumber = invoiceNumMatch ? invoiceNumMatch[1].trim() : '';

  const dateMatch = rawText.match(/(?:date|dated?)\s*[:\-]?\s*(\d{1,2}[\/.\\-]\d{1,2}[\/.\\-]\d{2,4})/i)
    || rawText.match(/(\d{1,2}[\/.\\-]\d{1,2}[\/.\\-]\d{2,4})/);
  const date = dateMatch ? dateMatch[1].trim() : '';

  const vendorMatch = rawText.match(/(?:from|vendor|supplier|bill\s+from)\s*[:\-]?\s*(.+)/i);
  const vendorName = vendorMatch ? vendorMatch[1].trim() : (lines[0] || '');

  // GSTIN anywhere in the text.
  const gstinMatch = rawText.toUpperCase().match(/\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/);
  const gstin = gstinMatch ? gstinMatch[0] : '';

  const items = [];
  const itemPattern = /^(.+?)\s+(\d+)\s+[$₹]?([\d,]+\.?\d*)\s+[$₹]?([\d,]+\.?\d*)\s*$/;
  for (const line of lines) {
    const match = line.match(itemPattern);
    if (match) {
      const name      = match[1].trim();
      const quantity  = parseInt(match[2], 10);
      const unitPrice = parseFloat(match[3].replace(/,/g, ''));
      const total     = parseFloat(match[4].replace(/,/g, ''));
      if (/item|product|description|qty|quantity|price|amount/i.test(name)) continue;
      items.push({ name, quantity, unitPrice, total });
    }
  }

  const subtotalMatch = rawText.match(/(?:sub\s*total|subtotal)\s*[:\-]?\s*[$₹]?([\d,]+\.?\d*)/i);
  const subtotal = subtotalMatch ? parseFloat(subtotalMatch[1].replace(/,/g, '')) : 0;

  const taxMatch = rawText.match(/(?:tax|gst|vat|cgst|sgst|igst)\s*[:\-]?\s*[$₹]?([\d,]+\.?\d*)/i);
  const tax = taxMatch ? parseFloat(taxMatch[1].replace(/,/g, '')) : 0;

  const grandTotalMatch = rawText.match(/(?:grand\s*total|total\s*(?:amount|due)?|amount\s*due)\s*[:\-]?\s*[$₹]?([\d,]+\.?\d*)/i);
  const grandTotal = grandTotalMatch ? parseFloat(grandTotalMatch[1].replace(/,/g, '')) : 0;

  return { invoiceNumber, date, vendorName, gstin, items, subtotal, tax, grandTotal };
}

// ---------------------------------------------------------------------------
// Public entry point — image path → canonical extracted invoice.
// ---------------------------------------------------------------------------
async function extractInvoice(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  if (!OCR_IMAGE_EXT.has(ext)) {
    throw e400('OCR supports JPG, JPEG, and PNG images only. PDF is not supported.');
  }
  const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

  // Primary: Gemini Vision.
  if (process.env.GEMINI_API_KEY) {
    try {
      const raw = await extractWithGemini(absPath, mimeType);
      const canonical = toCanonical(raw, 'gemini');
      // Drop a GSTIN that does not pass the format check rather than show junk.
      if (canonical.vendor.taxId && !GSTIN_RE.test(canonical.vendor.taxId)) {
        canonical.vendor.taxId = '';
      }
      return canonical;
    } catch (err) {
      console.error('[ocr] Gemini vision failed → tesseract fallback:', err?.message || err);
    }
  }

  // Fallback: tesseract.js + regex.
  const rawText = await extractText(absPath);
  return toCanonical(parseInvoiceData(rawText), 'ocr', rawText);
}

module.exports = { extractInvoice, extractText, parseInvoiceData };
