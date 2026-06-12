import api from './api';

export const getSettings = () => api.get('/settings');
export const updateSettings = (data) => api.put('/settings', data);
export const updatePassword = (data) => api.put('/settings/password', data);
/** PATCH /workspace — saves all workspace fields including GSTIN, state, UPI, pinCode */
export const patchWorkspace = (data) => api.patch('/workspace', data);
