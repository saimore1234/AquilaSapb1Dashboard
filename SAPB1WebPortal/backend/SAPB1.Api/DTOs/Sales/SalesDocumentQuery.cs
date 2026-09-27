using SAPB1.Api.DTOs.Common;

namespace SAPB1.Api.DTOs.Sales;

/// <summary>
/// Query parameters shared by every Sales list endpoint, e.g.
/// GET /api/sales/orders?page=1&amp;pageSize=20&amp;search=ABC&amp;dateFrom=2026-01-01&amp;status=Open&amp;customer=C001
/// Extends the same PagedRequest used by Customers/Suppliers/Items/Inventory/Purchase.
/// </summary>
public class SalesDocumentQuery : PagedRequest
{
    public DateTime? DateFrom { get; set; }
    public DateTime? DateTo { get; set; }

    /// <summary>"Open" or "Closed" — maps to SAP B1's DocStatus ('O'/'C').</summary>
    public string? Status { get; set; }

    /// <summary>Customer CardCode.</summary>
    public string? Customer { get; set; }

    public string? Warehouse { get; set; }

    /// <summary>Sales employee code (SlpCode on the document header).</summary>
    public string? SalesEmployee { get; set; }
}
