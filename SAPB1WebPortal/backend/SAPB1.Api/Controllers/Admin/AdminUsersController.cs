using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SAPB1.Api.Auth;
using SAPB1.Api.DTOs.Admin;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.Interfaces;

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

    public AdminUsersController(IAdminService adminService)
    {
        _adminService = adminService;
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

        var existing = await _adminService.GetUserByUsernameAsync(dto.Username, ct);
        if (existing is not null)
            return BadRequest(ApiResponse<object>.Fail($"A user named '{dto.Username}' already exists."));

        var hash = PasswordHasher.HashPassword(dto.Password);
        var id = await _adminService.CreateUserAsync(dto, hash, ct);
        return Ok(ApiResponse<object>.Ok(new { id }, "User created."));
    }

    [HttpPut("{id:int}")]
    [RequirePermission("Administration.Edit")]
    public async Task<ActionResult<ApiResponse<object>>> Update(int id, [FromBody] UpdateUserDto dto, CancellationToken ct)
    {
        var ok = await _adminService.UpdateUserAsync(id, dto, ct);
        if (!ok) return NotFound(ApiResponse<object>.Fail("User not found."));
        return Ok(ApiResponse<object>.Ok(new { }, "User updated."));
    }

    [HttpPost("{id:int}/reset-password")]
    [RequirePermission("Administration.Edit")]
    public async Task<ActionResult<ApiResponse<object>>> ResetPassword(int id, [FromBody] ResetPasswordDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.NewPassword) || dto.NewPassword.Length < 6)
            return BadRequest(ApiResponse<object>.Fail("Password must be at least 6 characters."));

        var hash = PasswordHasher.HashPassword(dto.NewPassword);
        var ok = await _adminService.ResetPasswordAsync(id, hash, ct);
        if (!ok) return NotFound(ApiResponse<object>.Fail("User not found."));
        return Ok(ApiResponse<object>.Ok(new { }, "Password reset."));
    }

    [HttpDelete("{id:int}")]
    [RequirePermission("Administration.Delete")]
    public async Task<ActionResult<ApiResponse<object>>> Delete(int id, CancellationToken ct)
    {
        var ok = await _adminService.DeleteUserAsync(id, ct);
        if (!ok) return NotFound(ApiResponse<object>.Fail("User not found."));
        return Ok(ApiResponse<object>.Ok(new { }, "User deleted."));
    }
}
