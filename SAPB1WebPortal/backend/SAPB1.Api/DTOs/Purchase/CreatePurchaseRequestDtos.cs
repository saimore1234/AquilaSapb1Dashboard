namespace SAPB1.Api.DTOs.Purchase;

/// <summary>
/// Request body for POST /api/purchase/requests. Fields were verified against
/// STEST's live SAP B1 Service Layer $metadata and UserFieldsMD before this DTO
/// was written (see plan notes) — in particular:
///  - The portal's "Requester" free-text name is sent to Service Layer's
///    RequesterName field, never the Requester field (that one is validated by
///    SAP against a real SAP B1 user code, which the portal login is not).
///  - Every line requires CapitalOrRevenue: STEST has a mandatory custom field
///    (U_CapRev, "Capital/Revenue") on Purchase Request lines with no default —
///    SAP rejects the document without it. This was not in the original request
///    shape and was discovered live; it is NOT optional here.
/// </summary>
public class CreatePurchaseRequestDto
{
    public string? Requester { get; set; }
    public DateTime RequiredDate { get; set; }
    public string? Remarks { get; set; }
    public List<CreatePurchaseRequestLineDto> Lines { get; set; } = new();
}

public class CreatePurchaseRequestLineDto
{
    public string ItemCode { get; set; } = string.Empty;
    public double Quantity { get; set; }
    public string WarehouseCode { get; set; } = string.Empty;
    public DateTime? RequiredDate { get; set; }
    public string? Remarks { get; set; }

    /// <summary>SAP B1's mandatory "Capital/Revenue" line classification (custom field U_CapRev) for this company. Must be exactly "Revenue" or "Capital" — SAP rejects anything else.</summary>
    public string CapitalOrRevenue { get; set; } = "Revenue";
}

public class CreatePurchaseRequestResultDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public string Status { get; set; } = "Created";
    public string Company { get; set; } = string.Empty;
}
