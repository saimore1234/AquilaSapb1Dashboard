namespace SAPB1.Api.Models;

/// <summary>
/// Binds the "CompanyDatabases" section of appsettings.json — the server-side
/// allow-list of SAP B1 companies this portal exposes. Contains NO secrets: no
/// SQL username/password, no SAP B1 password, no connection string. The
/// matching read-only SQL connection string for each Code lives in
/// user-secrets under "CompanyConnectionStrings:{Code}" (development) or the
/// CompanyConnectionStrings__{Code} environment variable (production) — never
/// in this file. See README section 4 for the exact commands.
/// </summary>
public class CompanyDatabaseOptions
{
    public const string SectionName = "CompanyDatabases";

    public List<CompanyEntry> Companies { get; set; } = new();
}

public class CompanyEntry
{
    /// <summary>Portal-facing company code used by the frontend/login and baked
    /// into the JWT's "companyDb" claim, e.g. "STEST".</summary>
    public string Code { get; set; } = string.Empty;

    /// <summary>Friendly display name shown in the login dropdown, e.g. "STEST" or "Company A".</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>The SAP B1 CompanyDB name exactly as SAP B1 itself knows it (passed
    /// to Service Layer's Login call as "CompanyDB"). Usually identical to Code,
    /// but kept separate in case the portal code and the real SAP B1 database
    /// name ever differ.</summary>
    public string ServiceLayerCompanyDb { get; set; } = string.Empty;

    /// <summary>Base URL of the SAP B1 Service Layer for this company, e.g.
    /// "https://localhost:50000/b1s/v1". Multiple companies on the same B1
    /// server share one Service Layer URL and differ only by
    /// ServiceLayerCompanyDb.</summary>
    public string ServiceLayerUrl { get; set; } = string.Empty;
}
