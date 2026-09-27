namespace SAPB1.Api.DTOs.Purchase;

public class PurchaseRequestDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public string? Requester { get; set; }
    public DateTime PostingDate { get; set; }
    public DateTime? RequiredDate { get; set; }
    public string Status { get; set; } = string.Empty;
    public decimal Total { get; set; }
    public string? Currency { get; set; }
}

public class PurchaseRequestDetailDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public string? Requester { get; set; }
    public DateTime PostingDate { get; set; }
    public DateTime? RequiredDate { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? Remarks { get; set; }
    public string? Currency { get; set; }

    public decimal Subtotal { get; set; }
    public decimal Discount { get; set; }
    public decimal Tax { get; set; }
    public decimal GrandTotal { get; set; }

    public List<PurchaseDocumentLineDto> Lines { get; set; } = new();
    public List<RelatedDocumentDto> RelatedDocuments { get; set; } = new();
}
