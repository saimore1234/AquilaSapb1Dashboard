using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SAPB1.Api.Auth;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Items;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Controllers;

[ApiController]
[Route("api/items")]
// Role list relaxed to plain [Authorize] — see CustomersController for why.
[Authorize]
[RequirePermission("Items.View")]
public class ItemsController : ControllerBase
{
    private readonly ISapB1Service _sapB1Service;

    public ItemsController(ISapB1Service sapB1Service)
    {
        _sapB1Service = sapB1Service;
    }

    /// <summary>GET /api/items?page=&amp;pageSize=&amp;search=&amp;group=&amp;active=</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<ItemListItemDto>>>> GetAll(
        [FromQuery] PagedRequest request, [FromQuery] string? group, CancellationToken ct)
    {
        var result = await _sapB1Service.GetItemsAsync(request, group, ct);
        return Ok(ApiResponse<PagedResult<ItemListItemDto>>.Ok(result));
    }

    /// <summary>GET /api/items/{itemCode}</summary>
    [HttpGet("{itemCode}")]
    public async Task<ActionResult<ApiResponse<ItemDetailDto>>> GetByCode(string itemCode, CancellationToken ct)
    {
        var item = await _sapB1Service.GetItemByCodeAsync(itemCode, ct);
        if (item is null)
            return NotFound(ApiResponse<ItemDetailDto>.Fail($"Item '{itemCode}' was not found."));

        return Ok(ApiResponse<ItemDetailDto>.Ok(item));
    }
}
