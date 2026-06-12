/**
 * supplierService.js  — Clean API service layer for all supplier operations
 */
import api from './api';

const qs = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null));

export const fetchSuppliers     = (params = {}) => api.get('/suppliers', { params: qs(params) });
export const fetchSupplierStats = ()             => api.get('/suppliers/stats');
export const fetchSupplier      = (id)           => api.get(`/suppliers/${id}`);
export const createSupplier     = (body)         => api.post('/suppliers', body);
export const updateSupplier     = (id, body)     => api.put(`/suppliers/${id}`, body);
export const deleteSupplier     = (id)           => api.delete(`/suppliers/${id}`);
export const fetchSupplierProducts     = (id)    => api.get(`/suppliers/${id}/products`);
export const fetchSupplierTransactions = (id)    => api.get(`/suppliers/${id}/transactions`);
