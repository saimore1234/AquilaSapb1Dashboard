using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SAPB1.Api.Auth;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Customers;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Controllers;

[ApiController]
[Route("api/customers")]
// Role list relaxed to plain [Authorize] — the granular RequirePermission
// check below is now the real gate (the old fixed role names were never
// reachable by any actual login besides the hardcoded Admin anyway).
[Authorize]
[RequirePermission("Customers.View")]
public class CustomersController : ControllerBase
{
    private readonly ISapB1Service _sapB1Service;

    public CustomersController(ISapB1Service sapB1Service)
    {
        _sapB1Service = sapB1Service;
    }

    /// <summary>GET /api/customers?page=&amp;pageSize=&amp;search=&amp;group=&amp;active=</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<CustomerListItemDto>>>> GetAll(
        [FromQuery] PagedRequest request, [FromQuery] string? group, CancellationToken ct)
    {
        var result = await _sapB1Service.GetCustomersAsync(request, group, ct);
        return Ok(ApiResponse<PagedResult<CustomerListItemDto>>.Ok(result));
    }

    /// <summary>GET /api/customers/{cardCode}</summary>
    [HttpGet("{cardCode}")]
    public async Task<ActionResult<ApiResponse<CustomerDetailDto>>> GetByCode(string cardCode, CancellationToken ct)
    {
        var customer = await _sapB1Service.GetCustomerByCardCodeAsync(cardCode, ct);
        if (customer is null)
            return NotFound(ApiResponse<CustomerDetailDto>.Fail($"Customer '{cardCode}' was not found."));

        return Ok(ApiResponse<CustomerDetailDto>.Ok(customer));
    }
}
