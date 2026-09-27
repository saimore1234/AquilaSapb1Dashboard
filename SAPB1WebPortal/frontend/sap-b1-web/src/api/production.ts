import { apiClient } from './client';
import type {
  ApiResponse,
  PagedResult,
  ProductionOrderQuery,
  BomQuery,
  Bom,
  BomDetail,
  ProductionOrder,
  ProductionOrderDetail,
  MaterialRequirement,
  MaterialConsumption,
  ProductionReceipt,
  ProductionDashboard,
  ProductionAnalytics
} from '../types';

// Every function here talks to the existing GET /api/production/* endpoints —
// the company is always resolved server-side from the JWT; nothing here ever
// sends a database/company parameter.

async function unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>, notFoundMessage: string): Promise<T> {
  const { data } = await promise;
  if (!data.success || data.data === null || data.data === undefined) {
    throw new Error(data.message || notFoundMessage);
  }
  return data.data;
}

export const getProductionDashboard = () =>
  unwrap<ProductionDashboard>(apiClient.get('/production/dashboard'), 'Failed to load the production dashboard.');

export const getProductionAnalytics = () =>
  unwrap<ProductionAnalytics>(apiClient.get('/production/analytics'), 'Failed to load production analytics.');

export const getBoms = (query: BomQuery) =>
  unwrap<PagedResult<Bom>>(apiClient.get('/production/boms', { params: query }), 'Failed to load bills of materials.');
export const getBomByCode = (code: string) =>
  unwrap<BomDetail>(apiClient.get(`/production/boms/${encodeURIComponent(code)}`), 'No BOM found.');

export const getProductionOrders = (query: ProductionOrderQuery) =>
  unwrap<PagedResult<ProductionOrder>>(apiClient.get('/production/orders', { params: query }), 'Failed to load production orders.');
export const getProductionOrderByEntry = (docEntry: number) =>
  unwrap<ProductionOrderDetail>(apiClient.get(`/production/orders/${docEntry}`), 'Production Order not found.');

export const getMaterialRequirements = (query: ProductionOrderQuery) =>
  unwrap<PagedResult<MaterialRequirement>>(apiClient.get('/production/material-requirements', { params: query }), 'Failed to load material requirements.');

export const getConsumption = (query: ProductionOrderQuery) =>
  unwrap<PagedResult<MaterialConsumption>>(apiClient.get('/production/consumption', { params: query }), 'Failed to load material consumption.');

export const getReceipts = (query: ProductionOrderQuery) =>
  unwrap<PagedResult<ProductionReceipt>>(apiClient.get('/production/receipts', { params: query }), 'Failed to load production receipts.');
