namespace SAPB1.Api.DTOs.Dashboard;

public class DashboardSummaryDto
{
    public int TotalCustomers { get; set; }
    public int TotalVendors { get; set; }
    public int TotalItems { get; set; }
    public int OpenSalesOrders { get; set; }
    public int OpenPurchaseOrders { get; set; }
    public int OpenDeliveries { get; set; }
    public int OpenArInvoices { get; set; }
    public int OpenApInvoices { get; set; }
    public decimal CurrentStockValue { get; set; }
    public int LowStockItemsCount { get; set; }
    public List<LowStockItemDto> LowStockItems { get; set; } = new();
}

public class LowStockItemDto
{
    public string ItemCode { get; set; } = string.Empty;
    public string ItemName { get; set; } = string.Empty;
    public decimal OnHand { get; set; }
    public decimal Committed { get; set; }
    public decimal Available { get; set; }
}
