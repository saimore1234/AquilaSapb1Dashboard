using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SAPB1.Api.Auth;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Inventory;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Controllers;

[ApiController]
[Route("api/inventory")]
// Role list relaxed to plain [Authorize] — see CustomersController for why.
[Authorize]
[RequirePermission("Inventory.View")]
public class InventoryController : ControllerBase
{
    private readonly ISapB1Service _sapB1Service;

    public InventoryController(ISapB1Service sapB1Service)
    {
        _sapB1Service = sapB1Service;
    }

    /// <summary>GET /api/inventory?page=&amp;pageSize=&amp;warehouse=&amp;itemGroup=&amp;status=</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<InventoryListItemDto>>>> GetAll(
        [FromQuery] PagedRequest request, [FromQuery] string? warehouse,
        [FromQuery] string? itemGroup, [FromQuery] string? status, CancellationToken ct)
    {
        var result = await _sapB1Service.GetInventoryAsync(request, warehouse, itemGroup, status, ct);
        return Ok(ApiResponse<PagedResult<InventoryListItemDto>>.Ok(result));
    }

    /// <summary>GET /api/inventory/item/{itemCode} — stock for one item across all warehouses.</summary>
    [HttpGet("item/{itemCode}")]
    public async Task<ActionResult<ApiResponse<List<InventoryListItemDto>>>> GetByItem(string itemCode, CancellationToken ct)
    {
        var result = await _sapB1Service.GetInventoryByItemAsync(itemCode, ct);
        return Ok(ApiResponse<List<InventoryListItemDto>>.Ok(result));
    }

    /// <summary>GET /api/inventory/warehouse/{warehouseCode} — summary for one warehouse.</summary>
    [HttpGet("warehouse/{warehouseCode}")]
    public async Task<ActionResult<ApiResponse<WarehouseStockSummaryDto>>> GetByWarehouse(string warehouseCode, CancellationToken ct)
    {
        var result = await _sapB1Service.GetInventoryByWarehouseAsync(warehouseCode, ct);
        if (result is null)
            return NotFound(ApiResponse<WarehouseStockSummaryDto>.Fail($"Warehouse '{warehouseCode}' was not found."));

        return Ok(ApiResponse<WarehouseStockSummaryDto>.Ok(result));
    }
}
