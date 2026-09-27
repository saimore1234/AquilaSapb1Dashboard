namespace SAPB1.Api.DTOs.Sales;

public class SalesDashboardDto
{
    public int TotalQuotations { get; set; }
    public int OpenQuotations { get; set; }

    public int TotalSalesOrders { get; set; }
    public int OpenSalesOrders { get; set; }
    public int SalesOrdersThisMonth { get; set; }
    public int SalesOrdersThisYear { get; set; }

    public int TotalDeliveries { get; set; }
    public int PendingDeliveries { get; set; }

    public int TotalArInvoices { get; set; }
    public int OpenArInvoices { get; set; }
    public int OverdueArInvoices { get; set; }

    public decimal OutstandingReceivables { get; set; }

    public decimal MonthlySalesValue { get; set; }
    public decimal YearlySalesValue { get; set; }
    public decimal OpenSalesOrderValue { get; set; }

    public decimal IncomingPaymentsThisMonth { get; set; }
}
