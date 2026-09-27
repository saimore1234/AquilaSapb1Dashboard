namespace SAPB1.Api.DTOs.Production;

/// <summary>One component required by an open production order (SAP B1: WOR1 joined
/// to its OWOR header), with live availability from OITW — the same
/// OnHand - IsCommited formula used across the rest of this portal.</summary>
public class MaterialRequirementDto
{
    public int ProductionOrderDocEntry { get; set; }
    public int ProductionOrderDocNum { get; set; }
    public string FinishedGoodCode { get; set; } = string.Empty;
    public string? FinishedGoodName { get; set; }
    public string ComponentItemCode { get; set; } = string.Empty;
    public string? ComponentItemName { get; set; }
    public double RequiredQty { get; set; }
    public double IssuedQty { get; set; }
    public double RemainingQty { get; set; }
    public string? Warehouse { get; set; }
    public double OnHand { get; set; }
    public double Committed { get; set; }
    public double Available { get; set; }
    /// <summary>"Available" | "Shortage" | "Partially Available" — calculated purely from RemainingQty vs Available.</summary>
    public string AvailabilityStatus { get; set; } = string.Empty;
}
