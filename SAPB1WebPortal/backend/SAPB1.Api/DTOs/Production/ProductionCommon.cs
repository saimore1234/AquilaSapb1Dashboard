namespace SAPB1.Api.DTOs.Production;

/// <summary>One component line of a production order (SAP B1: WOR1), with
/// live availability joined from OITW using the exact same OnHand - IsCommited
/// formula already used everywhere else in this codebase (SqlSapB1Service).</summary>
public class ProductionComponentDto
{
    public int LineNum { get; set; }
    public string ItemCode { get; set; } = string.Empty;
    public string? ItemName { get; set; }
    public double PlannedQty { get; set; }
    public double IssuedQty { get; set; }
    public double RemainingQty { get; set; }
    public string? Warehouse { get; set; }
    /// <summary>Raw WOR1.IssueType code, unverified against real data in this
    /// installation (zero production rows in every configured company at
    /// verification time) — see SqlProductionService's class docs.</summary>
    public string? IssueMethod { get; set; }
    public string? Uom { get; set; }
    public double OnHand { get; set; }
    public double Committed { get; set; }
    public double Available { get; set; }
    /// <summary>"Available" | "Shortage" | "Partially Available" — calculated
    /// purely from RemainingQty vs Available, never fabricated.</summary>
    public string AvailabilityStatus { get; set; } = string.Empty;
}

/// <summary>A real finished-goods receipt (SAP B1: OINM) tied to this
/// production order via AppObjType/AppObjAbs — never invented.</summary>
public class ProductionReceiptEventDto
{
    public int TransNum { get; set; }
    public double Quantity { get; set; }
    public string? Warehouse { get; set; }
    public DateTime PostingDate { get; set; }
}
