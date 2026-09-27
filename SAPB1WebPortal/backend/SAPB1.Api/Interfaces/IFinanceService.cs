using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Finance;

namespace SAPB1.Api.Interfaces;

/// <summary>
/// Read-only access to SAP B1 Finance/Accounting data (Chart of Accounts,
/// General Ledger, Journal Entries, Business Partner Ledger, A/R and A/P
/// ageing, payments, Bank/Cash, Trial Balance, Profit &amp; Loss, Balance
/// Sheet and Tax) for the company the current request is authenticated
/// against (see ICompanyConnectionFactory). No write operations — same
/// rationale as ISapB1Service/IPurchaseService/ISalesService/IProductionService.
/// </summary>
public interface IFinanceService
{
    Task<FinanceDashboardDto> GetDashboardAsync(CancellationToken ct = default);
    Task<FinanceAnalyticsDto> GetAnalyticsAsync(CancellationToken ct = default);

    Task<PagedResult<AccountDto>> GetChartOfAccountsAsync(ChartOfAccountsQuery query, CancellationToken ct = default);

    Task<PagedResult<LedgerEntryDto>> GetLedgerAsync(LedgerQuery query, CancellationToken ct = default);

    Task<PagedResult<JournalEntryDto>> GetJournalEntriesAsync(JournalEntryQuery query, CancellationToken ct = default);
    Task<JournalEntryDetailDto?> GetJournalEntryByTransIdAsync(int transId, CancellationToken ct = default);

    Task<PagedResult<BpLedgerDto>> GetBpLedgerAsync(BpLedgerQuery query, CancellationToken ct = default);

    Task<PagedResult<ReceivableDto>> GetReceivablesAsync(AgeingQuery query, CancellationToken ct = default);
    Task<AgeingSummaryDto> GetReceivablesSummaryAsync(CancellationToken ct = default);

    Task<PagedResult<PayableDto>> GetPayablesAsync(AgeingQuery query, CancellationToken ct = default);
    Task<AgeingSummaryDto> GetPayablesSummaryAsync(CancellationToken ct = default);

    Task<PagedResult<FinanceIncomingPaymentDto>> GetIncomingPaymentsAsync(LedgerQuery query, CancellationToken ct = default);
    Task<FinanceIncomingPaymentDetailDto?> GetIncomingPaymentByEntryAsync(int docEntry, CancellationToken ct = default);

    Task<PagedResult<FinanceOutgoingPaymentDto>> GetOutgoingPaymentsAsync(LedgerQuery query, CancellationToken ct = default);
    Task<FinanceOutgoingPaymentDetailDto?> GetOutgoingPaymentByEntryAsync(int docEntry, CancellationToken ct = default);

    Task<BankCashSummaryDto> GetBankCashAsync(CancellationToken ct = default);

    Task<TrialBalanceDto> GetTrialBalanceAsync(ReportPeriodQuery query, CancellationToken ct = default);
    Task<ProfitLossDto> GetProfitLossAsync(ReportPeriodQuery query, CancellationToken ct = default);
    Task<BalanceSheetDto> GetBalanceSheetAsync(DateTime? asOfDate, CancellationToken ct = default);
    Task<TaxSummaryDto> GetTaxAsync(ReportPeriodQuery query, CancellationToken ct = default);
}
