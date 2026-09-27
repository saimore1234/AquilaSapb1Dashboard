using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SAPB1.Api.Auth;
using SAPB1.Api.DTOs.Admin;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Controllers.Admin;

/// <summary>Read-only permission catalog (Administration → Permissions) — powers the
/// role permission matrix UI's row/column headers.</summary>
[ApiController]
[Route("api/admin/permissions")]
[Authorize]
public class AdminPermissionsController : ControllerBase
{
    private readonly IAdminService _adminService;

    public AdminPermissionsController(IAdminService adminService)
    {
        _adminService = adminService;
    }

    [HttpGet]
    [RequirePermission("Administration.View")]
    public async Task<ActionResult<ApiResponse<List<PermissionDto>>>> GetAll(CancellationToken ct)
    {
        var permissions = await _adminService.GetPermissionsAsync(ct);
        return Ok(ApiResponse<List<PermissionDto>>.Ok(permissions));
    }
}
