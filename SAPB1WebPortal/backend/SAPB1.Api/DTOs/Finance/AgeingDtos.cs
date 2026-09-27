namespace SAPB1.Api.DTOs.Finance;

/// <summary>One open A/R invoice with ageing, computed against the report's
/// reporting date (today, in this company's server time) — never hardcoded.</summary>
public class ReceivableDto
{
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public DateTime InvoiceDate { get; set; }
    public DateTime? DueDate { get; set; }
    public decimal InvoiceTotal { get; set; }
    public decimal Paid { get; set; }
    public decimal Balance { get; set; }
    /// <summary>DATEDIFF(day, DueDate, reporting date) when positive; 0 when not yet due.</summary>
    public int DaysOverdue { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? Currency { get; set; }
    /// <summary>"Current" | "1-30" | "31-60" | "61-90" | "91-120" | "120+".</summary>
    public string AgeingBucket { get; set; } = string.Empty;
}

/// <summary>One open A/P invoice with ageing — same shape/logic as ReceivableDto, vendor-side.</summary>
public class PayableDto
{
    public string VendorCode { get; set; } = string.Empty;
    public string? VendorName { get; set; }
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public DateTime InvoiceDate { get; set; }
    public DateTime? DueDate { get; set; }
    public decimal InvoiceTotal { get; set; }
    public decimal Paid { get; set; }
    public decimal Balance { get; set; }
    public int DaysOverdue { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? Currency { get; set; }
    public string AgeingBucket { get; set; } = string.Empty;
}

/// <summary>Ageing bucket summary + total, shared shape for both Receivables and Payables dashboards.</summary>
public class AgeingSummaryDto
{
    public decimal Total { get; set; }
    public decimal Current { get; set; }
    public decimal Days1To30 { get; set; }
    public decimal Days31To60 { get; set; }
    public decimal Days61To90 { get; set; }
    public decimal Days91To120 { get; set; }
    public decimal Days120Plus { get; set; }
    public decimal Overdue { get; set; }
    /// <summary>Overdue / Total * 100, 0 when Total is 0.</summary>
    public double OverduePercent { get; set; }
    /// <summary>The date ageing was calculated against — always today's date on the server, shown so the number is never ambiguous.</summary>
    public DateTime ReportingDate { get; set; }
}
