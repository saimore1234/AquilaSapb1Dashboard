namespace SAPB1.Api.DTOs.Sales;

public class PerformanceQuery
{
    public DateTime? DateFrom { get; set; }
    public DateTime? DateTo { get; set; }
    /// <summary>OLCT.Code of the selected unit; empty = all units.</summary>
    public int? Unit { get; set; }
    public bool IncludeTax { get; set; }
    /// <summary>Net of credit notes (the reconciled client basis). Default on.</summary>
    public bool NetOfCreditNotes { get; set; } = true;
    public int? CustomerGroup { get; set; }
    public int? Salesperson { get; set; }
    public string? ProductCategory { get; set; }
}

/// <summary>One of the dashboard's named units. Location (OLCT) and Branch (OBPL) are distinct SAP dimensions, mapped by company
/// configuration (SalesDashboard:Units:&lt;company&gt;) and never assumed to be interchangeable.</summary>
public class UnitPerformanceDto
{
    public string Label { get; set; } = string.Empty;
    /// <summary>Resolved OLCT.Code; null when the configured location name was not found in SAP.</summary>
    public int? LocationCode { get; set; }
    public string? LocationName { get; set; }
    public int? BranchCode { get; set; }
    public string? BranchName { get; set; }
    public decimal Actual { get; set; }
    public bool TargetConfigured { get; set; }
    public decimal? Target { get; set; }
    public decimal? AchievementPct { get; set; }
    public decimal? Variance { get; set; }
    public int OpenOrderLines { get; set; }
    public decimal OpenOrderValue { get; set; }
    /// <summary>Journal-based outstanding of the mapped branch; null when no branch mapping is configured.</summary>
    public decimal? Outstanding { get; set; }
    public string? Note { get; set; }
}

public class SalesPerformanceDto
{
    public DateTime DateFrom { get; set; }
    public DateTime DateTo { get; set; }
    public bool IncludeTax { get; set; }
    public bool NetOfCreditNotes { get; set; }
    public int? SelectedUnit { get; set; }
    public string SelectedUnitLabel { get; set; } = "All units";

    public decimal Actual { get; set; }
    /// <summary>Actual on the basis the targets are set on (excluding tax). Equals Actual unless Include Tax is on; achievement, remaining and variance use this.</summary>
    public decimal ComparisonActual { get; set; }
    /// <summary>Which target level was compared: Company target | Unit target(s) | Salesperson targets.</summary>
    public string? TargetLevel { get; set; }
    public bool TargetConfigured { get; set; }
    public decimal? Target { get; set; }
    public decimal? AchievementPct { get; set; }
    public decimal? Remaining { get; set; }
    public decimal? Variance { get; set; }
    /// <summary>Achieved | In progress | No target configured</summary>
    public string Status { get; set; } = string.Empty;
    public int TargetCount { get; set; }
    /// <summary>Approved targets that only partly overlap the selected dates and therefore are NOT in Target.</summary>
    public int PartialTargetsExcluded { get; set; }
    /// <summary>Plain-language statement of exactly which targets are compared with the actual.</summary>
    public string TargetBasis { get; set; } = string.Empty;

    public List<UnitPerformanceDto> Units { get; set; } = new();
    public OpenOrderTotalsDto OpenOrders { get; set; } = new();
    public decimal TotalOutstanding { get; set; }
    public bool OutstandingAvailable { get; set; }
    public string? OutstandingNote { get; set; }
}
