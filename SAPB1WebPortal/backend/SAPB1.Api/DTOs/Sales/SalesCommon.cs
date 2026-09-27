namespace SAPB1.Api.DTOs.Sales;

/// <summary>One line of a sales document (Quotation/Order/Delivery/Invoice/Credit Memo).</summary>
public class SalesDocumentLineDto
{
    public int LineNum { get; set; }
    public string ItemCode { get; set; } = string.Empty;
    public string ItemName { get; set; } = string.Empty;
    public double Quantity { get; set; }
    public double? OpenQuantity { get; set; }
    /// <summary>Populated only for Sales Orders/Deliveries, whose line tables (RDR1/DLN1) track it — null elsewhere.</summary>
    public double? DeliveredQuantity { get; set; }
    /// <summary>Populated only for Deliveries (DLN1.OrderedQty) — the quantity on the originating Sales Order line.</summary>
    public double? OrderedQuantity { get; set; }
    public string? Warehouse { get; set; }
    public decimal Price { get; set; }
    public decimal DiscountPercent { get; set; }
    public string? TaxCode { get; set; }
    public decimal LineTotal { get; set; }
}

/// <summary>
/// A document related to the one being viewed, resolved from SAP B1's own
/// BaseType/BaseEntry (this doc's source) and TargetType/TrgetEntry (what was
/// created from this doc) fields — never inferred or invented.
/// </summary>
public class RelatedDocumentDto
{
    /// <summary>"Sales Quotation" | "Sales Order" | "Delivery" | "A/R Invoice" | "A/R Credit Memo".</summary>
    public string DocumentType { get; set; } = string.Empty;
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    /// <summary>Frontend route segment for this document type, e.g. "orders", "deliveries".</summary>
    public string RouteSegment { get; set; } = string.Empty;
    /// <summary>"Base" = this document was created from it. "Target" = it was created from this document.</summary>
    public string Direction { get; set; } = string.Empty;
}
