using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SAPB1.Api.Auth;
using SAPB1.Api.DTOs.Admin;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.Interfaces;
using SAPB1.Api.Services;

namespace SAPB1.Api.Controllers.Admin;

/// <summary>
/// User management for the RBAC system (Administration → Users). Any authenticated
/// user may hit these routes, but every action requires the matching
/// Administration.* permission (see RequirePermissionAttribute) — the portal Admin
/// superuser always passes; any other role only passes if explicitly granted that
/// permission via Administration → Roles. Never returns a password or password hash.
/// </summary>
[ApiController]
[Route("api/admin/users")]
[Authorize]
public class AdminUsersController : ControllerBase
{
    private readonly IAdminService _adminService;
    private readonly ICompanyConnectionFactory _sap;
    private readonly ICompanyContext _company;
    private readonly ISecurityService _security;

    public AdminUsersController(IAdminService adminService, ICompanyConnectionFactory sap, ICompanyContext company, ISecurityService security)
    {
        _security = security;
        _adminService = adminService;
        _sap = sap;
        _company = company;
    }

    /// <summary>Who is linked to which SAP salesperson (for the company the administrator is signed in to), plus the salesperson list to choose from.</summary>
    [HttpGet("salesperson-links")]
    [RequirePermission("Administration.View")]
    public async Task<ActionResult<ApiResponse<UserSalespersonLinksDto>>> GetSalespersonLinks(CancellationToken ct)
    {
        var dto = new UserSalespersonLinksDto { Links = await _adminService.GetSalespersonLinksAsync(_company.CompanyCode, ct) };
        using var db = _sap.CreateUnscopedConnection();
        dto.Salespersons = (await Dapper.SqlMapper.QueryAsync<SalesScopePersonDto>(db, new Dapper.CommandDefinition(
            "SELECT SlpCode AS Code, SlpName + CASE WHEN Active = 'Y' THEN '' ELSE ' (inactive)' END AS Name FROM OSLP WHERE SlpCode > 0 ORDER BY Active DESC, SlpName", cancellationToken: ct))).ToList();
        return Ok(ApiResponse<UserSalespersonLinksDto>.Ok(dto));
    }

    /// <summary>
    /// Links a portal user to one or more SAP salespersons. A login with the Sales role (or any linked login) then only sees those salespersons'
    /// customers, orders, invoices and targets — enforced on the server. An empty list removes the link.
    /// </summary>
    [HttpPut("{id:int}/salespersons")]
    [RequirePermission("Administration.Edit")]
    public async Task<ActionResult<ApiResponse<object>>> SetSalespersons(int id, [FromBody] SetSalespersonLinksDto dto, CancellationToken ct)
    {
        var codes = (dto.Salespersons ?? new()).Where(c => c > 0).Distinct().ToList();
        if (codes.Count > 0)
        {
            using var db = _sap.CreateUnscopedConnection();
            var found = await Dapper.SqlMapper.ExecuteScalarAsync<int>(db, new Dapper.CommandDefinition(
                "SELECT COUNT(*) FROM OSLP WHERE SlpCode IN @Codes", new { Codes = codes }, cancellationToken: ct));
            if (found != codes.Count) return BadRequest(ApiResponse<object>.Fail("One or more salespersons do not exist in SAP."));
        }
        var ok = await _adminService.SetSalespersonLinksAsync(id, _company.CompanyCode, codes, User.Identity?.Name ?? "admin", ct);
        if (!ok) return NotFound(ApiResponse<object>.Fail("User not found."));
        await _security.AuditAsync("SalespersonLinkChanged", null, $"user #{id}", "SAP salesperson codes: " + string.Join(",", codes));
        return Ok(ApiResponse<object>.Ok(new { }, "Salesperson link saved."));
    }

    [HttpGet]
    [RequirePermission("Administration.View")]
    public async Task<ActionResult<ApiResponse<List<UserListItemDto>>>> GetAll(CancellationToken ct)
    {
        var users = await _adminService.GetUsersAsync(ct);
        return Ok(ApiResponse<List<UserListItemDto>>.Ok(users));
    }

