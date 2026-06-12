/**
 * stockAdjustmentService.js — API service layer for StockAdjustment operations.
 *
 * StockAdjustment reasons (spec §B.5, §D #10):
 *   'purchase-variance' — difference between invoiced and received qty on purchase
 *   'damage'            — product damaged / shrinkage
 *   'opening'           — opening stock entry (onboarding step 5)
 *   'manual'            — manual correction by owner
 *
 * Backend endpoint shape:
 *   POST /api/v1/stock-adjustments
 *     body: { productId, qtyChange, reason, reasonDetail, supplierId? }
 *
 *   GET /api/v1/stock-adjustments
 *     params: { reason?, from?, to?, productId?, page?, limit? }
 *
 * TODO(api): POST /api/v1/stock-adjustments — not yet implemented server-side.
 *   Expected body: { productId: string, qtyChange: string (Decimal128), reason: string, reasonDetail?: string, supplierId?: string }
 *   Expected response: { success: true, data: StockAdjustmentDoc }
 *
 * TODO(api): GET /api/v1/stock-adjustments — not yet implemented server-side.
 *   Expected query params: { reason?: string, from?: ISO8601, to?: ISO8601, productId?: string, page?: number, limit?: number }
 *   Expected response: { success: true, data: StockAdjustmentDoc[], meta: { total, page, totalPages } }
 */
import api from './api';

const qs = (params) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null));

/**
 * Create a StockAdjustment record.
 * Used for purchase-variance and damage reasons.
 *
 * @param {{ productId: string, qtyChange: string|number, reason: string, reasonDetail?: string, supplierId?: string }} body
 */
export const createStockAdjustment = (body) =>
  api.post('/stock-adjustments', body);

/**
 * Fetch stock adjustments with optional filters.
 *
 * @param {{ reason?: string, from?: string, to?: string, productId?: string, page?: number, limit?: number }} params
 */
export const fetchStockAdjustments = (params = {}) =>
  api.get('/stock-adjustments', { params: qs(params) });
