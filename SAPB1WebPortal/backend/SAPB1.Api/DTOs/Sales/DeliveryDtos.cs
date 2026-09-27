namespace SAPB1.Api.DTOs.Sales;

/// <summary>Delivery (SAP B1: ODLN/DLN1).</summary>
public class DeliveryDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public DateTime PostingDate { get; set; }
    public DateTime? DueDate { get; set; }
    public string? SalesEmployee { get; set; }
    /// <summary>Warehouse of the delivery's first line — deliveries can technically span
    /// multiple warehouses, but the vast majority ship from one; see line-level Warehouse for detail.</summary>
    public string? Warehouse { get; set; }
    public string Status { get; set; } = string.Empty;
    public decimal Total { get; set; }
    public string? Currency { get; set; }
}

public class DeliveryDetailDto
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

    public List<SalesDocumentLineDto> Lines { get; set; } = new();
    public List<RelatedDocumentDto> RelatedDocuments { get; set; } = new();
}
