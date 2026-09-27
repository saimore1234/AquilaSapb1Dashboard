namespace SAPB1.Api.DTOs.Purchase;

public class PurchaseDashboardDto
{
    public int TotalPurchaseOrders { get; set; }
    public int OpenPurchaseOrders { get; set; }
    public int PurchaseOrdersThisMonth { get; set; }
    public int PurchaseOrdersThisYear { get; set; }

    public int TotalGrpo { get; set; }
    public int OpenGrpo { get; set; }

    public int TotalApInvoices { get; set; }
    public int OpenApInvoices { get; set; }
    public int OverdueApInvoices { get; set; }

    public decimal OutstandingPayables { get; set; }

    public decimal MonthlyPurchaseValue { get; set; }
    public decimal YearlyPurchaseValue { get; set; }
    public decimal OpenPurchaseOrderValue { get; set; }
}
