/**
 * productService.js  — Clean API service layer for all product operations
 * All calls go through the shared axios instance (handles auth tokens).
 */
import api from './api';

// Build clean query string from params object (drops empty values)
const qs = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null));

/** Fetch paginated + filtered product list */
export const fetchProducts = ({ page = 1, limit = 10, q = '', category = '', stockStatus = '' } = {}) =>
  api.get('/products', { params: qs({ page, limit, q, category, stock_status: stockStatus }) });

/** Create a new product */
export const createProduct = (body) => api.post('/products', body);

/** Update product fields (name, price, threshold, etc.) */
export const updateProduct = (id, body) => api.put(`/products/${id}`, body);

/** Delete a product */
export const deleteProduct = (id) => api.delete(`/products/${id}`);

/**
 * Adjust product stock level via a Transaction record.
 * The transaction controller auto-updates product stock,
 * so we only need to POST the transaction (no separate PATCH).
 */
export const adjustStock = async (product, quantity, type, userId) => {
  const res = await api.post('/transactions', {
    productId: product._id,
    type: type === 'increase' ? 'IN' : 'OUT',
    quantity,
    user: userId,
    notes: `Stock ${type === 'increase' ? 'in' : 'out'} — ${quantity} units of ${product.name}`,
  });

  return res;
};

/** Fetch low-stock items for alert banner */
export const fetchLowStock = () => api.get('/products/low-stock');

/** Exact-match barcode lookup for scan-to-sell. Returns 404 if no match. */
export const lookupBarcode = (code) => api.get(`/products/by-barcode/${encodeURIComponent(code)}`);
