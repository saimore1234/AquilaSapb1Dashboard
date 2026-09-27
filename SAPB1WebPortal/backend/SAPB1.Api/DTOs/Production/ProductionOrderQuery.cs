using SAPB1.Api.DTOs.Common;

namespace SAPB1.Api.DTOs.Production;

/// <summary>
/// Query parameters for GET /api/production/orders and the material
/// requirements/consumption list endpoints, which all filter over the same
/// production order header fields. Extends the same PagedRequest used
/// throughout this project.
/// </summary>
public class ProductionOrderQuery : PagedRequest
{
    public DateTime? DateFrom { get; set; }
    public DateTime? DateTo { get; set; }

    /// <summary>"Planned" | "Released" | "Closed" | "Cancelled" — maps to OWOR.Status.</summary>
    public string? Status { get; set; }

    /// <summary>Finished-good item code (OWOR.ItemCode).</summary>
    public string? Item { get; set; }

    public string? Warehouse { get; set; }
}

/// <summary>Query parameters for GET /api/production/boms.</summary>
public class BomQuery : PagedRequest
{
    /// <summary>"Production" | "Sales" | "Template" — maps to OITT.TreeType.</summary>
    public string? Type { get; set; }
}
