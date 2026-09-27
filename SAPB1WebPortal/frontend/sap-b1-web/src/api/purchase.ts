import { apiClient } from './client';
import type {
  ApiResponse,
  PagedResult,
  PurchaseDocumentQuery,
  PurchaseRequest,
  PurchaseRequestDetail,
  CreatePurchaseRequestPayload,
  CreatePurchaseRequestResult,
  PurchaseQuotation,
  PurchaseQuotationDetail,
  PurchaseOrder,
  PurchaseOrderDetail,
  Grpo,
  GrpoDetail,
  ApInvoice,
  ApInvoiceDetail,
  ApCreditMemo,
  ApCreditMemoDetail,
  OutgoingPayment,
  OutgoingPaymentDetail,
  PurchaseDashboard,
  PurchaseAnalytics
} from '../types';

// Every function here talks to the existing GET /api/purchase/* endpoints —
// the company is always resolved server-side from the JWT; nothing here ever
// sends a database/company parameter.

async function unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>, notFoundMessage: string): Promise<T> {
  const { data } = await promise;
  if (!data.success || data.data === null || data.data === undefined) {
    throw new Error(data.message || notFoundMessage);
  }
  return data.data;
}

export const getPurchaseDashboard = () =>
  unwrap<PurchaseDashboard>(apiClient.get('/purchase/dashboard'), 'Failed to load the purchase dashboard.');

export const getPurchaseAnalytics = () =>
  unwrap<PurchaseAnalytics>(apiClient.get('/purchase/analytics'), 'Failed to load purchase analytics.');

export const getPurchaseRequests = (query: PurchaseDocumentQuery) =>
  unwrap<PagedResult<PurchaseRequest>>(apiClient.get('/purchase/requests', { params: query }), 'Failed to load purchase requests.');
export const getPurchaseRequestByEntry = (docEntry: number) =>
  unwrap<PurchaseRequestDetail>(apiClient.get(`/purchase/requests/${docEntry}`), 'Purchase Request not found.');

// The only write call in the app. The backend resolves the SAP B1 company
// solely from the JWT — this payload never carries a database/company field.
export const createPurchaseRequest = (payload: CreatePurchaseRequestPayload) =>
  unwrap<CreatePurchaseRequestResult>(apiClient.post('/purchase/requests', payload), 'Failed to create the purchase request.');

export const getPurchaseQuotations = (query: PurchaseDocumentQuery) =>
  unwrap<PagedResult<PurchaseQuotation>>(apiClient.get('/purchase/quotations', { params: query }), 'Failed to load purchase quotations.');
export const getPurchaseQuotationByEntry = (docEntry: number) =>
  unwrap<PurchaseQuotationDetail>(apiClient.get(`/purchase/quotations/${docEntry}`), 'Purchase Quotation not found.');

export const getPurchaseOrders = (query: PurchaseDocumentQuery) =>
  unwrap<PagedResult<PurchaseOrder>>(apiClient.get('/purchase/orders', { params: query }), 'Failed to load purchase orders.');
export const getPurchaseOrderByEntry = (docEntry: number) =>
  unwrap<PurchaseOrderDetail>(apiClient.get(`/purchase/orders/${docEntry}`), 'Purchase Order not found.');

export const getGrpos = (query: PurchaseDocumentQuery) =>
  unwrap<PagedResult<Grpo>>(apiClient.get('/purchase/grpo', { params: query }), 'Failed to load goods receipts.');
export const getGrpoByEntry = (docEntry: number) =>
  unwrap<GrpoDetail>(apiClient.get(`/purchase/grpo/${docEntry}`), 'GRPO not found.');

export const getApInvoices = (query: PurchaseDocumentQuery) =>
  unwrap<PagedResult<ApInvoice>>(apiClient.get('/purchase/invoices', { params: query }), 'Failed to load A/P invoices.');
export const getApInvoiceByEntry = (docEntry: number) =>
  unwrap<ApInvoiceDetail>(apiClient.get(`/purchase/invoices/${docEntry}`), 'A/P Invoice not found.');

export const getApCreditMemos = (query: PurchaseDocumentQuery) =>
  unwrap<PagedResult<ApCreditMemo>>(apiClient.get('/purchase/credit-memos', { params: query }), 'Failed to load A/P credit memos.');
export const getApCreditMemoByEntry = (docEntry: number) =>
  unwrap<ApCreditMemoDetail>(apiClient.get(`/purchase/credit-memos/${docEntry}`), 'A/P Credit Memo not found.');

export const getOutgoingPayments = (query: PurchaseDocumentQuery) =>
  unwrap<PagedResult<OutgoingPayment>>(apiClient.get('/purchase/payments', { params: query }), 'Failed to load payments.');
export const getOutgoingPaymentByEntry = (docEntry: number) =>
  unwrap<OutgoingPaymentDetail>(apiClient.get(`/purchase/payments/${docEntry}`), 'Payment not found.');
