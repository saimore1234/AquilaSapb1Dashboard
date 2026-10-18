import { apiClient } from './client';
import type {
  ApiResponse,
  PagedResult,
  SalesDocumentQuery,
  SalesQuotation,
  SalesQuotationDetail,
  SalesOrder,
  SalesOrderDetail,
  Delivery,
  DeliveryDetail,
  ArInvoice,
  ArInvoiceDetail,
  ArCreditMemo,
  ArCreditMemoDetail,
  IncomingPayment,
  IncomingPaymentDetail,
  SalesDashboard,
  SalesAnalytics,
  SalesOverview,
  SalesOverviewQuery,
  OpenSalesOrders,
  InvoiceRegister,
  InvoiceRegisterQuery,
  CustomerOutstanding,
  CustomerLookup,
  CustomerLedger,
  SalesAnalyticsQuery,
  SalesAnalyticsReport,
  SalesAnalyticsOptions,
  TurnoverBreakup,
  TurnoverQuery,
  SalesTargetOptions,
  SalesTargetListResponse,
  SalesTargetDetail,
  SalesTargetQuery,
  SaveSalesTargetRequest,
  SalesTargetItemOption,
  DetailReportQuery,
  ReportFilterOptions,
  OpenSalesOrderReport,
  OpenPurchaseOrderReport,
  SalesRegisterReport,
  LedgerOutstandingQuery,
  OutstandingLedger,
  OutstandingLinesReport,
  CustomerReport,
  PendingDeliveryReport,
  SalesAnalysisReport,
  PerformanceQuery,
  SalesPerformance,
  CustomerGroupSales,
  UnpaidInvoiceReport,
  LostCustomerQuery,
  LostCustomerReport,
  OrderExecutionReport
} from '../types';

// Every function here talks to the existing GET /api/sales/* endpoints —
// the company is always resolved server-side from the JWT; nothing here ever
// sends a database/company parameter.

async function unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>, notFoundMessage: string): Promise<T> {
  const { data } = await promise;
  if (!data.success || data.data === null || data.data === undefined) {
    throw new Error(data.message || notFoundMessage);
  }
  return data.data;
}

export const getSalesDashboard = () =>
  unwrap<SalesDashboard>(apiClient.get('/sales/dashboard'), 'Failed to load the sales dashboard.');

export const getSalesAnalytics = () =>
  unwrap<SalesAnalytics>(apiClient.get('/sales/analytics'), 'Failed to load sales analytics.');

export const getSalesOverview = (params: SalesOverviewQuery = {}) =>
  unwrap<SalesOverview>(apiClient.get('/sales/overview', { params }), 'Failed to load the sales overview.');

export const getOpenSalesOrdersBoard = (params: { filter?: string; search?: string; page?: number; pageSize?: number }) =>
  unwrap<OpenSalesOrders>(apiClient.get('/sales/overview/open-orders', { params }), 'Failed to load open sales orders.');

export const getInvoiceRegister = (query: InvoiceRegisterQuery) =>
  unwrap<InvoiceRegister>(apiClient.get('/sales/reports/invoice-register', { params: query }), 'Failed to load the invoice register.');

export const getCustomerOutstanding = () =>
  unwrap<CustomerOutstanding>(apiClient.get('/sales/reports/customer-outstanding'), 'Failed to load customer outstanding.');

export const lookupSalesCustomers = (search: string) =>
  unwrap<CustomerLookup[]>(apiClient.get('/sales/reports/customer-lookup', { params: { search } }), 'Failed to search customers.');

export const getCustomerLedger = (params: { customer: string; dateFrom?: string; dateTo?: string }) =>
  unwrap<CustomerLedger>(apiClient.get('/sales/reports/customer-ledger', { params }), 'Customer not found.');

export const getTurnoverBreakup = (params: TurnoverQuery) =>
  unwrap<TurnoverBreakup>(apiClient.get('/sales/reports/turnover-breakup', { params, paramsSerializer: { indexes: null } }), 'Failed to load turnover.');

