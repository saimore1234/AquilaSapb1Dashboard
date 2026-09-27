namespace SAPB1.Api.DTOs.Purchase;

/// <summary>Outgoing Payment to a vendor (SAP B1: OVPM, DocType='S').</summary>
public class OutgoingPaymentDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public string VendorCode { get; set; } = string.Empty;
    public string? VendorName { get; set; }
    public DateTime PostingDate { get; set; }
    /// <summary>"Cash" | "Check" | "Bank Transfer" | "Mixed" — derived from which OVPM sum column is non-zero.</summary>
    public string PaymentType { get; set; } = string.Empty;
    public string? Currency { get; set; }
    public decimal Amount { get; set; }
    /// <summary>"Cancelled" | "Completed".</summary>
    public string Status { get; set; } = string.Empty;
}

public class ApInvoiceApplicationDto
{
    public int InvoiceDocEntry { get; set; }
    public int InvoiceDocNum { get; set; }
    public decimal AmountApplied { get; set; }
}

public class OutgoingPaymentDetailDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public string VendorCode { get; set; } = string.Empty;
    public string? VendorName { get; set; }
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

    /// <summary>A/P invoices this payment was applied against, from SAP B1's own
    /// payment-reconciliation table — empty if the company's data doesn't
    /// record applications this way (never fabricated).</summary>
    public List<ApInvoiceApplicationDto> AppliedInvoices { get; set; } = new();
}
