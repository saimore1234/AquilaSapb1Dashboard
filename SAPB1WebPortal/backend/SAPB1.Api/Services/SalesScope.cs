using System.Security.Claims;
using Dapper;
using Microsoft.Data.SqlClient;
using SAPB1.Api.Auth;
using SAPB1.Api.Interfaces;
using SAPB1.Api.Models;

namespace SAPB1.Api.Services;

/// <summary>
/// Salesperson scoping. A login is restricted when its ROLE is one of SalesScope:RestrictedRoles (default "Sales") or when it has been linked to
/// one or more SAP salespersons (dbo.UserSalespersonMap, set in Administration → Users). A restricted login that is not linked to any salesperson sees
/// no data at all. The portal superuser and the exempt roles (default "Administrator") are never restricted.
/// The link is read from the portal database on every request (cached for that request only), so a change applies immediately.
/// </summary>
public class SalesScope : ISalesScope
{
    private readonly IHttpContextAccessor _http;
    private readonly IPortalConnectionFactory _portal;
    private readonly IConfiguration _config;
    private readonly ILogger<SalesScope> _log;
    private SalesScopeInfo? _current;
    private static bool _warnedMissingTable; // log the missing-table warning once, not on every request

    public SalesScope(IHttpContextAccessor http, IPortalConnectionFactory portal, IConfiguration config, ILogger<SalesScope> log)
    {
        _http = http;
        _portal = portal;
        _config = config;
        _log = log;
    }

    public SalesScopeInfo Current => _current ??= Compute();

    private SalesScopeInfo Compute()
    {
        var user = _http.HttpContext?.User;
        if (user?.Identity?.IsAuthenticated != true) return new SalesScopeInfo(true, Array.Empty<int>()); // no identity: fail closed

        if (user.IsInRole(Roles.Admin)) return SalesScopeInfo.Unrestricted; // the portal superuser

        var role = user.FindFirstValue(ClaimTypes.Role) ?? "";
        var exempt = _config.GetSection("SalesScope:ExemptRoles").Get<string[]>() ?? new[] { "Administrator" };
        if (exempt.Contains(role, StringComparer.OrdinalIgnoreCase)) return SalesScopeInfo.Unrestricted;

        var restrictedRoles = _config.GetSection("SalesScope:RestrictedRoles").Get<string[]>() ?? new[] { "Sales" };
        var roleRestricted = restrictedRoles.Contains(role, StringComparer.OrdinalIgnoreCase);

        var codes = Array.Empty<int>();
        var company = user.FindFirstValue(AppClaimTypes.CompanyDb) ?? "";
        if (int.TryParse(user.FindFirstValue("userId"), out var userId))
        {
            try
            {
                using var db = _portal.CreateConnection();
                codes = db.Query<int>("SELECT SapSlpCode FROM dbo.UserSalespersonMap WHERE UserId = @UserId AND CompanyCode = @Company ORDER BY SapSlpCode",
                    new { UserId = userId, Company = company }).ToArray();
            }
            catch (SqlException ex)
            {
                // The mapping table is missing / unreadable: a restricted role must not fall back to "see everything".
                if (!_warnedMissingTable) { _warnedMissingTable = true; _log.LogWarning(ex, "Could not read dbo.UserSalespersonMap; run db/008_UserSalespersonMap.sql. Restricted logins see no data until then."); }
            }
        }

        return roleRestricted || codes.Length > 0 ? new SalesScopeInfo(true, codes, roleRestricted) : SalesScopeInfo.Unrestricted;
    }
}

/// <summary>Helpers that turn the scope into the two SQL parameters every scoped query uses: <c>@HasSlps</c> (0/1) and <c>@Slps</c> (never empty).</summary>
public static class SalesScopeSql
{
    /// <summary>Matches no salesperson — used so a denied scope returns nothing instead of erroring on an empty IN list.</summary>
    public const int NoMatch = int.MinValue;

    /// <summary>
    /// <paramref name="requested"/> is a salesperson the user picked in a filter. Unrestricted: it narrows to that one (or no limit when null).
    /// Restricted: it can only narrow WITHIN the allowed codes; anything else matches nothing.
    /// </summary>
    public static (int Has, int[] Slps) Resolve(SalesScopeInfo scope, int? requested = null)
    {
        if (!scope.Restricted) return requested is int r ? (1, new[] { r }) : (0, new[] { NoMatch });
        var allowed = scope.SlpCodes.Length == 0 ? new[] { NoMatch } : scope.SlpCodes;
        if (requested is int q) allowed = allowed.Contains(q) ? new[] { q } : new[] { NoMatch };
        return (1, allowed);
    }

    /// <summary>"45,50" — the allowed salesperson codes as an integer literal list (never user input); a denied scope yields a code that matches nothing.</summary>
    public static string List(SalesScopeInfo scope) => string.Join(",", (scope.SlpCodes.Length == 0 ? new[] { NoMatch } : scope.SlpCodes).Select(c => c.ToString(System.Globalization.CultureInfo.InvariantCulture)));

    /// <summary>" AND c.SlpCode IN (...)" for a query whose SUBJECT is the customer master (OCRD.SlpCode = the customer's assigned salesperson); "" when unrestricted.</summary>
    public static string CustomerPredicate(SalesScopeInfo scope, string alias = "") =>
        scope.Restricted ? $" AND {(alias.Length > 0 ? alias + "." : "")}SlpCode IN ({List(scope)})" : "";

    public static void AddSlps(this DynamicParameters p, SalesScopeInfo scope, int? requested = null)
    {
        var (has, slps) = Resolve(scope, requested);
        p.Add("HasSlps", has);
        p.Add("Slps", slps);
    }
}
