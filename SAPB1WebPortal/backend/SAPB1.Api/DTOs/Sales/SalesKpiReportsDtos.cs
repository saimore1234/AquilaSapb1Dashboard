namespace SAPB1.Api.DTOs.Sales;

// ------------------------------------------------------------------ Documents behind a dashboard KPI card
public class KpiDocumentRowDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public DateTime PostingDate { get; set; }
    public DateTime? DueDate { get; set; }
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public string? Salesperson { get; set; }
    public string? Branch { get; set; }
    public decimal DocTotal { get; set; }
    /// <summary>Invoices: unpaid balance (DocTotal - PaidToDate); other documents: the document total.</summary>
    public decimal OpenAmount { get; set; }
}

public class KpiDocumentTotalsDto
{
    public int Documents { get; set; }
    public decimal DocTotal { get; set; }
    public decimal OpenAmount { get; set; }
}

public class KpiDocumentReportDto
{
    public string Kind { get; set; } = string.Empty;
    /// <summary>Set when the KPI cannot be broken down by a selected filter (e.g. incoming payments carry no unit).</summary>
    public string? Note { get; set; }
    public KpiDocumentTotalsDto Totals { get; set; } = new();
    public int TotalCount { get; set; }
    public List<KpiDocumentRowDto> Rows { get; set; } = new();
}

// ------------------------------------------------------------------ Payment Due Register
public class PaymentDueQuery
{
    /// <summary>Free text over customer code and name.</summary>
    public string? Customer { get; set; }
    /// <summary>Exact customer code (drill-down from the customer-wise tab).</summary>
    public string? CustomerCode { get; set; }
    public int? InvoiceNo { get; set; }
    /// <summary>OCTG.GroupNum.</summary>
    public int? PaymentTerms { get; set; }
    public int? Salesperson { get; set; }
    /// <summary>OBPL.BPLId.</summary>
    public int? Branch { get; set; }
    public DateTime? DueFrom { get; set; }
    public DateTime? DueTo { get; set; }
    /// <summary>paid | unpaid | partial | overdue | duetoday | notdue | due7 | due15 | due30 (the last three are cumulative: due from today through N days ahead).</summary>
    public string? Status { get; set; }
    /// <summary>Only invoices at least this many days past due.</summary>
    public int? MinDaysOverdue { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 25;
}

public class PaymentDueRowDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public DateTime PostingDate { get; set; }
    public DateTime DueDate { get; set; }
    public string? PaymentTerms { get; set; }
    public decimal InvoiceAmount { get; set; }
    public decimal PaidAmount { get; set; }
    public decimal OutstandingAmount { get; set; }
    /// <summary>Business today minus the invoice DUE date while the balance is positive; 0 when due today, in the future, or fully paid.</summary>
    public int DaysOverdue { get; set; }
    /// <summary>Paid (no balance) | Overdue (due before today) | Due Today | Upcoming (due after today).</summary>
    public string PaymentStatus { get; set; } = string.Empty;
    public string? Salesperson { get; set; }
    public string? Branch { get; set; }
}

public class PaymentDueTotalsDto
{
    public int Invoices { get; set; }
    public decimal InvoiceAmount { get; set; }
    public decimal PaidAmount { get; set; }
    public decimal Outstanding { get; set; }
    public decimal Overdue { get; set; }
    public int OverdueInvoices { get; set; }
    public decimal DueToday { get; set; }
    public int DueTodayInvoices { get; set; }
    /// <summary>Cumulative: due from today through today + 7 / 15 / 30 days (so each includes Due Today and the shorter windows).</summary>
    public decimal DueWithin7 { get; set; }
    public int DueWithin7Invoices { get; set; }
    public decimal DueWithin15 { get; set; }
    public int DueWithin15Invoices { get; set; }
    public decimal DueWithin30 { get; set; }
    public int DueWithin30Invoices { get; set; }
    /// <summary>Ledger (OCRD.Balance) balance of the customers in this selection. It nets credit memos and payments on account that are not applied to an invoice, so it is usually lower than Outstanding.</summary>
    public decimal CustomerAccountBalance { get; set; }
}

/// <summary>Count and amounts of exactly the invoices the list shows (filters + the selected status).</summary>
public class PaymentDueSelectionDto
{
    public int Invoices { get; set; }
    public decimal InvoiceAmount { get; set; }
    public decimal PaidAmount { get; set; }
    public decimal Outstanding { get; set; }
}

public class PaymentDueBreakdownDto
{
    public string Key { get; set; } = string.Empty;
    public string? Name { get; set; }
    public int Invoices { get; set; }
    public decimal Outstanding { get; set; }
    public decimal Overdue { get; set; }
}

public class PaymentDueReportDto
{
    public DateTime AsOf { get; set; }
    /// <summary>The six KPI amounts: all filters except the status selection.</summary>
    public PaymentDueTotalsDto Totals { get; set; } = new();
    public PaymentDueSelectionDto Selection { get; set; } = new();
    public List<PaymentDueBreakdownDto> ByCustomer { get; set; } = new();
    public List<PaymentDueBreakdownDto> ByTerms { get; set; } = new();
    public int TotalCount { get; set; }
    public List<PaymentDueRowDto> Rows { get; set; } = new();
}
