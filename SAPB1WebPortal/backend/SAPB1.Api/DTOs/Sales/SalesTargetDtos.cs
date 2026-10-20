namespace SAPB1.Api.DTOs.Sales;

/// <summary>One item row of an item-wise target. Name/group/UOM are never taken from the client — the server reads them from SAP.</summary>
public class SaveSalesTargetLineRequest
{
    public string ItemCode { get; set; } = string.Empty;
    public decimal TargetQuantity { get; set; }
    public decimal TargetAmount { get; set; }
    public string? Remarks { get; set; }
}

/// <summary>Create / update payload. For Monthly/Quarterly/Annual the period dates are NEVER taken from the client — the
/// server derives them from FinancialYear + PeriodType + PeriodIndex (month 1-12 / quarter 1-4 / 1, counted from April).
/// For PeriodType "Custom" the explicit FromDate/ToDate are used. When Lines is non-empty the target is item-wise and
/// TargetAmount is ignored (the header total is the sum of the line amounts).</summary>
public class SaveSalesTargetRequest
{
    /// <summary>Company | Unit | Salesperson (default Salesperson). Company/Unit targets carry no salesperson and no item rows.</summary>
    public string? Scope { get; set; }
    public int SapSlpCode { get; set; }
    /// <summary>OLCT.Code of the unit, or -1 for all units.</summary>
    public int UnitCode { get; set; } = -1;
    public string FinancialYear { get; set; } = string.Empty; // "2026-27" (ignored for Custom; derived from FromDate)
    public string PeriodType { get; set; } = "Monthly";       // Monthly | Quarterly | Annual | Custom
    public int PeriodIndex { get; set; } = 1;
    public DateTime? FromDate { get; set; }                    // Custom only
    public DateTime? ToDate { get; set; }                      // Custom only
    public decimal TargetAmount { get; set; }
    public string? CurrencyCode { get; set; } = "INR";
    public string? Remarks { get; set; }
    public List<SaveSalesTargetLineRequest>? Lines { get; set; }
}

public class ReviewSalesTargetRequest
{
    public string? Remarks { get; set; }
}

public class SalesTargetQuery
{
    /// <summary>Company | Unit | Salesperson. Default Salesperson, so the existing Salesperson Targets page is unchanged.</summary>
    public string? Scope { get; set; }
    public string? FinancialYear { get; set; }
    public string? PeriodType { get; set; }
    public int? Unit { get; set; }
    public int? Salesperson { get; set; }
    /// <summary>SAP item code: only targets that contain this item.</summary>
    public string? Item { get; set; }
    /// <summary>Only targets whose period overlaps [FromDate, ToDate].</summary>
    public DateTime? FromDate { get; set; }
    public DateTime? ToDate { get; set; }
    public string? Status { get; set; }
    public string? Search { get; set; }
    public bool IncludeTax { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 15;
}

public class SalesTargetLineDto
{
    public int Id { get; set; }
    public string ItemCode { get; set; } = string.Empty;
    public string? ItemName { get; set; }
    public string? ItemGroup { get; set; }
    public string? Uom { get; set; }
    public decimal TargetQuantity { get; set; }
    public decimal TargetAmount { get; set; }
    public string? Remarks { get; set; }

