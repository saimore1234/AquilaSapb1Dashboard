using System.Text.Json;
using SAPB1.Api.DTOs.Common;

namespace SAPB1.Api.Auth;

/// <summary>
/// A token issued for an account that still has a temporary password (claim "pwdChange") can only change that password, read who it is, or log out.
/// Every other API call is refused here on the server, so skipping the "set a new password" screen in the browser does not get anyone in.
/// Tokens without the claim (every existing login) pass straight through.
/// </summary>
public sealed class MustChangePasswordMiddleware
{
    private static readonly string[] Allowed = { "/api/auth/change-password", "/api/auth/me", "/api/auth/logout", "/api/auth/companies" };
    private readonly RequestDelegate _next;

    public MustChangePasswordMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated == true && context.User.HasClaim(AppClaimTypes.MustChangePassword, "1")
            && !Allowed.Contains(context.Request.Path.Value?.TrimEnd('/').ToLowerInvariant() ?? ""))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(JsonSerializer.Serialize(ApiResponse<object>.Fail("You must set a new password before continuing."),
                new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
            return;
        }
        await _next(context);
    }
}
