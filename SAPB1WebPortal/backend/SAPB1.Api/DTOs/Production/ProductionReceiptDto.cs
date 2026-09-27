namespace SAPB1.Api.DTOs.Production;

/// <summary>A finished-goods receipt from production (SAP B1: OINM, filtered to
/// rows whose ApplObj/AppObjType/AppObjAbs point back at a production order —
/// see SqlProductionService's class docs for the object-type verification note).</summary>
public class ProductionReceiptDto
{
    public int TransNum { get; set; }
    public int? ProductionOrderDocEntry { get; set; }
    public int? ProductionOrderDocNum { get; set; }
    public string ItemCode { get; set; } = string.Empty;
    public string? ItemName { get; set; }
    public double Quantity { get; set; }
    public string? Warehouse { get; set; }
    public DateTime PostingDate { get; set; }
}
