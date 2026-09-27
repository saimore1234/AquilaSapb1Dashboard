using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SAPB1.Api.Auth;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Production;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Controllers;

/// <summary>
/// Read-only Production/Manufacturing data (Bill of Materials, Production
/// Orders, material requirements/consumption, finished-goods receipts) for
/// whichever company the caller's JWT is scoped to — see
/// IProductionService/SqlProductionService. No write endpoints: this module
/// never creates, edits or deletes SAP B1 documents.
/// </summary>
[ApiController]
[Route("api/production")]
// Role list relaxed to plain [Authorize] — see CustomersController for why.
[Authorize]
[RequirePermission("Production.View")]
public class ProductionController : ControllerBase
{
    private readonly IProductionService _productionService;

    public ProductionController(IProductionService productionService)
    {
        _productionService = productionService;
    }

    [HttpGet("dashboard")]
    public async Task<ActionResult<ApiResponse<ProductionDashboardDto>>> GetDashboard(CancellationToken ct)
    {
        var result = await _productionService.GetDashboardAsync(ct);
        return Ok(ApiResponse<ProductionDashboardDto>.Ok(result));
    }

    [HttpGet("analytics")]
    public async Task<ActionResult<ApiResponse<ProductionAnalyticsDto>>> GetAnalytics(CancellationToken ct)
    {
        var result = await _productionService.GetAnalyticsAsync(ct);
        return Ok(ApiResponse<ProductionAnalyticsDto>.Ok(result));
    }

    [HttpGet("boms")]
    public async Task<ActionResult<ApiResponse<PagedResult<BomDto>>>> GetBoms([FromQuery] BomQuery query, CancellationToken ct)
    {
        var result = await _productionService.GetBomsAsync(query, ct);
        return Ok(ApiResponse<PagedResult<BomDto>>.Ok(result));
    }

    [HttpGet("boms/{code}")]
    public async Task<ActionResult<ApiResponse<BomDetailDto>>> GetBom(string code, CancellationToken ct)
    {
        var result = await _productionService.GetBomByCodeAsync(code, ct);
        if (result is null) return NotFound(ApiResponse<BomDetailDto>.Fail($"No bill of materials found for item '{code}'."));
        return Ok(ApiResponse<BomDetailDto>.Ok(result));
    }

    [HttpGet("orders")]
    public async Task<ActionResult<ApiResponse<PagedResult<ProductionOrderDto>>>> GetOrders([FromQuery] ProductionOrderQuery query, CancellationToken ct)
    {
        var result = await _productionService.GetOrdersAsync(query, ct);
        return Ok(ApiResponse<PagedResult<ProductionOrderDto>>.Ok(result));
    }

    [HttpGet("orders/{docEntry:int}")]
    public async Task<ActionResult<ApiResponse<ProductionOrderDetailDto>>> GetOrder(int docEntry, CancellationToken ct)
    {
        var result = await _productionService.GetOrderByEntryAsync(docEntry, ct);
        if (result is null) return NotFound(ApiResponse<ProductionOrderDetailDto>.Fail($"Production Order #{docEntry} was not found."));
        return Ok(ApiResponse<ProductionOrderDetailDto>.Ok(result));
    }

    [HttpGet("material-requirements")]
    public async Task<ActionResult<ApiResponse<PagedResult<MaterialRequirementDto>>>> GetMaterialRequirements([FromQuery] ProductionOrderQuery query, CancellationToken ct)
    {
        var result = await _productionService.GetMaterialRequirementsAsync(query, ct);
        return Ok(ApiResponse<PagedResult<MaterialRequirementDto>>.Ok(result));
    }

    [HttpGet("consumption")]
    public async Task<ActionResult<ApiResponse<PagedResult<MaterialConsumptionDto>>>> GetConsumption([FromQuery] ProductionOrderQuery query, CancellationToken ct)
    {
        var result = await _productionService.GetConsumptionAsync(query, ct);
        return Ok(ApiResponse<PagedResult<MaterialConsumptionDto>>.Ok(result));
    }

    [HttpGet("receipts")]
    public async Task<ActionResult<ApiResponse<PagedResult<ProductionReceiptDto>>>> GetReceipts([FromQuery] ProductionOrderQuery query, CancellationToken ct)
    {
        var result = await _productionService.GetReceiptsAsync(query, ct);
        return Ok(ApiResponse<PagedResult<ProductionReceiptDto>>.Ok(result));
    }
}
