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

    public List<SalesDocumentLineDto> Lines { get; set; } = new();
    public List<RelatedDocumentDto> RelatedDocuments { get; set; } = new();
}