export const getSalesAnalyticsOptions = () =>
  unwrap<SalesAnalyticsOptions>(apiClient.get('/sales/reports/analytics-options'), 'Failed to load analytics filters.');

export const getSalesAnalyticsReport = (query: SalesAnalyticsQuery) =>
  unwrap<SalesAnalyticsReport>(apiClient.get('/sales/reports/analytics', { params: query }), 'Failed to load sales analytics.');

export const getSalesQuotations = (query: SalesDocumentQuery) =>
  unwrap<PagedResult<SalesQuotation>>(apiClient.get('/sales/quotations', { params: query }), 'Failed to load sales quotations.');
export const getSalesQuotationByEntry = (docEntry: number) =>
  unwrap<SalesQuotationDetail>(apiClient.get(`/sales/quotations/${docEntry}`), 'Sales Quotation not found.');

export const getSalesOrders = (query: SalesDocumentQuery) =>
  unwrap<PagedResult<SalesOrder>>(apiClient.get('/sales/orders', { params: query }), 'Failed to load sales orders.');
export const getSalesOrderByEntry = (docEntry: number) =>
  unwrap<SalesOrderDetail>(apiClient.get(`/sales/orders/${docEntry}`), 'Sales Order not found.');

export const getDeliveries = (query: SalesDocumentQuery) =>
  unwrap<PagedResult<Delivery>>(apiClient.get('/sales/deliveries', { params: query }), 'Failed to load deliveries.');
export const getDeliveryByEntry = (docEntry: number) =>
  unwrap<DeliveryDetail>(apiClient.get(`/sales/deliveries/${docEntry}`), 'Delivery not found.');

export const getArInvoices = (query: SalesDocumentQuery) =>
  unwrap<PagedResult<ArInvoice>>(apiClient.get('/sales/invoices', { params: query }), 'Failed to load A/R invoices.');
export const getArInvoiceByEntry = (docEntry: number) =>
  unwrap<ArInvoiceDetail>(apiClient.get(`/sales/invoices/${docEntry}`), 'A/R Invoice not found.');

export const getArCreditMemos = (query: SalesDocumentQuery) =>
  unwrap<PagedResult<ArCreditMemo>>(apiClient.get('/sales/credit-memos', { params: query }), 'Failed to load A/R credit memos.');
export const getArCreditMemoByEntry = (docEntry: number) =>
  unwrap<ArCreditMemoDetail>(apiClient.get(`/sales/credit-memos/${docEntry}`), 'A/R Credit Memo not found.');

export const getIncomingPayments = (query: SalesDocumentQuery) =>
  unwrap<PagedResult<IncomingPayment>>(apiClient.get('/sales/payments', { params: query }), 'Failed to load payments.');
export const getIncomingPaymentByEntry = (docEntry: number) =>
  unwrap<IncomingPaymentDetail>(apiClient.get(`/sales/payments/${docEntry}`), 'Payment not found.');

// ---- Salesperson Targets (company/identity always come from the JWT server-side) ----
export const getSalesTargetOptions = () =>
  unwrap<SalesTargetOptions>(apiClient.get('/sales/targets/options'), 'Failed to load target options.');

export const searchTargetItems = (search: string, limit = 50, offset = 0, includeNonSales = false) =>
  unwrap<SalesTargetItemOption[]>(apiClient.get('/sales/targets/items', { params: { search: search || undefined, limit, offset, includeNonSales } }), 'Failed to search items.');

export const getSalesTargets = (params: SalesTargetQuery) =>
  unwrap<SalesTargetListResponse>(apiClient.get('/sales/targets', { params }), 'Failed to load targets.');

export const getSalesTarget = (id: number, includeTax = false) =>
  unwrap<SalesTargetDetail>(apiClient.get(`/sales/targets/${id}`, { params: { includeTax } }), 'Target not found.');

export const createSalesTarget = (body: SaveSalesTargetRequest) =>
  unwrap<number>(apiClient.post('/sales/targets', body), 'Failed to save the target.');

export const updateSalesTarget = (id: number, body: SaveSalesTargetRequest) =>
  unwrap<number>(apiClient.put(`/sales/targets/${id}`, body), 'Failed to save the target.');

