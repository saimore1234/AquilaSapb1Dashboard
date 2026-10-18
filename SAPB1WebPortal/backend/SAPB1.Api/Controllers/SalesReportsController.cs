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
    private readonly ISalesDetailReportsService _detail;

    public SalesReportsController(ISalesReportsService reports, ISalesDetailReportsService detail)
    {
        _reports = reports;
        _detail = detail;
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
        if (!SAPB1.Api.Services.ProductCategories.IsValid(query.ProductCategory)) return BadRequest(ApiResponse<TurnoverBreakupDto>.Fail("Unknown product category."));
        return Ok(ApiResponse<TurnoverBreakupDto>.Ok(await _reports.GetTurnoverBreakupAsync(query, ct)));
    }

    // ---- Line-level / ledger reports that reproduce the client's own SAP queries ----

    private ActionResult<ApiResponse<T>>? CheckDetail<T>(DetailReportQuery q)
    {
        if (InvalidRange(q.DateFrom, q.DateTo)) return BadRequest(ApiResponse<T>.Fail("From Date must be on or before To Date."));
        if (!SAPB1.Api.Services.ProductCategories.IsValid(q.ProductCategory)) return BadRequest(ApiResponse<T>.Fail("Unknown product category."));
        if (q.PageSize < 1 || q.PageSize > 5000 || q.Page < 1) return BadRequest(ApiResponse<T>.Fail("Invalid paging."));
        return null;
    }

    [HttpGet("filter-options")]
    public async Task<ActionResult<ApiResponse<ReportFilterOptionsDto>>> GetFilterOptions(CancellationToken ct)
        => Ok(ApiResponse<ReportFilterOptionsDto>.Ok(await _detail.GetFilterOptionsAsync(ct)));

    [HttpGet("open-sales-order-lines")]
    public async Task<ActionResult<ApiResponse<OpenSalesOrderReportDto>>> GetOpenSalesOrderLines([FromQuery] DetailReportQuery query, CancellationToken ct)
        => CheckDetail<OpenSalesOrderReportDto>(query) ?? Ok(ApiResponse<OpenSalesOrderReportDto>.Ok(await _detail.GetOpenSalesOrderLinesAsync(query, ct)));

    [HttpGet("open-purchase-order-lines")]
    public async Task<ActionResult<ApiResponse<OpenPurchaseOrderReportDto>>> GetOpenPurchaseOrderLines([FromQuery] DetailReportQuery query, CancellationToken ct)
        => CheckDetail<OpenPurchaseOrderReportDto>(query) ?? Ok(ApiResponse<OpenPurchaseOrderReportDto>.Ok(await _detail.GetOpenPurchaseOrderLinesAsync(query, ct)));

    [HttpGet("sales-register")]
    public async Task<ActionResult<ApiResponse<SalesRegisterReportDto>>> GetSalesRegister([FromQuery] DetailReportQuery query, CancellationToken ct)
        => CheckDetail<SalesRegisterReportDto>(query) ?? Ok(ApiResponse<SalesRegisterReportDto>.Ok(await _detail.GetSalesRegisterAsync(query, ct)));

    [HttpGet("customer-group-sales")]
    public async Task<ActionResult<ApiResponse<CustomerGroupSalesDto>>> GetCustomerGroupSales([FromQuery] DetailReportQuery query, CancellationToken ct)
    {
        if (InvalidRange(query.DateFrom, query.DateTo)) return BadRequest(ApiResponse<CustomerGroupSalesDto>.Fail("From Date must be on or before To Date."));
        if (!SAPB1.Api.Services.ProductCategories.IsValid(query.ProductCategory)) return BadRequest(ApiResponse<CustomerGroupSalesDto>.Fail("Unknown product category."));
        return Ok(ApiResponse<CustomerGroupSalesDto>.Ok(await _detail.GetCustomerGroupSalesAsync(query, ct)));
    }

    [HttpGet("unpaid-invoices")]
    public async Task<ActionResult<ApiResponse<UnpaidInvoiceReportDto>>> GetUnpaidInvoices([FromQuery] DetailReportQuery query, CancellationToken ct)
        => CheckDetail<UnpaidInvoiceReportDto>(query) ?? Ok(ApiResponse<UnpaidInvoiceReportDto>.Ok(await _detail.GetUnpaidInvoicesAsync(query, ct)));

    [HttpGet("lost-customers")]
    public async Task<ActionResult<ApiResponse<LostCustomerReportDto>>> GetLostCustomers([FromQuery] LostCustomerQuery query, CancellationToken ct)
    {
        if (query.PageSize is < 1 or > 5000 || query.Page < 1) return BadRequest(ApiResponse<LostCustomerReportDto>.Fail("Invalid paging."));
        if (query.MinPreviousSales is < 0) return BadRequest(ApiResponse<LostCustomerReportDto>.Fail("Minimum previous-year sales can't be negative."));
        if (!string.IsNullOrWhiteSpace(query.FinancialYear) && !System.Text.RegularExpressions.Regex.IsMatch(query.FinancialYear.Trim(), @"^d{4}-d{2}$"))
            return BadRequest(ApiResponse<LostCustomerReportDto>.Fail("Financial year must look like 2026-27."));
        return Ok(ApiResponse<LostCustomerReportDto>.Ok(await _detail.GetLostCustomersAsync(query, ct)));
    }

    [HttpGet("order-execution")]
    public async Task<ActionResult<ApiResponse<OrderExecutionReportDto>>> GetOrderExecution([FromQuery] DetailReportQuery query, CancellationToken ct)
        => CheckDetail<OrderExecutionReportDto>(query) ?? Ok(ApiResponse<OrderExecutionReportDto>.Ok(await _detail.GetOrderExecutionAsync(query, ct)));

    [HttpGet("customers")]
    public async Task<ActionResult<ApiResponse<CustomerReportDto>>> GetCustomers([FromQuery] DetailReportQuery query, CancellationToken ct)
        => CheckDetail<CustomerReportDto>(query) ?? Ok(ApiResponse<CustomerReportDto>.Ok(await _detail.GetCustomersAsync(query, ct)));

    [HttpGet("pending-deliveries")]
    public async Task<ActionResult<ApiResponse<PendingDeliveryReportDto>>> GetPendingDeliveries([FromQuery] DetailReportQuery query, CancellationToken ct)
        => CheckDetail<PendingDeliveryReportDto>(query) ?? Ok(ApiResponse<PendingDeliveryReportDto>.Ok(await _detail.GetPendingDeliveriesAsync(query, ct)));

    [HttpGet("sales-analysis")]
    public async Task<ActionResult<ApiResponse<SalesAnalysisReportDto>>> GetSalesAnalysis([FromQuery] DetailReportQuery query, CancellationToken ct)
    {
        if (!SAPB1.Api.Services.SqlSalesDetailReportsService.AnalysisModes.Contains((query.By ?? "").Trim().ToLowerInvariant()))
            return BadRequest(ApiResponse<SalesAnalysisReportDto>.Fail("Unknown analysis grouping."));
        return CheckDetail<SalesAnalysisReportDto>(query) ?? Ok(ApiResponse<SalesAnalysisReportDto>.Ok(await _detail.GetSalesAnalysisAsync(query, ct)));
    }

    [HttpGet("outstanding-ledger")]
    public async Task<ActionResult<ApiResponse<OutstandingLedgerDto>>> GetOutstandingLedger([FromQuery] LedgerOutstandingQuery query, CancellationToken ct)
        => query.PageSize is < 1 or > 5000 || query.Page < 1
            ? BadRequest(ApiResponse<OutstandingLedgerDto>.Fail("Invalid paging."))
            : Ok(ApiResponse<OutstandingLedgerDto>.Ok(await _detail.GetLedgerOutstandingAsync(query, ct)));

    [HttpGet("outstanding-ledger/lines")]
    public async Task<ActionResult<ApiResponse<OutstandingLinesReportDto>>> GetOutstandingLedgerLines([FromQuery] LedgerOutstandingQuery query, CancellationToken ct)
        => query.PageSize is < 1 or > 5000 || query.Page < 1
            ? BadRequest(ApiResponse<OutstandingLinesReportDto>.Fail("Invalid paging."))
            : Ok(ApiResponse<OutstandingLinesReportDto>.Ok(await _detail.GetLedgerOutstandingLinesAsync(query, ct)));

    private static bool InvalidRange(DateTime? from, DateTime? to) =>
        from.HasValue && to.HasValue && from.Value.Date > to.Value.Date;
}
