using System.Security.Claims;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Auth;

/// <summary>Custom claim type names used in the application JWT.</summary>
public static class AppClaimTypes
{
    public const string CompanyDb = "companyDb";
    public const string CompanyName = "companyName";
}

/// <summary>
/// Scoped per HTTP request. Reads which company/user the CURRENT request is
/// authenticated as straight from the already-validated JWT claims on
/// HttpContext.User. This is the ONLY source of the company code once a user
/// is logged in — nothing in the request body, query string, or headers is
/// ever consulted, so a client cannot switch databases by sending a different
/// value on a later request.
/// </summary>
public class CompanyContext : ICompanyContext
{
    public string CompanyCode { get; }
    public string Username { get; }

    public CompanyContext(IHttpContextAccessor accessor)
    {
        var user = accessor.HttpContext?.User;
        CompanyCode = user?.FindFirstValue(AppClaimTypes.CompanyDb) ?? string.Empty;
        Username = user?.Identity?.Name ?? string.Empty;
    }
}
