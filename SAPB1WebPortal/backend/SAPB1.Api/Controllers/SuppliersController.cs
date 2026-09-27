using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SAPB1.Api.Auth;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Suppliers;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Controllers;

[ApiController]
[Route("api/suppliers")]
// Role list relaxed to plain [Authorize] — see CustomersController for why.
[Authorize]
[RequirePermission("Suppliers.View")]
public class SuppliersController : ControllerBase
{
    private readonly ISapB1Service _sapB1Service;

    public SuppliersController(ISapB1Service sapB1Service)
    {
        _sapB1Service = sapB1Service;
    }

    /// <summary>GET /api/suppliers?page=&amp;pageSize=&amp;search=&amp;group=&amp;active=</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<SupplierListItemDto>>>> GetAll(
        [FromQuery] PagedRequest request, [FromQuery] string? group, CancellationToken ct)
    {
        var result = await _sapB1Service.GetSuppliersAsync(request, group, ct);
        return Ok(ApiResponse<PagedResult<SupplierListItemDto>>.Ok(result));
    }

    /// <summary>GET /api/suppliers/{cardCode}</summary>
    [HttpGet("{cardCode}")]
    public async Task<ActionResult<ApiResponse<SupplierDetailDto>>> GetByCode(string cardCode, CancellationToken ct)
    {
        var supplier = await _sapB1Service.GetSupplierByCardCodeAsync(cardCode, ct);
        if (supplier is null)
            return NotFound(ApiResponse<SupplierDetailDto>.Fail($"Supplier '{cardCode}' was not found."));

        return Ok(ApiResponse<SupplierDetailDto>.Ok(supplier));
    }
}
