import api from './api';

// Self-update — name/email only. Server enforces email uniqueness.
export const updateMe = (data) => api.put('/users/me', data);

// Admin-only list of all users.
export const getUsers = () => api.get('/users');

// Admin-only role change & delete.
export const updateUserRole = (id, role) => api.put(`/users/${id}/role`, { role });
export const deleteUser = (id) => api.delete(`/users/${id}`);
