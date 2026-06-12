/** salesService.js — API service layer for all sales operations */
import api from './api';

const qs = (p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== '' && v != null));

export const createSale      = (body)          => api.post('/sales', body);
export const fetchSales      = (params = {})   => api.get('/sales', { params: qs(params) });
export const fetchSale       = (id)            => api.get(`/sales/${id}`);
export const fetchSalesReport = ()             => api.get('/sales/report');

// Returns the raw TallyPrime XML envelope as a Blob so the caller can trigger
// a file download. The server already streams with the correct
// Content-Disposition; we still wrap it client-side so the user gets a
// predictable filename even when the browser opens XML inline.
export const exportTallyXml = (params = {}) =>
  api.get('/sales/tally.xml', { params: qs(params), responseType: 'blob' });
