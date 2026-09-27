import { apiClient } from './client';
import type {
  ApiResponse,
  PagedResult,
  ChartOfAccountsQuery,
  Account,
  LedgerQuery,
  LedgerEntry,
  JournalEntryQuery,
  JournalEntry,
  JournalEntryDetail,
  BpLedgerQuery,
  BpLedger,
  AgeingQuery,
  Receivable,
  Payable,
  AgeingSummary,
  FinanceIncomingPayment,
  FinanceOutgoingPayment,
  BankCashSummary,
  ReportPeriodQuery,
  TrialBalance,
  ProfitLoss,
  BalanceSheet,
  TaxSummary,
  FinanceDashboard,
  FinanceAnalytics
} from '../types';

// Every function here talks to the existing GET /api/finance/* endpoints —
// the company is always resolved server-side from the JWT; nothing here ever
// sends a database/company parameter.

async function unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>, notFoundMessage: string): Promise<T> {
  const { data } = await promise;
  if (!data.success || data.data === null || data.data === undefined) {
    throw new Error(data.message || notFoundMessage);
  }
  return data.data;
}

export const getFinanceDashboard = () =>
  unwrap<FinanceDashboard>(apiClient.get('/finance/dashboard'), 'Failed to load the finance dashboard.');

export const getFinanceAnalytics = () =>
  unwrap<FinanceAnalytics>(apiClient.get('/finance/analytics'), 'Failed to load financial analytics.');

export const getChartOfAccounts = (query: ChartOfAccountsQuery) =>
  unwrap<PagedResult<Account>>(apiClient.get('/finance/chart-of-accounts', { params: query }), 'Failed to load the chart of accounts.');

export const getLedger = (query: LedgerQuery) =>
  unwrap<PagedResult<LedgerEntry>>(apiClient.get('/finance/ledger', { params: query }), 'Failed to load the general ledger.');

export const getJournalEntries = (query: JournalEntryQuery) =>
  unwrap<PagedResult<JournalEntry>>(apiClient.get('/finance/journal-entries', { params: query }), 'Failed to load journal entries.');
export const getJournalEntryByTransId = (transId: number) =>
  unwrap<JournalEntryDetail>(apiClient.get(`/finance/journal-entries/${transId}`), 'Journal Entry not found.');

export const getBpLedger = (query: BpLedgerQuery) =>
  unwrap<PagedResult<BpLedger>>(apiClient.get('/finance/bp-ledger', { params: query }), 'Failed to load the business partner ledger.');

export const getReceivables = (query: AgeingQuery) =>
  unwrap<PagedResult<Receivable>>(apiClient.get('/finance/receivables', { params: query }), 'Failed to load receivables.');
export const getReceivablesSummary = () =>
  unwrap<AgeingSummary>(apiClient.get('/finance/receivables/summary'), 'Failed to load the receivables summary.');

export const getPayables = (query: AgeingQuery) =>
  unwrap<PagedResult<Payable>>(apiClient.get('/finance/payables', { params: query }), 'Failed to load payables.');
export const getPayablesSummary = () =>
  unwrap<AgeingSummary>(apiClient.get('/finance/payables/summary'), 'Failed to load the payables summary.');

export const getFinanceIncomingPayments = (query: LedgerQuery) =>
  unwrap<PagedResult<FinanceIncomingPayment>>(apiClient.get('/finance/incoming-payments', { params: query }), 'Failed to load incoming payments.');

export const getFinanceOutgoingPayments = (query: LedgerQuery) =>
  unwrap<PagedResult<FinanceOutgoingPayment>>(apiClient.get('/finance/outgoing-payments', { params: query }), 'Failed to load outgoing payments.');

export const getBankCash = () =>
  unwrap<BankCashSummary>(apiClient.get('/finance/bank-cash'), 'Failed to load bank and cash data.');

export const getTrialBalance = (query: ReportPeriodQuery) =>
  unwrap<TrialBalance>(apiClient.get('/finance/trial-balance', { params: query }), 'Failed to load the trial balance.');

export const getProfitLoss = (query: ReportPeriodQuery) =>
  unwrap<ProfitLoss>(apiClient.get('/finance/profit-loss', { params: query }), 'Failed to load the profit & loss statement.');

export const getBalanceSheet = (asOfDate?: string) =>
  unwrap<BalanceSheet>(apiClient.get('/finance/balance-sheet', { params: asOfDate ? { asOfDate } : {} }), 'Failed to load the balance sheet.');

export const getTax = (query: ReportPeriodQuery) =>
  unwrap<TaxSummary>(apiClient.get('/finance/tax', { params: query }), 'Failed to load tax data.');
