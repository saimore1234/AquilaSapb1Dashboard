namespace SAPB1.Api.DTOs.Items;

public class ItemListItemDto
{
    public string ItemCode { get; set; } = string.Empty;
    public string ItemName { get; set; } = string.Empty;
    public string? ItemGroup { get; set; }
    public string? InventoryUom { get; set; }
    public decimal OnHand { get; set; }
    public decimal Committed { get; set; }
    public decimal Available { get; set; }
    public bool Active { get; set; }
}

public class ItemDetailDto
{
    public string ItemCode { get; set; } = string.Empty;
    public string ItemName { get; set; } = string.Empty;
    public string? ItemGroup { get; set; }
    public string? InventoryUom { get; set; }
    public string? SalesUom { get; set; }
    public string? PurchaseUom { get; set; }
    public string? Barcode { get; set; }
    public decimal OnHand { get; set; }
    public decimal Committed { get; set; }
    public decimal Ordered { get; set; }
    public decimal Available { get; set; }
    public decimal LastPurchasePrice { get; set; }
    public decimal LastSalesPrice { get; set; }
    public bool Active { get; set; }
    public List<ItemWarehouseStockDto> WarehouseStock { get; set; } = new();
}

public class ItemWarehouseStockDto
{
    public string WarehouseCode { get; set; } = string.Empty;
    public string? WarehouseName { get; set; }
    public decimal OnHand { get; set; }
    public decimal Committed { get; set; }
    public decimal Ordered { get; set; }
    public decimal Available { get; set; }
}
