import api from './api';

export const uploadInvoice = (formData) => api.post('/ocr/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const extractData = (data) => api.post('/ocr/extract', data);
export const saveOcrData = (data) => api.post('/ocr/save', data);
