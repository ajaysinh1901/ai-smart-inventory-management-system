/** transactionService.js — API service layer for all transaction operations */
import api from './api';

const qs = (p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== '' && v != null));

export const fetchTransactions     = (params = {}) => api.get('/transactions', { params: qs(params) });
export const fetchTransactionStats = ()             => api.get('/transactions/stats');
export const fetchRecentActivity   = ()             => api.get('/transactions/recent');
export const createTransaction     = (body)         => api.post('/transactions', body);
export const deleteTransaction     = (id)           => api.delete(`/transactions/${id}`);
