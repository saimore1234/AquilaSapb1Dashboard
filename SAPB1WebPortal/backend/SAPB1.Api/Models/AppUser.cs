namespace SAPB1.Api.Models;

/// <summary>
/// Portal-level roles. These gate access to portal API endpoints via
/// [Authorize(Roles = "...")] on controllers; they are NOT derived from SAP B1's
/// own authorization groups (OUSR) — see AuthService.ResolvePortalRole for the
/// documented Phase 1 default and how to override it per (company, username).
/// </summary>
public static class Roles
{
    public const string Admin = "Admin";
    public const string Manager = "Manager";
    public const string Sales = "Sales";
    public const string Purchase = "Purchase";
    public const string Accounts = "Accounts";
    public const string Inventory = "Inventory";

    /// <summary>Roles allowed to view Business Partners / Items / Inventory / Dashboard.</summary>
    public static readonly string[] GeneralReadRoles =
        { Admin, Manager, Sales, Purchase, Accounts, Inventory };
}
