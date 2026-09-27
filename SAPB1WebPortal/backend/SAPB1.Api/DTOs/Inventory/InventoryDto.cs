namespace SAPB1.Api.DTOs.Inventory;

public class InventoryListItemDto
{
    public string ItemCode { get; set; } = string.Empty;
    public string ItemName { get; set; } = string.Empty;
    public string ItemGroup { get; set; } = string.Empty;
    public string WarehouseCode { get; set; } = string.Empty;
    public string? WarehouseName { get; set; }
    public decimal OnHand { get; set; }
    public decimal Committed { get; set; }
    public decimal Ordered { get; set; }
    public decimal Available { get; set; }
    public decimal StockValue { get; set; }
    public string StockStatus { get; set; } = string.Empty; // "In Stock" | "Low Stock" | "Out of Stock"
}

public class WarehouseStockSummaryDto
{
    public string WarehouseCode { get; set; } = string.Empty;
    public string WarehouseName { get; set; } = string.Empty;
    public int ItemCount { get; set; }
    public decimal TotalOnHand { get; set; }
    public decimal TotalStockValue { get; set; }
}

/// <summary>Minimal warehouse picker entry — code/name only, from OWHS.</summary>
public class WarehouseDto
{
    public string WarehouseCode { get; set; } = string.Empty;
    public string WarehouseName { get; set; } = string.Empty;
}
