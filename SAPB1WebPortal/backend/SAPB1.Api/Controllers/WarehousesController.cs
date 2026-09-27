using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SAPB1.Api.Auth;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Inventory;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Controllers;

/// <summary>Read-only warehouse list (OWHS) for the current company — powers warehouse pickers.</summary>
[ApiController]
[Route("api/warehouses")]
// Role list relaxed to plain [Authorize] — see CustomersController for why.
[Authorize]
[RequirePermission("Warehouses.View")]
public class WarehousesController : ControllerBase
{
    private readonly ISapB1Service _sapB1Service;

    public WarehousesController(ISapB1Service sapB1Service)
    {
        _sapB1Service = sapB1Service;
    }

    [HttpGet]
    public async Task<ActionResult<ApiResponse<List<WarehouseDto>>>> GetAll(CancellationToken ct)
    {
        var result = await _sapB1Service.GetWarehousesAsync(ct);
        return Ok(ApiResponse<List<WarehouseDto>>.Ok(result));
    }
}
