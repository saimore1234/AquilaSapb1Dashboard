namespace SAPB1.Api.DTOs.Sales;

/// <summary>Incoming Payment from a customer (SAP B1: ORCT).</summary>
public class IncomingPaymentDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public DateTime PostingDate { get; set; }
    /// <summary>"Cash" | "Check" | "Bank Transfer" | "Mixed" — derived from which ORCT sum column is non-zero.</summary>
    public string PaymentType { get; set; } = string.Empty;
    public string? Currency { get; set; }
    public decimal Amount { get; set; }
    /// <summary>"Cancelled" | "Completed".</summary>
    public string Status { get; set; } = string.Empty;
}

public class ArInvoiceApplicationDto
{
    public int InvoiceDocEntry { get; set; }
    public int InvoiceDocNum { get; set; }
    public decimal AmountApplied { get; set; }
}

public class IncomingPaymentDetailDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public DateTime PostingDate { get; set; }
    public string PaymentType { get; set; } = string.Empty;
    public string? Currency { get; set; }
    public decimal Amount { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? Remarks { get; set; }

    public decimal CashAmount { get; set; }
    public decimal CheckAmount { get; set; }
    public decimal TransferAmount { get; set; }
    public string? BankAccount { get; set; }

    /// <summary>A/R invoices this payment was applied against, from SAP B1's own
    /// payment-reconciliation table — empty if the company's data doesn't
    /// record applications this way (never fabricated).</summary>
    public List<ArInvoiceApplicationDto> AppliedInvoices { get; set; } = new();
}
