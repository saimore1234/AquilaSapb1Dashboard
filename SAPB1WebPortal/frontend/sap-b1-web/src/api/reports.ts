import { apiClient } from './client';
import type {
  ApiResponse,
  PagedResult,
  ManagementSummary,
  StockAgeingQuery,
  StockAgeingRow,
  InventoryMovementQuery,
  InventoryMovement
} from '../types';

// Talks to the small set of genuinely new GET /api/reports/* endpoints — the
// company is always resolved server-side from the JWT, same as every other
// module. Most of the Reports Center's catalog reuses the Sales/Purchase/
// Production/Finance/Inventory api/* modules directly instead of this file.

async function unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>, notFoundMessage: string): Promise<T> {
  const { data } = await promise;
  if (!data.success || data.data === null || data.data === undefined) {
    throw new Error(data.message || notFoundMessage);
  }
  return data.data;
}

export const getManagementSummary = () =>
  unwrap<ManagementSummary>(apiClient.get('/reports/management-summary'), 'Failed to load the management summary.');

export const getStockAgeing = (query: StockAgeingQuery) =>
  unwrap<PagedResult<StockAgeingRow>>(apiClient.get('/reports/stock-ageing', { params: query }), 'Failed to load stock ageing.');

export const getInventoryMovement = (query: InventoryMovementQuery) =>
  unwrap<PagedResult<InventoryMovement>>(apiClient.get('/reports/inventory-movement', { params: query }), 'Failed to load inventory movement.');
