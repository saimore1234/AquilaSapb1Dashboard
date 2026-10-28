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
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var scope = context.HttpContext.RequestServices.GetRequiredService<ISalesScope>();
        if (scope.Current.Restricted)
        {
            context.Result = new ObjectResult(ApiResponse<object>.Fail("Your login can view its own customers, orders, invoices and targets, but cannot change this."))
            { StatusCode = StatusCodes.Status403Forbidden };
            return;
        }
        await next();
    }
}
