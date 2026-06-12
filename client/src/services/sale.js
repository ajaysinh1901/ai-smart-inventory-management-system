/**
 * sale.js — Service layer for Quick-Sale screen.
 * All Decimal128 fields must be sent as strings per backend contract (chunk #3).
 */
import api from './api';

/**
 * Preview a sale — computes totals without any DB write.
 * POST /api/v1/sales/preview
 *
 * @param {{ lines: Array, customer?: object }} payload
 */
export const previewSale = (payload) => api.post('/sales/preview', payload);

/**
 * Create a confirmed sale — writes Sale doc, decrements stock, posts Khata if credit.
 * POST /api/v1/sales
 *
 * @param {{ lines: Array, customer?: object, payment: { mode: string, received?: string }, notes?: string }} payload
 */
export const createSale = (payload) => api.post('/sales', payload);

/**
 * Search products by name/barcode for the Quick-Sale search box.
 * GET /api/v1/products?q=...&limit=10
 *
 * @param {string} q - search query
 */
export const searchProducts = (q) =>
  api.get('/products', { params: { q, limit: 10, page: 1 } });

/**
 * Lookup a product by barcode (for USB HID scanner support).
 * GET /api/v1/products/by-barcode/:code
 *
 * @param {string} code
 */
export const lookupBarcode = (code) =>
  api.get(`/products/by-barcode/${encodeURIComponent(code)}`);

/**
 * Search customers for the customer picker.
 * GET /api/v1/customers?q=...
 *
 * @param {string} q
 */
export const searchCustomers = (q) =>
  api.get('/customers', { params: { q, limit: 8 } });

/**
 * Get invoice PDF URL for a completed sale.
 * Returns the URL string (not a fetch — used for <a href> or window.open).
 *
 * @param {string} saleId
 * @param {'thermal'|'a4'} format
 */
export const getInvoicePdfUrl = (saleId, format = 'thermal') =>
  `${import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api/v1'}/sales/${saleId}/pdf?format=${format}`;
