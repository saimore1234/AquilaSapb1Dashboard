using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Auth;

/// <summary>
/// For actions that cannot be limited to one salesperson's data (or that a salesperson login must not perform, such as creating or approving targets).
/// A restricted login gets 403; everyone else passes. Enforced on the server — hiding a button in the UI is not relied on.
/// </summary>
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class)]
public sealed class BlockRestrictedAttribute : Attribute, IAsyncActionFilter
{
    /// <summary>
    /// When true, only logins whose ROLE is a restricted role (SalesScope:RestrictedRoles, e.g. "Sales") are blocked. A manager who is merely
    /// linked to a team of salespersons keeps whatever the administrator granted in role permissions, while still seeing only that team's data.
    /// </summary>
    public bool RoleOnly { get; set; }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var services = context.HttpContext.RequestServices;
        var scope = services.GetRequiredService<ISalesScope>();
        var blocked = scope.Current.Restricted;
        if (blocked && RoleOnly)
        {
            var role = context.HttpContext.User.FindFirstValue(ClaimTypes.Role) ?? "";
            var roles = services.GetRequiredService<IConfiguration>().GetSection("SalesScope:RestrictedRoles").Get<string[]>() ?? new[] { "Sales" };
            blocked = roles.Contains(role, StringComparer.OrdinalIgnoreCase);
        }
        if (blocked)
        {
            context.Result = new ObjectResult(ApiResponse<object>.Fail("Your login can view its own customers, orders, invoices and targets, but cannot change this."))
            { StatusCode = StatusCodes.Status403Forbidden };
            return;
        }
        await next();
    }
}
