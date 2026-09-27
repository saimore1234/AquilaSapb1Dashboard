using SAPB1.Api.DTOs.Common;

namespace SAPB1.Api.DTOs.Purchase;

/// <summary>
/// Query parameters shared by every Purchase list endpoint, e.g.
/// GET /api/purchase/orders?page=1&amp;pageSize=20&amp;search=ABC&amp;dateFrom=2026-01-01&amp;status=Open&amp;vendor=V001
/// Extends the same PagedRequest used by Customers/Suppliers/Items/Inventory.
/// </summary>
public class PurchaseDocumentQuery : PagedRequest
{
    public DateTime? DateFrom { get; set; }
    public DateTime? DateTo { get; set; }

    /// <summary>"Open" or "Closed" — maps to SAP B1's DocStatus ('O'/'C').</summary>
    public string? Status { get; set; }

    /// <summary>Vendor CardCode.</summary>
    public string? Vendor { get; set; }

    public string? Warehouse { get; set; }

    /// <summary>Buyer/sales-employee code (SlpCode on the document header).</summary>
    public string? Buyer { get; set; }
}
