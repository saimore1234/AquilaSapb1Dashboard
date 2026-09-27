import { apiClient } from './client';
import type { ApiResponse, CustomerDetail, CustomerListItem, PagedQuery, PagedResult } from '../types';

export async function getCustomers(query: PagedQuery & { group?: string }): Promise<PagedResult<CustomerListItem>> {
  const { data } = await apiClient.get<ApiResponse<PagedResult<CustomerListItem>>>('/customers', { params: query });
  if (!data.success || !data.data) throw new Error(data.message || 'Failed to load customers.');
  return data.data;
}

export async function getCustomerByCode(cardCode: string): Promise<CustomerDetail> {
  const { data } = await apiClient.get<ApiResponse<CustomerDetail>>(`/customers/${encodeURIComponent(cardCode)}`);
  if (!data.success || !data.data) throw new Error(data.message || 'Customer not found.');
  return data.data;
}
