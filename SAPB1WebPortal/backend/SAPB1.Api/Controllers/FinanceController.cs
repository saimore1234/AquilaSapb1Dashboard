using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SAPB1.Api.Auth;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Finance;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Controllers;

/// <summary>
/// Read-only Finance/Accounting data for whichever company the caller's JWT
/// is scoped to — see IFinanceService/SqlFinanceService. No write endpoints:
/// this module never creates, edits or deletes SAP B1 accounting data.
/// </summary>
[ApiController]
[Route("api/finance")]
// Role list relaxed to plain [Authorize] — see CustomersController for why.
[Authorize]
[RequirePermission("Finance.View")]
public class FinanceController : ControllerBase
{
    private readonly IFinanceService _financeService;

    public FinanceController(IFinanceService financeService)
    {
        _financeService = financeService;
    }

    [HttpGet("dashboard")]
    public async Task<ActionResult<ApiResponse<FinanceDashboardDto>>> GetDashboard(CancellationToken ct)
    {
        var result = await _financeService.GetDashboardAsync(ct);
        return Ok(ApiResponse<FinanceDashboardDto>.Ok(result));
    }

    [HttpGet("analytics")]
    public async Task<ActionResult<ApiResponse<FinanceAnalyticsDto>>> GetAnalytics(CancellationToken ct)
    {
        var result = await _financeService.GetAnalyticsAsync(ct);
        return Ok(ApiResponse<FinanceAnalyticsDto>.Ok(result));
    }

    [HttpGet("chart-of-accounts")]
    public async Task<ActionResult<ApiResponse<PagedResult<AccountDto>>>> GetChartOfAccounts([FromQuery] ChartOfAccountsQuery query, CancellationToken ct)
    {
        var result = await _financeService.GetChartOfAccountsAsync(query, ct);
        return Ok(ApiResponse<PagedResult<AccountDto>>.Ok(result));
    }

    [HttpGet("ledger")]
    public async Task<ActionResult<ApiResponse<PagedResult<LedgerEntryDto>>>> GetLedger([FromQuery] LedgerQuery query, CancellationToken ct)
    {
        var result = await _financeService.GetLedgerAsync(query, ct);
        return Ok(ApiResponse<PagedResult<LedgerEntryDto>>.Ok(result));
    }

    [HttpGet("journal-entries")]
    public async Task<ActionResult<ApiResponse<PagedResult<JournalEntryDto>>>> GetJournalEntries([FromQuery] JournalEntryQuery query, CancellationToken ct)
    {
        var result = await _financeService.GetJournalEntriesAsync(query, ct);
        return Ok(ApiResponse<PagedResult<JournalEntryDto>>.Ok(result));
    }

    [HttpGet("journal-entries/{transId:int}")]
    public async Task<ActionResult<ApiResponse<JournalEntryDetailDto>>> GetJournalEntry(int transId, CancellationToken ct)
    {
        var result = await _financeService.GetJournalEntryByTransIdAsync(transId, ct);
        if (result is null) return NotFound(ApiResponse<JournalEntryDetailDto>.Fail($"Journal Entry #{transId} was not found."));
        return Ok(ApiResponse<JournalEntryDetailDto>.Ok(result));
    }

    [HttpGet("bp-ledger")]
    public async Task<ActionResult<ApiResponse<PagedResult<BpLedgerDto>>>> GetBpLedger([FromQuery] BpLedgerQuery query, CancellationToken ct)
    {
        var result = await _financeService.GetBpLedgerAsync(query, ct);
        return Ok(ApiResponse<PagedResult<BpLedgerDto>>.Ok(result));
    }

    [HttpGet("receivables")]
    public async Task<ActionResult<ApiResponse<PagedResult<ReceivableDto>>>> GetReceivables([FromQuery] AgeingQuery query, CancellationToken ct)
    {
        var result = await _financeService.GetReceivablesAsync(query, ct);
        return Ok(ApiResponse<PagedResult<ReceivableDto>>.Ok(result));
    }

    [HttpGet("receivables/summary")]
    public async Task<ActionResult<ApiResponse<AgeingSummaryDto>>> GetReceivablesSummary(CancellationToken ct)
    {
        var result = await _financeService.GetReceivablesSummaryAsync(ct);
        return Ok(ApiResponse<AgeingSummaryDto>.Ok(result));
    }