    // Actuals from SAP for this salesperson / unit / period / item (net of credit memos)
    public decimal ActualQuantity { get; set; }
    public decimal ActualAmount { get; set; }
    /// <summary>null when the line has no amount target (never a divide-by-zero).</summary>
    public decimal? AchievementPct { get; set; }
    public decimal? QuantityAchievementPct { get; set; }
    public decimal RemainingAmount { get; set; }
    public decimal RemainingQuantity { get; set; }
}

public class SalesTargetDto
{
    public int Id { get; set; }
    public string Scope { get; set; } = "Salesperson";
    public int SapSlpCode { get; set; }
    public string SalespersonName { get; set; } = string.Empty;
    public int UnitCode { get; set; }
    public string UnitName { get; set; } = "All units";
    public string FinancialYear { get; set; } = string.Empty;
    public string PeriodType { get; set; } = string.Empty;
    public DateTime PeriodStart { get; set; }
    public DateTime PeriodEnd { get; set; }
    public decimal TargetAmount { get; set; }
    public string CurrencyCode { get; set; } = "INR";
    public bool HasItems { get; set; }
    public string? Remarks { get; set; }
    public string Status { get; set; } = string.Empty;
    public int? RevisionOfId { get; set; }
    public string? ReviewRemarks { get; set; }
    public string CreatedBy { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public string? UpdatedBy { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public string? SubmittedBy { get; set; }
    public DateTime? SubmittedAt { get; set; }
    public string? ReviewedBy { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public string? ApprovedBy { get; set; }
    public DateTime? ApprovedAt { get; set; }

    // Item-wise targets
    public int ItemCount { get; set; }
    public decimal TotalTargetQuantity { get; set; }
    public decimal ActualQuantity { get; set; }

    // Actuals from SAP (net sales, same rule as the Sales Overview "Net of credit notes" basis).
    // Item-wise targets compare only the sales of their own items; amount-only targets compare all of the salesperson's sales.
    public decimal ActualSales { get; set; }
    /// <summary>null when there is no (or a zero) target — never a divide-by-zero.</summary>
    public decimal? AchievementPct { get; set; }
    public decimal RemainingTarget { get; set; }
    public decimal Variance { get; set; }
    public int SalesOrders { get; set; }
    public int ArInvoices { get; set; }
}

public class SalesTargetSummaryDto
{
    public decimal TotalTarget { get; set; }
    public decimal TotalActual { get; set; }
    public decimal? OverallAchievementPct { get; set; }
    public int SalespersonsWithTargets { get; set; }
    public int PendingApproval { get; set; }
}

public class SalesTargetChartPointDto
{
    public int SapSlpCode { get; set; }
    public string Salesperson { get; set; } = string.Empty;
    public decimal Target { get; set; }
    public decimal Actual { get; set; }
}

public class SalesTargetListDto
{
    public SalesTargetSummaryDto Summary { get; set; } = new();
    public List<SalesTargetChartPointDto> ByPerson { get; set; } = new();
    public List<SalesTargetDto> Rows { get; set; } = new();
    public int TotalCount { get; set; }
    public bool IncludeTax { get; set; }
}

public class SalesTargetAuditDto
{
    public long Id { get; set; }
    public string Action { get; set; } = string.Empty;
    public string PerformedBy { get; set; } = string.Empty;
    public DateTime PerformedAt { get; set; }
    public string? Detail { get; set; }
}

public class SalesTargetDetailDto
{
    public SalesTargetDto Target { get; set; } = new();
    public List<SalesTargetLineDto> Lines { get; set; } = new();
    public List<SalesTargetAuditDto> History { get; set; } = new();
}

public class SalespersonOptionDto
{
    public int Code { get; set; }
    public string Name { get; set; } = string.Empty;
    public bool Active { get; set; }
}

public class SalesTargetItemOptionDto
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Group { get; set; }
    public string? Uom { get; set; }
}

public class SalesTargetOptionsDto
{
    public List<SalespersonOptionDto> Salespersons { get; set; } = new();
    public List<TurnoverOptionDto> Units { get; set; } = new();
    public List<string> FinancialYears { get; set; } = new();
}

/// <summary>Outcome of a state-changing call; the controller maps StatusCode/Message to the HTTP response.</summary>
public record SalesTargetResult(bool Ok, int StatusCode, string? Message, int? Id = null)
{
    public static SalesTargetResult Success(int? id = null) => new(true, 200, null, id);
    public static SalesTargetResult Fail(int status, string message) => new(false, status, message);
}

public class TargetPerformanceQuery
{
    public string? Scope { get; set; }
    public string? FinancialYear { get; set; }
    public int? Unit { get; set; }
    public int? Salesperson { get; set; }
    public bool IncludeTax { get; set; }
}

/// <summary>One calendar month, quarter or the whole financial year: actual turnover vs the APPROVED target of exactly that period.</summary>
public class PeriodPerformanceDto
{
    public string Label { get; set; } = string.Empty;
    public DateTime Start { get; set; }
    public DateTime End { get; set; }
    public decimal Actual { get; set; }
    /// <summary>null = no approved target of this period type (never zero-filled).</summary>
    public decimal? Target { get; set; }
    public decimal? AchievementPct { get; set; }
    public decimal? Remaining { get; set; }
    public decimal? Variance { get; set; }
}

public class TargetPerformanceDto
{
    public string Scope { get; set; } = "Salesperson";
    public string FinancialYear { get; set; } = string.Empty;
    public string EntityLabel { get; set; } = string.Empty;
    public bool IncludeTax { get; set; }
    public List<PeriodPerformanceDto> Months { get; set; } = new();
    public List<PeriodPerformanceDto> Quarters { get; set; } = new();
    public PeriodPerformanceDto Year { get; set; } = new();
    public string Note { get; set; } = string.Empty;
}
