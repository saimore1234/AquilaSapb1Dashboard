import { apiClient } from './client';
import type { ApiResponse, InventoryListItem, PagedQuery, PagedResult } from '../types';

export interface InventoryQuery extends PagedQuery {
  warehouse?: string;
  itemGroup?: string;
  status?: string;
}

export async function getInventory(query: InventoryQuery): Promise<PagedResult<InventoryListItem>> {
  const { data } = await apiClient.get<ApiResponse<PagedResult<InventoryListItem>>>('/inventory', { params: query });
  if (!data.success || !data.data) throw new Error(data.message || 'Failed to load inventory.');
  return data.data;
}

export async function getInventoryByItem(itemCode: string): Promise<InventoryListItem[]> {
  const { data } = await apiClient.get<ApiResponse<InventoryListItem[]>>(`/inventory/item/${encodeURIComponent(itemCode)}`);
  if (!data.success || !data.data) throw new Error(data.message || 'Failed to load item stock.');
  return data.data;
}