    [HttpGet("payables")]
    public async Task<ActionResult<ApiResponse<PagedResult<PayableDto>>>> GetPayables([FromQuery] AgeingQuery query, CancellationToken ct)
    {
        var result = await _financeService.GetPayablesAsync(query, ct);
        return Ok(ApiResponse<PagedResult<PayableDto>>.Ok(result));
    }

    [HttpGet("payables/summary")]
    public async Task<ActionResult<ApiResponse<AgeingSummaryDto>>> GetPayablesSummary(CancellationToken ct)
    {
        var result = await _financeService.GetPayablesSummaryAsync(ct);
        return Ok(ApiResponse<AgeingSummaryDto>.Ok(result));
    }

    [HttpGet("incoming-payments")]
    public async Task<ActionResult<ApiResponse<PagedResult<FinanceIncomingPaymentDto>>>> GetIncomingPayments([FromQuery] LedgerQuery query, CancellationToken ct)
    {
        var result = await _financeService.GetIncomingPaymentsAsync(query, ct);
        return Ok(ApiResponse<PagedResult<FinanceIncomingPaymentDto>>.Ok(result));
    }

    [HttpGet("incoming-payments/{docEntry:int}")]
    public async Task<ActionResult<ApiResponse<FinanceIncomingPaymentDetailDto>>> GetIncomingPayment(int docEntry, CancellationToken ct)
    {
        var result = await _financeService.GetIncomingPaymentByEntryAsync(docEntry, ct);
        if (result is null) return NotFound(ApiResponse<FinanceIncomingPaymentDetailDto>.Fail($"Payment #{docEntry} was not found."));
        return Ok(ApiResponse<FinanceIncomingPaymentDetailDto>.Ok(result));
    }

    [HttpGet("outgoing-payments")]
    public async Task<ActionResult<ApiResponse<PagedResult<FinanceOutgoingPaymentDto>>>> GetOutgoingPayments([FromQuery] LedgerQuery query, CancellationToken ct)
    {
        var result = await _financeService.GetOutgoingPaymentsAsync(query, ct);
        return Ok(ApiResponse<PagedResult<FinanceOutgoingPaymentDto>>.Ok(result));
    }

    [HttpGet("outgoing-payments/{docEntry:int}")]
    public async Task<ActionResult<ApiResponse<FinanceOutgoingPaymentDetailDto>>> GetOutgoingPayment(int docEntry, CancellationToken ct)
    {
        var result = await _financeService.GetOutgoingPaymentByEntryAsync(docEntry, ct);
        if (result is null) return NotFound(ApiResponse<FinanceOutgoingPaymentDetailDto>.Fail($"Payment #{docEntry} was not found."));
        return Ok(ApiResponse<FinanceOutgoingPaymentDetailDto>.Ok(result));
    }

    [HttpGet("bank-cash")]
    public async Task<ActionResult<ApiResponse<BankCashSummaryDto>>> GetBankCash(CancellationToken ct)
    {
        var result = await _financeService.GetBankCashAsync(ct);
        return Ok(ApiResponse<BankCashSummaryDto>.Ok(result));
    }

    [HttpGet("trial-balance")]
    public async Task<ActionResult<ApiResponse<TrialBalanceDto>>> GetTrialBalance([FromQuery] ReportPeriodQuery query, CancellationToken ct)
    {
        var result = await _financeService.GetTrialBalanceAsync(query, ct);
        return Ok(ApiResponse<TrialBalanceDto>.Ok(result));
    }

    [HttpGet("profit-loss")]
    public async Task<ActionResult<ApiResponse<ProfitLossDto>>> GetProfitLoss([FromQuery] ReportPeriodQuery query, CancellationToken ct)
    {
        var result = await _financeService.GetProfitLossAsync(query, ct);
        return Ok(ApiResponse<ProfitLossDto>.Ok(result));
    }

    [HttpGet("balance-sheet")]
    public async Task<ActionResult<ApiResponse<BalanceSheetDto>>> GetBalanceSheet([FromQuery] DateTime? asOfDate, CancellationToken ct)
    {
        var result = await _financeService.GetBalanceSheetAsync(asOfDate, ct);
        return Ok(ApiResponse<BalanceSheetDto>.Ok(result));
    }

    [HttpGet("tax")]
    public async Task<ActionResult<ApiResponse<TaxSummaryDto>>> GetTax([FromQuery] ReportPeriodQuery query, CancellationToken ct)
    {
        var result = await _financeService.GetTaxAsync(query, ct);
        return Ok(ApiResponse<TaxSummaryDto>.Ok(result));
    }
}
