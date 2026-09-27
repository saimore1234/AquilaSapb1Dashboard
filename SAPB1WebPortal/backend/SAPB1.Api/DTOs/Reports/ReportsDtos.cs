using SAPB1.Api.DTOs.Common;

namespace SAPB1.Api.DTOs.Reports;

/// <summary>
/// The Reports Center is deliberately NOT a parallel set of ~200 bespoke
/// endpoints duplicating Sales/Purchase/Production/Finance/Inventory logic —
/// per the brief's own instruction ("reports should reuse existing APIs...
/// do not duplicate logic", "do not hardcode report rendering separately for
/// every report if a reusable architecture can handle it"). The large report
/// catalog is a frontend registry (src/data/reportCatalog.ts) whose entries
/// either deep-link into the existing, already-built module pages, or render
/// through one generic table/chart viewer fed by the existing Analytics/
/// Dashboard/list endpoints those modules already expose. This controller
/// only adds the handful of reports that have NO existing endpoint to reuse:
/// a cross-module management summary (composed from the existing services,
/// not new SQL), and inventory ageing/movement (which the Inventory module
/// never needed before now).
/// </summary>
public class StockAgeingRowDto
{
    public string ItemCode { get; set; } = string.Empty;
    public string? ItemName { get; set; }
    public string WarehouseCode { get; set; } = string.Empty;
    public string? WarehouseName { get; set; }
    public double OnHand { get; set; }
    public decimal StockValue { get; set; }
    /// <summary>Last date this item/warehouse received inbound stock (OINM InQty &gt; 0) — null when there's no movement history to compute age from.</summary>
    public DateTime? LastReceiptDate { get; set; }
    public int? AgeDays { get; set; }
    /// <summary>"0-30" | "31-60" | "61-90" | "91-180" | "180+" | "No Movement History".</summary>
    public string AgeingBucket { get; set; } = string.Empty;
}

public class InventoryMovementDto
{
    public int TransNum { get; set; }
    public DateTime PostingDate { get; set; }
    public string ItemCode { get; set; } = string.Empty;
    public string? ItemName { get; set; }
    public string? Warehouse { get; set; }
    public double InQty { get; set; }
    public double OutQty { get; set; }
    /// <summary>Raw OINM.TransType code — the originating transaction type, unverified against a confirmed label map for every code (see SqlReportsService).</summary>
    public string? TransactionType { get; set; }
    public string? Description { get; set; }
}

public class InventoryMovementQuery : PagedRequest
{
    public DateTime? DateFrom { get; set; }
    public DateTime? DateTo { get; set; }
    public string? Item { get; set; }
    public string? Warehouse { get; set; }
}

public class StockAgeingQuery
{
    private const int MaxPageSize = 1000;
    private int _pageSize = 200;
    public int Page { get; set; } = 1;
    public int PageSize { get => _pageSize; set => _pageSize = value <= 0 ? 200 : Math.Min(value, MaxPageSize); }
    public string? Search { get; set; }
    public string? Warehouse { get; set; }
    public string? AgeingBucket { get; set; }
    public int Skip => (Math.Max(Page, 1) - 1) * PageSize;
}

/// <summary>
/// Cross-module executive KPIs, composed entirely from the existing Sales/
/// Purchase/Production/Finance dashboard services — no new SQL.
/// </summary>
public class ManagementSummaryDto
{
    public decimal SalesThisMonth { get; set; }
    public decimal PurchasesThisMonth { get; set; }
    public decimal Revenue { get; set; }
    public decimal Expenses { get; set; }
    public decimal Receivables { get; set; }
    public decimal Payables { get; set; }
    public decimal CashBalance { get; set; }
    public decimal BankBalance { get; set; }
    public decimal InventoryValue { get; set; }
    public decimal NetProfitThisMonth { get; set; }
    public int OpenSalesOrders { get; set; }
    public int OpenPurchaseOrders { get; set; }
    public int OpenProductionOrders { get; set; }
    /// <summary>Working capital proxy: Receivables + CashBalance + BankBalance - Payables. A simplified indicator, not a full working-capital statement.</summary>
    public decimal WorkingCapitalEstimate { get; set; }
}