export const submitSalesTarget = (id: number) =>
  unwrap<number>(apiClient.put(`/sales/targets/${id}/submit`), 'Failed to submit the target.');

export const reviseSalesTarget = (id: number) =>
  unwrap<number>(apiClient.post(`/sales/targets/${id}/revise`), 'Failed to start a revision.');

export const deleteSalesTarget = (id: number) =>
  unwrap<number>(apiClient.delete(`/sales/targets/${id}`), 'Failed to delete the target.');

export const approveSalesTarget = (id: number, remarks?: string) =>
  unwrap<number>(apiClient.post(`/sales/target-approvals/${id}/approve`, { remarks }), 'Failed to approve the target.');

export const rejectSalesTarget = (id: number, remarks: string) =>
  unwrap<number>(apiClient.post(`/sales/target-approvals/${id}/reject`, { remarks }), 'Failed to reject the target.');

// ---- Detail reports that reproduce the client's own SAP queries ----
export const getReportFilterOptions = () =>
  unwrap<ReportFilterOptions>(apiClient.get('/sales/reports/filter-options'), 'Failed to load report filters.');

export const getOpenSalesOrderLines = (params: DetailReportQuery) =>
  unwrap<OpenSalesOrderReport>(apiClient.get('/sales/reports/open-sales-order-lines', { params }), 'Failed to load open sales order lines.');

export const getOpenPurchaseOrderLines = (params: DetailReportQuery) =>
  unwrap<OpenPurchaseOrderReport>(apiClient.get('/sales/reports/open-purchase-order-lines', { params }), 'Failed to load open purchase order lines.');

export const getSalesRegister = (params: DetailReportQuery) =>
  unwrap<SalesRegisterReport>(apiClient.get('/sales/reports/sales-register', { params, paramsSerializer: { indexes: null } }), 'Failed to load the sales register.');

export const getOutstandingLedger = (params: LedgerOutstandingQuery) =>
  unwrap<OutstandingLedger>(apiClient.get('/sales/reports/outstanding-ledger', { params }), 'Failed to load total outstanding.');

export const getOutstandingLedgerLines = (params: LedgerOutstandingQuery) =>
  unwrap<OutstandingLinesReport>(apiClient.get('/sales/reports/outstanding-ledger/lines', { params }), 'Failed to load outstanding journal lines.');

export const getCustomersReport = (params: DetailReportQuery) =>
  unwrap<CustomerReport>(apiClient.get('/sales/reports/customers', { params }), 'Failed to load customers.');

export const getPendingDeliveries = (params: DetailReportQuery) =>
  unwrap<PendingDeliveryReport>(apiClient.get('/sales/reports/pending-deliveries', { params }), 'Failed to load pending deliveries.');

export const getSalesAnalysis = (params: DetailReportQuery) =>
  unwrap<SalesAnalysisReport>(apiClient.get('/sales/reports/sales-analysis', { params }), 'Failed to load the sales analysis.');

export const getSalesPerformance = (params: PerformanceQuery) =>
  unwrap<SalesPerformance>(apiClient.get('/sales/dashboard/performance', { params }), 'Failed to load the sales performance.');

export const getCustomerGroupSales = (params: DetailReportQuery) =>
  unwrap<CustomerGroupSales>(apiClient.get('/sales/reports/customer-group-sales', { params, paramsSerializer: { indexes: null } }), 'Failed to load the customer group sales.');

export const getUnpaidInvoices = (params: DetailReportQuery) =>
  unwrap<UnpaidInvoiceReport>(apiClient.get('/sales/reports/unpaid-invoices', { params }), 'Failed to load unpaid invoices.');

export const getLostCustomers = (params: LostCustomerQuery) =>
  unwrap<LostCustomerReport>(apiClient.get('/sales/reports/lost-customers', { params }), 'Failed to load the lost-customer analysis.');

export const getOrderExecution = (params: Record<string, unknown>) =>
  unwrap<OrderExecutionReport>(apiClient.get('/sales/reports/order-execution', { params }), 'Failed to load the order execution report.');
