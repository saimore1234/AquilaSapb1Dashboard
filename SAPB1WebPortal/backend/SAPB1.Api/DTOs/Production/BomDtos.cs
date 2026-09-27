namespace SAPB1.Api.DTOs.Production;

public class BomDto
{
    /// <summary>OITT.Code — the parent (finished/produced) item's code; a BOM is keyed by item code in SAP B1.</summary>
    public string Code { get; set; } = string.Empty;
    public string? ItemName { get; set; }
    /// <summary>Raw OITT.TreeType code plus a friendly label where confidently mappable — see SqlProductionService docs.</summary>
    public string TreeType { get; set; } = string.Empty;
    public double Quantity { get; set; }
    public string? Warehouse { get; set; }
    public int ComponentCount { get; set; }
}

public class BomComponentDto
{
    public int ChildNum { get; set; }
    public string ItemCode { get; set; } = string.Empty;
    public string? ItemName { get; set; }
    public double Quantity { get; set; }
    public string? Warehouse { get; set; }
    public string? IssueMethod { get; set; }
    public string? Uom { get; set; }
    /// <summary>ITT1.AddQuantit — SAP B1's extra/scrap allowance quantity on the component line, shown only when non-zero.</summary>
    public double AdditionalQuantity { get; set; }
}

public class BomDetailDto
{
    public string Code { get; set; } = string.Empty;
    public string? ItemName { get; set; }
    public string TreeType { get; set; } = string.Empty;
    public double Quantity { get; set; }
    public string? Warehouse { get; set; }
    public List<BomComponentDto> Components { get; set; } = new();
}
