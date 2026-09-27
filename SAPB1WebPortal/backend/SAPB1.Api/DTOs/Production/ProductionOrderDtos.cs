namespace SAPB1.Api.DTOs.Production;

public class ProductionOrderDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public string ItemCode { get; set; } = string.Empty;
    public string? ItemName { get; set; }
    public DateTime PostingDate { get; set; }
    public DateTime? DueDate { get; set; }
    public double PlannedQty { get; set; }
    public double CompletedQty { get; set; }
    public double RemainingQty { get; set; }
    public string? Warehouse { get; set; }
    public string Status { get; set; } = string.Empty;
    public string OrderType { get; set; } = string.Empty;
    public int? Priority { get; set; }
    /// <summary>e.g. "Sales Order #1234" when OWOR.OriginType matches a document
    /// type this portal already resolves elsewhere (Sales Order=17, Purchase
    /// Order=22) — otherwise just the raw origin document number, never invented.</summary>
    public string? Origin { get; set; }
}

public class ProductionOrderDetailDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public string ItemCode { get; set; } = string.Empty;
    public string? ItemName { get; set; }
    public DateTime PostingDate { get; set; }
    public DateTime? DueDate { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? ReleaseDate { get; set; }
    public DateTime? CloseDate { get; set; }
    public double PlannedQty { get; set; }
    public double CompletedQty { get; set; }
    public double RejectedQty { get; set; }
    public double RemainingQty { get; set; }
    public string? Warehouse { get; set; }
    public string Status { get; set; } = string.Empty;
    public string OrderType { get; set; } = string.Empty;
    public int? Priority { get; set; }
    public string? Remarks { get; set; }
    public string? Origin { get; set; }

    /// <summary>True when OITT has a BOM for this order's finished-good item code — drives the document-flow "BOM" step.</summary>
    public bool HasBom { get; set; }

    public List<ProductionComponentDto> Components { get; set; } = new();

    /// <summary>Real finished-goods receipts against this order (OINM), never invented.</summary>
    public List<ProductionReceiptEventDto> Receipts { get; set; } = new();
}
