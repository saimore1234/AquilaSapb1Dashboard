import { apiClient } from './client';
import type { ApiResponse, ItemDetail, ItemListItem, PagedQuery, PagedResult } from '../types';

export async function getItems(query: PagedQuery & { group?: string }): Promise<PagedResult<ItemListItem>> {
  const { data } = await apiClient.get<ApiResponse<PagedResult<ItemListItem>>>('/items', { params: query });
  if (!data.success || !data.data) throw new Error(data.message || 'Failed to load items.');
  return data.data;
}

export async function getItemByCode(itemCode: string): Promise<ItemDetail> {
  const { data } = await apiClient.get<ApiResponse<ItemDetail>>(`/items/${encodeURIComponent(itemCode)}`);
  if (!data.success || !data.data) throw new Error(data.message || 'Item not found.');
  return data.data;
}
