using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SAPB1.Api.Auth;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Sales;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Controllers;

/// <summary>Read-only Sales reports (Invoice Register, Outstanding, Ledger, Analytics).</summary>
[ApiController]
[Route("api/sales/reports")]
[Authorize]
[RequirePermission("Sales.View")]
public class SalesReportsController : ControllerBase
{
    private readonly ISalesReportsService _reports;

    public SalesReportsController(ISalesReportsService reports)
    {
        _reports = reports;
    }

    [HttpGet("invoice-register")]
    public async Task<ActionResult<ApiResponse<InvoiceRegisterDto>>> GetInvoiceRegister([FromQuery] InvoiceRegisterQuery query, CancellationToken ct)
    {
        if (InvalidRange(query.DateFrom, query.DateTo)) return BadRequest(ApiResponse<InvoiceRegisterDto>.Fail("From Date must be on or before To Date."));
        return Ok(ApiResponse<InvoiceRegisterDto>.Ok(await _reports.GetInvoiceRegisterAsync(query, ct)));
    }

    [HttpGet("customer-outstanding")]
    public async Task<ActionResult<ApiResponse<CustomerOutstandingDto>>> GetCustomerOutstanding(CancellationToken ct)
        => Ok(ApiResponse<CustomerOutstandingDto>.Ok(await _reports.GetCustomerOutstandingAsync(ct)));

    [HttpGet("customer-lookup")]
    public async Task<ActionResult<ApiResponse<List<CustomerLookupDto>>>> LookupCustomers([FromQuery] string? search, CancellationToken ct)
        => Ok(ApiResponse<List<CustomerLookupDto>>.Ok(await _reports.LookupCustomersAsync(search, ct)));

    [HttpGet("customer-ledger")]
    public async Task<ActionResult<ApiResponse<CustomerLedgerDto>>> GetCustomerLedger(
        [FromQuery] string customer, [FromQuery] DateTime? dateFrom, [FromQuery] DateTime? dateTo, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(customer))
            return BadRequest(ApiResponse<CustomerLedgerDto>.Fail("A customer code is required."));
        if (InvalidRange(dateFrom, dateTo)) return BadRequest(ApiResponse<CustomerLedgerDto>.Fail("From Date must be on or before To Date."));
        var result = await _reports.GetCustomerLedgerAsync(customer, dateFrom, dateTo, ct);
        return result is null
            ? NotFound(ApiResponse<CustomerLedgerDto>.Fail("Customer not found."))
            : Ok(ApiResponse<CustomerLedgerDto>.Ok(result));
    }

    [HttpGet("analytics-options")]
    public async Task<ActionResult<ApiResponse<SalesAnalyticsOptionsDto>>> GetAnalyticsOptions(CancellationToken ct)
        => Ok(ApiResponse<SalesAnalyticsOptionsDto>.Ok(await _reports.GetAnalyticsOptionsAsync(ct)));

    [HttpGet("analytics")]
    public async Task<ActionResult<ApiResponse<SalesAnalyticsReportDto>>> GetAnalytics([FromQuery] SalesAnalyticsQuery query, CancellationToken ct)
    {
        if (InvalidRange(query.DateFrom, query.DateTo)) return BadRequest(ApiResponse<SalesAnalyticsReportDto>.Fail("From Date must be on or before To Date."));
        return Ok(ApiResponse<SalesAnalyticsReportDto>.Ok(await _reports.GetSalesAnalyticsAsync(query, ct)));
    }

    [HttpGet("turnover-breakup")]
    public async Task<ActionResult<ApiResponse<TurnoverBreakupDto>>> GetTurnoverBreakup([FromQuery] TurnoverQuery query, CancellationToken ct)
    {
        if (InvalidRange(query.DateFrom, query.DateTo)) return BadRequest(ApiResponse<TurnoverBreakupDto>.Fail("From Date must be on or before To Date."));
        return Ok(ApiResponse<TurnoverBreakupDto>.Ok(await _reports.GetTurnoverBreakupAsync(query, ct)));
    }

    private static bool InvalidRange(DateTime? from, DateTime? to) =>
        from.HasValue && to.HasValue && from.Value.Date > to.Value.Date;
}
