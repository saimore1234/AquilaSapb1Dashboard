using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SAPB1.Api.Auth;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Reports;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Controllers;

/// <summary>
/// Backs the Reports Center's genuinely new reports — see
/// IReportsService/SqlReportsService and ReportsDtos.cs for why most of the
/// Reports Center's ~200-report catalog is a frontend registry over the
/// existing Sales/Purchase/Production/Finance/Inventory APIs rather than new
/// endpoints here. No write endpoints — read-only, same as every other module.
/// </summary>
[ApiController]
[Route("api/reports")]
// Role list relaxed to plain [Authorize] — see CustomersController for why.
[Authorize]
[RequirePermission("Reports.View")]
public class ReportsController : ControllerBase
{
    private readonly IReportsService _reportsService;

    public ReportsController(IReportsService reportsService)
    {
        _reportsService = reportsService;
    }

    [HttpGet("management-summary")]
    public async Task<ActionResult<ApiResponse<ManagementSummaryDto>>> GetManagementSummary(CancellationToken ct)
    {
        var result = await _reportsService.GetManagementSummaryAsync(ct);
        return Ok(ApiResponse<ManagementSummaryDto>.Ok(result));
    }

    [HttpGet("stock-ageing")]
    public async Task<ActionResult<ApiResponse<PagedResult<StockAgeingRowDto>>>> GetStockAgeing([FromQuery] StockAgeingQuery query, CancellationToken ct)
    {
        var result = await _reportsService.GetStockAgeingAsync(query, ct);
        return Ok(ApiResponse<PagedResult<StockAgeingRowDto>>.Ok(result));
    }

    [HttpGet("inventory-movement")]
    public async Task<ActionResult<ApiResponse<PagedResult<InventoryMovementDto>>>> GetInventoryMovement([FromQuery] InventoryMovementQuery query, CancellationToken ct)
    {
        var result = await _reportsService.GetInventoryMovementAsync(query, ct);
        return Ok(ApiResponse<PagedResult<InventoryMovementDto>>.Ok(result));
    }
}
