using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SAPB1.Api.Auth;
using SAPB1.Api.DTOs.Admin;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.Interfaces;
using SAPB1.Api.Models;
using SAPB1.Api.Services;

namespace SAPB1.Api.Controllers.Admin;

/// <summary>
/// "Copy access": give one role the permissions of another, duplicate a role, or give a user the same access as another user.
/// Allowed only for the portal Admin and the usernames listed in Security:AccessCopyUsers (appsettings) — decided on the server from the signed token,
/// so hiding the buttons in the browser is not what protects it. Passwords are never copied. Every copy is written to the audit log.
/// </summary>
[ApiController]
[Route("api/admin/access-copy")]
[Authorize]
public class AdminAccessCopyController : ControllerBase
{
    private const string AdministratorRole = "Administrator";
    private readonly IAdminService _admin;
    private readonly ISecurityService _security;
    private readonly ICompanyContext _company;
    private readonly IConfiguration _config;

    public AdminAccessCopyController(IAdminService admin, ISecurityService security, ICompanyContext company, IConfiguration config)
    {
        _admin = admin; _security = security; _company = company; _config = config;
    }

    /// <summary>Used by /auth/me and by every action here.</summary>
    public static bool IsAllowed(ClaimsPrincipal user, IConfiguration config)
    {
        if (user.IsInRole(Roles.Admin)) return true;
        var name = (user.Identity?.Name ?? "").Trim();
        var allowed = config.GetSection("Security:AccessCopyUsers").Get<string[]>() ?? Array.Empty<string>();
        return name.Length > 0 && allowed.Any(a => string.Equals(a.Trim(), name, StringComparison.OrdinalIgnoreCase));
    }

    private ObjectResult? Guard() =>
        IsAllowed(User, _config) ? null : StatusCode(403, ApiResponse<object>.Fail("Copying access is limited to the administrator and the users named for it."));

    public sealed class DuplicateRoleDto { public string Name { get; set; } = ""; public string? Description { get; set; } }
    public sealed class CopyUserAccessDto { public bool CopySalespersonLinks { get; set; } = true; }

    /// <summary>Replaces the target role's permissions with those of the source role.</summary>
    [HttpPost("roles/{targetId:int}/from/{sourceId:int}")]
    [RequirePermission("Administration.Edit")]
    public async Task<ActionResult<ApiResponse<object>>> CopyRolePermissions(int targetId, int sourceId, CancellationToken ct)
    {
        if (Guard() is { } denied) return denied;
        if (targetId == sourceId) return BadRequest(ApiResponse<object>.Fail("Choose a different role to copy from."));

        var roles = await _admin.GetRolesAsync(ct);
        var target = roles.FirstOrDefault(r => r.Id == targetId);
        var source = roles.FirstOrDefault(r => r.Id == sourceId);
        if (target is null || source is null) return NotFound(ApiResponse<object>.Fail("Role not found."));
        if (target.Name == AdministratorRole) return BadRequest(ApiResponse<object>.Fail("The Administrator role always has every permission and cannot be changed."));

        var perms = await _admin.GetRolePermissionsAsync(sourceId, ct);
        if (perms is null) return NotFound(ApiResponse<object>.Fail("Role not found."));

        bool ok;
        try { ok = await _admin.UpdateRolePermissionsAsync(targetId, perms.PermissionKeys, perms.PagePermissions, ct); }
        catch (InvalidOperationException ex) { return StatusCode(503, ApiResponse<object>.Fail(ex.Message)); }
        if (!ok) return BadRequest(ApiResponse<object>.Fail("The permissions could not be copied."));

        await _security.AuditAsync("RolePermissionsCopied", null, target.Name, $"copied from role '{source.Name}'");
        return Ok(ApiResponse<object>.Ok(new { }, $"'{target.Name}' now has the same permissions as '{source.Name}'."));
    }

