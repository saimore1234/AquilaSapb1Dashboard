import { apiClient } from './client';
import type { ApiResponse, PagedQuery, PagedResult, SupplierDetail, SupplierListItem } from '../types';

export async function getSuppliers(query: PagedQuery & { group?: string }): Promise<PagedResult<SupplierListItem>> {
  const { data } = await apiClient.get<ApiResponse<PagedResult<SupplierListItem>>>('/suppliers', { params: query });
  if (!data.success || !data.data) throw new Error(data.message || 'Failed to load suppliers.');
  return data.data;
}

export async function getSupplierByCode(cardCode: string): Promise<SupplierDetail> {
  const { data } = await apiClient.get<ApiResponse<SupplierDetail>>(`/suppliers/${encodeURIComponent(cardCode)}`);
  if (!data.success || !data.data) throw new Error(data.message || 'Supplier not found.');
  return data.data;
}
