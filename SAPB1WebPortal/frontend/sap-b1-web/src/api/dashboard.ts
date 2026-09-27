import { apiClient } from './client';
import type { ApiResponse, DashboardSummary } from '../types';

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const { data } = await apiClient.get<ApiResponse<DashboardSummary>>('/dashboard');
  if (!data.success || !data.data) throw new Error(data.message || 'Failed to load dashboard.');
  return data.data;
}
