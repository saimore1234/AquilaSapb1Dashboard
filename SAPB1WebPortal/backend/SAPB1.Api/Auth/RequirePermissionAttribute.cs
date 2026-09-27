using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.Interfaces;
using SAPB1.Api.Models;

namespace SAPB1.Api.Auth;

/// <summary>
/// Stacks ON TOP OF the existing [Authorize(Roles = "...")] attributes — it never
/// replaces them. Only after the existing role check passes does this run.
///
/// The portal's built-in Admin (see AuthService — the one config-based login,
/// never a row in the Users table) always passes, exactly like every existing
/// [Authorize(Roles="Admin,...")] check already grants it access everywhere.
/// Every other role's permissions are resolved fresh from the database on every
/// request via IAdminService — never embedded in the JWT — so an Administrator
/// changing a role's permissions takes effect on that role's very next request,
/// with no re-login required.
///
/// On failure, returns 403 with a generic message — never the internal reason
/// (e.g. "role X lacks permission Y"), per the "don't leak authorization logic" requirement.
/// </summary>
public class RequirePermissionAttribute : Attribute, IFilterFactory
{
    private readonly string _permissionKey;

    public RequirePermissionAttribute(string permissionKey)
    {
        _permissionKey = permissionKey;
    }

    public bool IsReusable => false;

    public IFilterMetadata CreateInstance(IServiceProvider serviceProvider)
    {
        var adminService = (IAdminService)serviceProvider.GetService(typeof(IAdminService))!;
        return new RequirePermissionFilter(_permissionKey, adminService);
    }

    private class RequirePermissionFilter : IAsyncAuthorizationFilter
    {
        private readonly string _permissionKey;
        private readonly IAdminService _adminService;

        public RequirePermissionFilter(string permissionKey, IAdminService adminService)
        {
            _permissionKey = permissionKey;
            _adminService = adminService;
        }

        public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
        {
            var user = context.HttpContext.User;

            // The portal superuser — same bypass every existing Roles="Admin,..." check already grants.
            if (user.IsInRole(Roles.Admin))
            {
                return;
            }

            var role = user.FindFirstValue(ClaimTypes.Role);
            if (string.IsNullOrWhiteSpace(role))
            {
                context.Result = Forbidden();
                return;
            }

            var permissions = await _adminService.GetPermissionsForRoleNameAsync(role, context.HttpContext.RequestAborted);
            if (!permissions.Contains(_permissionKey))
            {
                context.Result = Forbidden();
            }
        }

        private static ObjectResult Forbidden() =>
            new(ApiResponse<object>.Fail("You do not have permission to perform this action.")) { StatusCode = 403 };
    }
}
