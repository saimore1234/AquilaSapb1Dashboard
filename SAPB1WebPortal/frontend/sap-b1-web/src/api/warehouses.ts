import { apiClient } from './client';
import type { ApiResponse, Warehouse } from '../types';

export async function getWarehouses(): Promise<Warehouse[]> {
  const { data } = await apiClient.get<ApiResponse<Warehouse[]>>('/warehouses');
  if (!data.success || !data.data) throw new Error(data.message || 'Failed to load warehouses.');
  return data.data;
}
