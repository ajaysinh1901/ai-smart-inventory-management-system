/** aiService.js — API service layer for the AI module */
import api from './api';

export const fetchAiInsights  = ()       => api.get('/ai/insights');
export const predictDemand    = (productId) => api.post('/ai/predict', { productId });
export const fetchReorderSuggestion = (productId) => api.get(`/ai/reorder/${productId}`);
export const fetchDeadStock   = ()       => api.get('/ai/dead-stock');
export const fetchAiTrends    = ()       => api.get('/ai/trends');
export const sendChatMessage  = (message) => api.post('/ai/chat', { message });
