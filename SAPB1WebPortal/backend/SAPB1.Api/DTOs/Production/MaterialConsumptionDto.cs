namespace SAPB1.Api.DTOs.Production;

/// <summary>Planned vs. issued quantity for a production order component,
/// across all production orders (not just open ones) — SAP B1: WOR1/OWOR.</summary>
public class MaterialConsumptionDto
{
    public int ProductionOrderDocEntry { get; set; }
    public int ProductionOrderDocNum { get; set; }
    public string FinishedGoodCode { get; set; } = string.Empty;
    public string? FinishedGoodName { get; set; }
    public string ComponentItemCode { get; set; } = string.Empty;
    public string? ComponentItemName { get; set; }
    public double PlannedQty { get; set; }
    public double IssuedQty { get; set; }
    /// <summary>Calculated field: IssuedQty - PlannedQty. Positive = over-consumed, negative = under-consumed.</summary>
    public double Variance { get; set; }
    public string? Warehouse { get; set; }
    public DateTime PostingDate { get; set; }
}
