namespace SAPB1.Api.DTOs.Purchase;

/// <summary>A/P Invoice (SAP B1: OPCH / PCH1).</summary>
public class ApInvoiceDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public string VendorCode { get; set; } = string.Empty;
    public string? VendorName { get; set; }
    public DateTime PostingDate { get; set; }
    public DateTime? DueDate { get; set; }
    public string Status { get; set; } = string.Empty;
    public decimal Total { get; set; }
    public decimal Paid { get; set; }
    public decimal Balance { get; set; }
    public string? Currency { get; set; }
}

public class ApInvoiceDetailDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public string VendorCode { get; set; } = string.Empty;
    public string? VendorName { get; set; }
    public DateTime PostingDate { get; set; }
    public DateTime? DueDate { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? Remarks { get; set; }
    public string? Currency { get; set; }

    public decimal Subtotal { get; set; }
    public decimal Discount { get; set; }
    public decimal Tax { get; set; }
    public decimal GrandTotal { get; set; }
    public decimal Paid { get; set; }
    public decimal Balance { get; set; }

    public List<PurchaseDocumentLineDto> Lines { get; set; } = new();
    public List<RelatedDocumentDto> RelatedDocuments { get; set; } = new();
}
