namespace SAPB1.Api.DTOs.Sales;

public class SalesByPeriodDto
{
    public string Period { get; set; } = string.Empty; // e.g. "2026-09"
    public decimal Value { get; set; }
}

public class SalesByCustomerDto
{
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public decimal Value { get; set; }
}

public class SalesByItemDto
{
    public string ItemCode { get; set; } = string.Empty;
    public string? ItemName { get; set; }
    public decimal Value { get; set; }
    public double Quantity { get; set; }
}

public class SalesByWarehouseDto
{
    public string WarehouseCode { get; set; } = string.Empty;
    public string? WarehouseName { get; set; }
    public decimal Value { get; set; }
}

public class SalesByEmployeeDto
{
    public int SalesEmployeeCode { get; set; }
    public string? SalesEmployeeName { get; set; }
    public decimal Value { get; set; }
}

public class SalesAnalyticsDto
{
    /// <summary>Last 12 months of A/R invoice value, oldest first.</summary>
    public List<SalesByPeriodDto> SalesByMonth { get; set; } = new();

    /// <summary>Top 10 customers by A/R invoice value — doubles as "Top Customers".</summary>
    public List<SalesByCustomerDto> TopCustomers { get; set; } = new();

    /// <summary>Top 10 items by sold value — doubles as "Top Selling Items".</summary>
    public List<SalesByItemDto> TopItems { get; set; } = new();

    public List<SalesByWarehouseDto> SalesByWarehouse { get; set; } = new();

    public List<SalesByEmployeeDto> SalesBySalesEmployee { get; set; } = new();

    public decimal OpenQuotationValue { get; set; }
    public decimal OpenSalesOrderValue { get; set; }
    public decimal OpenDeliveryValue { get; set; }
    public decimal OpenArInvoiceValue { get; set; }
    public decimal OutstandingReceivables { get; set; }
    public decimal IncomingPaymentsValue { get; set; }
}