    /// <summary>Creates a new role with the same permissions as an existing one.</summary>
    [HttpPost("roles/{sourceId:int}/duplicate")]
    [RequirePermission("Administration.Create")]
    public async Task<ActionResult<ApiResponse<object>>> DuplicateRole(int sourceId, [FromBody] DuplicateRoleDto dto, CancellationToken ct)
    {
        if (Guard() is { } denied) return denied;
        var name = (dto.Name ?? "").Trim();
        if (name.Length == 0) return BadRequest(ApiResponse<object>.Fail("Give the new role a name."));

        var roles = await _admin.GetRolesAsync(ct);
        var source = roles.FirstOrDefault(r => r.Id == sourceId);
        if (source is null) return NotFound(ApiResponse<object>.Fail("Role not found."));
        if (roles.Any(r => string.Equals(r.Name, name, StringComparison.OrdinalIgnoreCase))) return BadRequest(ApiResponse<object>.Fail($"A role named '{name}' already exists."));
        if (source.Name == AdministratorRole) return BadRequest(ApiResponse<object>.Fail("The Administrator role cannot be duplicated."));

        var perms = await _admin.GetRolePermissionsAsync(sourceId, ct);
        if (perms is null) return NotFound(ApiResponse<object>.Fail("Role not found."));

        var id = await _admin.CreateRoleAsync(new CreateRoleDto { Name = name, Description = dto.Description ?? $"Copy of {source.Name}" }, ct);
        try { await _admin.UpdateRolePermissionsAsync(id, perms.PermissionKeys, perms.PagePermissions, ct); }
        catch (InvalidOperationException ex) { return StatusCode(503, ApiResponse<object>.Fail(ex.Message)); }

        await _security.AuditAsync("RoleDuplicated", null, name, $"copy of role '{source.Name}'");
        return Ok(ApiResponse<object>.Ok(new { id }, $"Role '{name}' created with the permissions of '{source.Name}'."));
    }

    /// <summary>Gives the target user the same role (and, optionally, the same SAP salesperson links) as the source user. Passwords are not copied.</summary>
    [HttpPost("users/{targetId:int}/from/{sourceId:int}")]
    [RequirePermission("Administration.Edit")]
    public async Task<ActionResult<ApiResponse<object>>> CopyUserAccess(int targetId, int sourceId, [FromBody] CopyUserAccessDto? dto, CancellationToken ct)
    {
        if (Guard() is { } denied) return denied;
        if (targetId == sourceId) return BadRequest(ApiResponse<object>.Fail("Choose a different user to copy from."));

        var users = await _admin.GetUsersAsync(ct);
        var target = users.FirstOrDefault(u => u.Id == targetId);
        var source = users.FirstOrDefault(u => u.Id == sourceId);
        if (target is null || source is null) return NotFound(ApiResponse<object>.Fail("User not found."));

        var roles = await _admin.GetRolesAsync(ct);
        var role = roles.FirstOrDefault(r => string.Equals(r.Name, source.RoleName, StringComparison.OrdinalIgnoreCase));
        if (role is null) return BadRequest(ApiResponse<object>.Fail($"{source.Username} has no role to copy."));

        // Only the portal Admin may hand out the Administrator role, and nobody else may change their own access.
        var isSuper = User.IsInRole(Roles.Admin);
        if (!isSuper && role.Name == AdministratorRole) return StatusCode(403, ApiResponse<object>.Fail("Only the portal administrator can give the Administrator role."));
        var me = (User.Identity?.Name ?? "").Trim();
        if (!isSuper && string.Equals(target.Username.Trim(), me, StringComparison.OrdinalIgnoreCase)) return StatusCode(403, ApiResponse<object>.Fail("You cannot change your own access."));

        var ok = await _admin.UpdateUserAsync(targetId, new UpdateUserDto { DisplayName = target.DisplayName, IsActive = target.IsActive, RoleId = role.Id }, ct);
        if (!ok) return NotFound(ApiResponse<object>.Fail("User not found."));

        var linkNote = "";
        if (dto?.CopySalespersonLinks ?? true)
        {
            var links = await _admin.GetSalespersonLinksAsync(_company.CompanyCode, ct);
            var codes = links.TryGetValue(sourceId, out var c) ? c : new List<int>();
            await _admin.SetSalespersonLinksAsync(targetId, _company.CompanyCode, codes, User.Identity?.Name ?? "admin", ct);
            linkNote = $", salesperson links: {(codes.Count == 0 ? "none" : string.Join(",", codes))}";
        }

        await _security.AuditAsync("UserAccessCopied", null, target.Username.Trim(), $"same role as '{source.Username.Trim()}' ({role.Name}){linkNote}");
        return Ok(ApiResponse<object>.Ok(new { }, $"{target.Username.Trim()} now has the same access as {source.Username.Trim()} (role {role.Name})."));
    }
}
