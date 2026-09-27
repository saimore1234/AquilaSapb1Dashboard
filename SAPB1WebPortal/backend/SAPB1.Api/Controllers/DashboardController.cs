using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SAPB1.Api.Auth;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Dashboard;
using SAPB1.Api.Interfaces;
using SAPB1.Api.Models;

namespace SAPB1.Api.Controllers;

[ApiController]
[Route("api/dashboard")]
// Role list relaxed to plain [Authorize] — see CustomersController for why.
[Authorize]
[RequirePermission("Dashboard.View")]
public class DashboardController : ControllerBase
{
    private readonly ISapB1Service _sapB1Service;

    public DashboardController(ISapB1Service sapB1Service)
    {
        _sapB1Service = sapB1Service;
    }

    /// <summary>GET /api/dashboard — summary cards for the ERP dashboard.</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<DashboardSummaryDto>>> Get(CancellationToken ct)
    {
        var summary = await _sapB1Service.GetDashboardSummaryAsync(ct);
        return Ok(ApiResponse<DashboardSummaryDto>.Ok(summary));
    }
}
