namespace SAPB1.Api.DTOs.Purchase;

/// <summary>A/P Credit Memo (SAP B1: ORPC / RPC1).</summary>
public class ApCreditMemoDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public string VendorCode { get; set; } = string.Empty;
    public string? VendorName { get; set; }
    public DateTime PostingDate { get; set; }
    public string Status { get; set; } = string.Empty;
    public decimal Total { get; set; }
    public string? Currency { get; set; }
}

public class ApCreditMemoDetailDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public string VendorCode { get; set; } = string.Empty;
    public string? VendorName { get; set; }
    public DateTime PostingDate { get; set; }
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
