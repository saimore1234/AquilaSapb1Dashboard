namespace SAPB1.Api.DTOs.Sales;

/// <summary>Filters of the Sales Dashboard "Document activity" block. Same dimensions as the rest of the dashboard.</summary>
public class ActivityQuery
{
    public DateTime? DateFrom { get; set; }
    public DateTime? DateTo { get; set; }
    public int? Unit { get; set; }
    public bool IncludeTax { get; set; }
    public bool NetOfCreditNotes { get; set; } = true;
    public int? CustomerGroup { get; set; }
    public int? Salesperson { get; set; }
    public string? ProductCategory { get; set; }
}

/// <summary>
/// Document activity under the shared filters. Period-based: Total* (documents dated in the period) and the sales values.
/// Current position (dimension filters only, never the document date): Open*, Pending*, Overdue*, OutstandingReceivables.
/// </summary>
public class SalesActivityDto
{
    public DateTime DateFrom { get; set; }
    public DateTime DateTo { get; set; }
    public DateTime MonthFrom { get; set; }
    public DateTime YearFrom { get; set; }
    public int TotalQuotations { get; set; }
    public int OpenQuotations { get; set; }
    public int TotalSalesOrders { get; set; }
    public int OpenSalesOrders { get; set; }
    public int SalesOrdersThisMonth { get; set; }
    public int SalesOrdersThisYear { get; set; }
    public decimal OpenSalesOrderValue { get; set; }
    public int TotalDeliveries { get; set; }
    public int PendingDeliveries { get; set; }
    public int TotalArInvoices { get; set; }
    public int OpenArInvoices { get; set; }
    public int OverdueArInvoices { get; set; }
    /// <summary>Unpaid A/R invoice balance TODAY (current position), by invoice branch. null = not available (see OutstandingReceivablesNote).</summary>
    public decimal? OutstandingReceivables { get; set; }
    public string? OutstandingReceivablesNote { get; set; }
    public decimal MonthlySalesValue { get; set; }
    public decimal YearlySalesValue { get; set; }
    /// <summary>null when payments cannot be split by the selected dimension (see IncomingPaymentsNote).</summary>
    public decimal? IncomingPaymentsThisMonth { get; set; }
    public string? IncomingPaymentsNote { get; set; }
}
