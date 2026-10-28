using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SAPB1.Api.Auth;
using SAPB1.Api.DTOs.Admin;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.Interfaces;
using SAPB1.Api.Services;

namespace SAPB1.Api.Controllers.Admin;

/// <summary>Role management + the role→permission matrix (Administration → Roles).</summary>
[ApiController]
[Route("api/admin/roles")]
[Authorize]
public class AdminRolesController : ControllerBase
{
    private readonly IAdminService _adminService;
    private readonly ISecurityService _security;

    public AdminRolesController(IAdminService adminService, ISecurityService security)
    {
        _security = security;
        _adminService = adminService;
    }

    [HttpGet]
    [RequirePermission("Administration.View")]
    public async Task<ActionResult<ApiResponse<List<RoleListItemDto>>>> GetAll(CancellationToken ct)
    {
        var roles = await _adminService.GetRolesAsync(ct);
        return Ok(ApiResponse<List<RoleListItemDto>>.Ok(roles));
    }

    [HttpPost]
    [RequirePermission("Administration.Create")]
    public async Task<ActionResult<ApiResponse<object>>> Create([FromBody] CreateRoleDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest(ApiResponse<object>.Fail("Role name is required."));

        var id = await _adminService.CreateRoleAsync(dto, ct);
        await _security.AuditAsync("RoleCreated", null, dto.Name);
        return Ok(ApiResponse<object>.Ok(new { id }, "Role created."));
    }

    [HttpPut("{id:int}")]
    [RequirePermission("Administration.Edit")]
    public async Task<ActionResult<ApiResponse<object>>> Update(int id, [FromBody] CreateRoleDto dto, CancellationToken ct)
    {
        var ok = await _adminService.UpdateRoleAsync(id, dto, ct);
        if (!ok) return BadRequest(ApiResponse<object>.Fail("Role not found, or it is a built-in role that cannot be renamed."));
        await _security.AuditAsync("RoleUpdated", null, $"role #{id}", dto.Name);
        return Ok(ApiResponse<object>.Ok(new { }, "Role updated."));
    }

    [HttpGet("{id:int}/permissions")]
    [RequirePermission("Administration.View")]
    public async Task<ActionResult<ApiResponse<RolePermissionsDto>>> GetPermissions(int id, CancellationToken ct)
    {
        var result = await _adminService.GetRolePermissionsAsync(id, ct);
        if (result is null) return NotFound(ApiResponse<RolePermissionsDto>.Fail("Role not found."));
        return Ok(ApiResponse<RolePermissionsDto>.Ok(result));
    }

    [HttpPut("{id:int}/permissions")]
    [RequirePermission("Administration.Edit")]
    public async Task<ActionResult<ApiResponse<object>>> UpdatePermissions(int id, [FromBody] UpdateRolePermissionsDto dto, CancellationToken ct)
    {
        bool ok;
        try
        {
            ok = await _adminService.UpdateRolePermissionsAsync(id, dto.PermissionKeys, dto.PagePermissions, ct);
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(503, ApiResponse<object>.Fail(ex.Message));
        }
        if (!ok) return BadRequest(ApiResponse<object>.Fail("Role not found, or it is the built-in Administrator role, which always has every permission."));
        await _security.AuditAsync("RolePermissionsChanged", null, $"role #{id}", $"{dto.PermissionKeys?.Count ?? 0} module permission(s), {dto.PagePermissions?.Count ?? 0} page rule(s)");
        return Ok(ApiResponse<object>.Ok(new { }, "Permissions saved."));
    }
}
