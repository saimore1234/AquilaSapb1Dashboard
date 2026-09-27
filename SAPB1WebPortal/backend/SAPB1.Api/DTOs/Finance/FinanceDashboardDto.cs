namespace SAPB1.Api.DTOs.Finance;

public class FinanceDashboardDto
{
    public decimal TotalReceivables { get; set; }
    public decimal TotalPayables { get; set; }
    public decimal CashBalance { get; set; }
    public decimal BankBalance { get; set; }
    public decimal OutstandingAr { get; set; }
    public decimal OutstandingAp { get; set; }
    public decimal SalesThisMonth { get; set; }
    public decimal PurchasesThisMonth { get; set; }
    /// <summary>Revenue - Expenses for the current month, using the same account
    /// classification as the P&amp;L report — 0 when there isn't enough posted
    /// activity to compute it meaningfully.</summary>
    public decimal NetProfitThisMonth { get; set; }
    /// <summary>Output tax - input tax this month, from real invoice tax fields.</summary>
    public decimal TaxPayable { get; set; }
    public int JournalEntriesThisMonth { get; set; }
    public decimal IncomingPaymentsThisMonth { get; set; }
    public decimal OutgoingPaymentsThisMonth { get; set; }
}
