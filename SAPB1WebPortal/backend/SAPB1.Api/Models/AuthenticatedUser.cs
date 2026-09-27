namespace SAPB1.Api.Models;

/// <summary>
/// A successfully authenticated SAP B1 user, scoped to one company database.
/// Produced only after real SAP B1 Service Layer verification (see
/// ISapB1Authenticator) — never persisted, never built from a locally stored
/// password.
/// </summary>
public class AuthenticatedUser
{
    public string Username { get; set; } = string.Empty;
    public string CompanyCode { get; set; } = string.Empty;
    public string CompanyName { get; set; } = string.Empty;
    public string Role { get; set; } = Roles.Admin;

    /// <summary>Set only for RBAC-backed users (Services/SqlAdminService); null for the
    /// portal's built-in admin superuser, which is never a row in the Users table.</summary>
    public int? UserId { get; set; }
}
