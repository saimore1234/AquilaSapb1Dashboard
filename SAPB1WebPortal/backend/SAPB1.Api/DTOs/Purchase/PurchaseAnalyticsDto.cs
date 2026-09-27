namespace SAPB1.Api.DTOs.Purchase;

public class PurchaseByPeriodDto
{
    public string Period { get; set; } = string.Empty; // e.g. "2026-09"
    public decimal Value { get; set; }
}

public class PurchaseByVendorDto
{
    public string VendorCode { get; set; } = string.Empty;
    public string? VendorName { get; set; }
    public decimal Value { get; set; }
}

public class PurchaseByItemDto
{
    public string ItemCode { get; set; } = string.Empty;
    public string? ItemName { get; set; }
    public decimal Value { get; set; }
    public double Quantity { get; set; }
}

public class PurchaseByWarehouseDto
{
    public string WarehouseCode { get; set; } = string.Empty;
    public string? WarehouseName { get; set; }
    public decimal Value { get; set; }
}

public class PurchaseAnalyticsDto
{
    /// <summary>Last 12 months of A/P invoice value, oldest first.</summary>
    public List<PurchaseByPeriodDto> PurchaseByMonth { get; set; } = new();

    /// <summary>Top 10 vendors by A/P invoice value — doubles as "Top Vendors".</summary>
    public List<PurchaseByVendorDto> TopVendors { get; set; } = new();

    /// <summary>Top 10 items by purchased value — doubles as "Top Purchased Items".</summary>
    public List<PurchaseByItemDto> TopItems { get; set; } = new();

    public List<PurchaseByWarehouseDto> PurchaseByWarehouse { get; set; } = new();

    public decimal OpenPurchaseOrderValue { get; set; }
    public decimal OpenGrpoValue { get; set; }
    public decimal OpenApInvoiceValue { get; set; }
    public decimal OutstandingPayables { get; set; }
}
