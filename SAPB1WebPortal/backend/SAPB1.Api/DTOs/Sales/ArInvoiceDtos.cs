namespace SAPB1.Api.DTOs.Sales;

public class ArInvoiceDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public DateTime PostingDate { get; set; }
    public DateTime? DueDate { get; set; }
    public string? SalesEmployee { get; set; }
    public string Status { get; set; } = string.Empty;
    public decimal Total { get; set; }
    public decimal Paid { get; set; }
    public decimal Balance { get; set; }
    public string? Currency { get; set; }
    public string? LrNo { get; set; }
    public DateTime? LrDate { get; set; }
    public string? Transporter { get; set; }
    public DateTime? OrderDate { get; set; }
    /// <summary>Days from the (first linked) sales order date to the invoice date; null when the invoice has no sales order.</summary>
    public int? DaysOrderToInvoice { get; set; }
}

public class ArInvoiceDetailDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public DateTime PostingDate { get; set; }
    public DateTime? DueDate { get; set; }
    public string? SalesEmployee { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? Remarks { get; set; }
    public string? Currency { get; set; }

    public decimal Subtotal { get; set; }
    public decimal Discount { get; set; }
    public decimal Tax { get; set; }
    public decimal GrandTotal { get; set; }
    public decimal Paid { get; set; }
    public decimal Balance { get; set; }

    public string? CustomerReference { get; set; }
    public DateTime? DocumentDate { get; set; }
    public string? PaymentTerms { get; set; }
    public string? Branch { get; set; }
    /// <summary>Cancelled | Paid | Partially paid | Unpaid.</summary>
    public string PaymentStatus { get; set; } = string.Empty;
    /// <summary>Settled by something other than a listed incoming payment or credit note (e.g. an internal reconciliation); keeps Paid = payments + credits + this.</summary>
    public decimal OtherSettlements { get; set; }
    public List<InvoicePaymentDto> AppliedPayments { get; set; } = new();
    public List<InvoiceCreditNoteDto> CreditNotes { get; set; } = new();

    public List<SalesDocumentLineDto> Lines { get; set; } = new();
    public List<RelatedDocumentDto> RelatedDocuments { get; set; } = new();
}

public class InvoicePaymentDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public DateTime PaymentDate { get; set; }
    /// <summary>Amount of this incoming payment applied to the invoice (ORCT/RCT2).</summary>
    public decimal AmountApplied { get; set; }
}

public class InvoiceCreditNoteDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public DateTime PostingDate { get; set; }
    public decimal Total { get; set; }
}
