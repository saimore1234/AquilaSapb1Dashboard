namespace SAPB1.Api.Interfaces;

/// <summary>
/// Which SAP salespersons (OSLP.SlpCode) the CURRENT request may see. Decided on the server from the signed login token and the portal database —
/// never from anything the browser sends.
///   Restricted = false  → no limit (administrators, managers who are not linked to a salesperson).
///   Restricted = true   → every customer / order / invoice / target query is limited to <see cref="SlpCodes"/>.
///   Restricted with NO codes → the login is a salesperson login that has not been linked to a salesperson yet: it sees nothing (fail-closed).
/// </summary>
public sealed record SalesScopeInfo(bool Restricted, int[] SlpCodes, bool RoleRestricted = false)
{
    public static readonly SalesScopeInfo Unrestricted = new(false, Array.Empty<int>());
    public bool Denied => Restricted && SlpCodes.Length == 0;
}

/// <summary>Request-scoped; computed once per request.</summary>
public interface ISalesScope
{
    SalesScopeInfo Current { get; }
}