    [HttpPost]
    [RequirePermission("Administration.Create")]
    public async Task<ActionResult<ApiResponse<object>>> Create([FromBody] CreateUserDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.Username) || string.IsNullOrWhiteSpace(dto.Password) || dto.RoleId <= 0)
            return BadRequest(ApiResponse<object>.Fail("Username, password and role are required."));
        var problem = PasswordPolicy.Validate(dto.Password, dto.Username);
        if (problem is not null) return BadRequest(ApiResponse<object>.Fail(problem));

        var existing = await _adminService.GetUserByUsernameAsync(dto.Username, ct);
        if (existing is not null)
            return BadRequest(ApiResponse<object>.Fail($"A user named '{dto.Username}' already exists."));

        var hash = PasswordHasher.HashPassword(dto.Password);
        var id = await _adminService.CreateUserAsync(dto, hash, ct);
        await _security.SetPasswordAsync(id, hash, true, ct); // an administrator-set password is temporary: the user must choose their own
        await _security.AuditAsync("UserCreated", null, dto.Username, $"role id {dto.RoleId}");
        return Ok(ApiResponse<object>.Ok(new { id }, "User created."));
    }

    [HttpPut("{id:int}")]
    [RequirePermission("Administration.Edit")]
    public async Task<ActionResult<ApiResponse<object>>> Update(int id, [FromBody] UpdateUserDto dto, CancellationToken ct)
    {
        var ok = await _adminService.UpdateUserAsync(id, dto, ct);
        if (!ok) return NotFound(ApiResponse<object>.Fail("User not found."));
        await _security.AuditAsync("UserUpdated", null, $"user #{id}", $"active={dto.IsActive}, role id {dto.RoleId}");
        return Ok(ApiResponse<object>.Ok(new { }, "User updated."));
    }

    [HttpPost("{id:int}/reset-password")]
    [RequirePermission("Administration.Edit")]
    public async Task<ActionResult<ApiResponse<object>>> ResetPassword(int id, [FromBody] ResetPasswordDto dto, CancellationToken ct)
    {
        var problem = PasswordPolicy.Validate(dto.NewPassword, null);
        if (problem is not null) return BadRequest(ApiResponse<object>.Fail(problem));

        var hash = PasswordHasher.HashPassword(dto.NewPassword);
        var ok = await _security.SetPasswordAsync(id, hash, true, ct); // temporary: the user must change it at the next sign-in
        if (!ok) return NotFound(ApiResponse<object>.Fail("User not found."));
        await _security.AuditAsync("PasswordReset", null, $"user #{id}", "Set by administrator; user must change it at next sign-in");
        return Ok(ApiResponse<object>.Ok(new { }, "Password reset."));
    }

    [HttpDelete("{id:int}")]
    [RequirePermission("Administration.Delete")]
    public async Task<ActionResult<ApiResponse<object>>> Delete(int id, CancellationToken ct)
    {
        var ok = await _adminService.DeleteUserAsync(id, ct);
        if (!ok) return NotFound(ApiResponse<object>.Fail("User not found."));
        await _security.AuditAsync("UserDeleted", null, $"user #{id}");
        return Ok(ApiResponse<object>.Ok(new { }, "User deleted."));
    }

    /// <summary>The security audit log (sign-ins, failed sign-ins, lockouts, password changes/resets, user and role changes, salesperson links). Newest first.</summary>
    [HttpGet("audit-log")]
    [RequirePermission("Administration.View")]
    public async Task<ActionResult<ApiResponse<object>>> AuditLog([FromQuery] string? action, [FromQuery] string? user, [FromQuery] int page = 1, [FromQuery] int pageSize = 50, CancellationToken ct = default)
    {
        var (items, total) = await _security.ListAuditAsync(action, user, page, pageSize, ct);
        return Ok(ApiResponse<object>.Ok(new { items, total, page, pageSize }));
    }
}
