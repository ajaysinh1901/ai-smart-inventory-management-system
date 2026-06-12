import api from './api';

export const getDashboardStats = () => api.get('/analytics/dashboard');
export const getSalesReport = () => api.get('/analytics/sales');
export const getInventoryReport = () => api.get('/analytics/inventory');
export const getProfitAnalysis = () => api.get('/analytics/profit');
