namespace SAPB1.Api.DTOs.Admin;

/// <summary>Row shape for the Server / Company Configuration list — no secrets,
/// encrypted or otherwise. HasSapPassword/HasSqlPassword tell the UI whether a
/// password is already set, so the Edit form can offer "leave blank to keep".</summary>
public class ServerConfigurationListItemDto
{
    public int Id { get; set; }
    public string CompanyCode { get; set; } = string.Empty;
    public string CompanyName { get; set; } = string.Empty;
    public string SapCompanyDb { get; set; } = string.Empty;
    public string ServiceLayerUrl { get; set; } = string.Empty;
    public string SqlServer { get; set; } = string.Empty;
    public string SqlDatabase { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTime? LastTestedAtUtc { get; set; }
    public string? LastTestResult { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>Full detail for the Edit form — still no secrets, only presence flags.</summary>
public class ServerConfigurationDetailDto : ServerConfigurationListItemDto
{
    public string SapUsername { get; set; } = string.Empty;
    public string SqlUsername { get; set; } = string.Empty;
    public string? SqlExtraOptions { get; set; }
    public bool HasSapPassword { get; set; }
    public bool HasSqlPassword { get; set; }
}

public class CreateServerConfigurationDto
{
    public string CompanyCode { get; set; } = string.Empty;
    public string CompanyName { get; set; } = string.Empty;
    public string SapCompanyDb { get; set; } = string.Empty;
    public string ServiceLayerUrl { get; set; } = string.Empty;
    public string SapUsername { get; set; } = string.Empty;
    public string SapPassword { get; set; } = string.Empty;
    public string SqlServer { get; set; } = string.Empty;
    public string SqlDatabase { get; set; } = string.Empty;
    public string SqlUsername { get; set; } = string.Empty;
    public string SqlPassword { get; set; } = string.Empty;
    public string? SqlExtraOptions { get; set; }
    public bool IsActive { get; set; } = true;
}

/// <summary>CompanyCode is intentionally absent/non-editable here — it's the
/// unique key baked into the JWT companyDb claim; changing it under a live
/// company would silently reassign an existing tenant's identity. Passwords are
/// nullable/blank-means-unchanged.</summary>
public class UpdateServerConfigurationDto
{
    public string CompanyName { get; set; } = string.Empty;
    public string SapCompanyDb { get; set; } = string.Empty;
    public string ServiceLayerUrl { get; set; } = string.Empty;
    public string SapUsername { get; set; } = string.Empty;
    public string? SapPassword { get; set; }
    public string SqlServer { get; set; } = string.Empty;
    public string SqlDatabase { get; set; } = string.Empty;
    public string SqlUsername { get; set; } = string.Empty;
    public string? SqlPassword { get; set; }
    public string? SqlExtraOptions { get; set; }
    public bool IsActive { get; set; }
}

/// <summary>Plaintext form payload for testing an in-progress Add/Edit form
/// BEFORE it's saved. Never persisted or logged as-is.</summary>
public class TestConnectionDto
{
    public string SapCompanyDb { get; set; } = string.Empty;
    public string ServiceLayerUrl { get; set; } = string.Empty;
    public string SapUsername { get; set; } = string.Empty;
    public string SapPassword { get; set; } = string.Empty;
    public string SqlServer { get; set; } = string.Empty;
    public string SqlDatabase { get; set; } = string.Empty;
    public string SqlUsername { get; set; } = string.Empty;
    public string SqlPassword { get; set; } = string.Empty;
    public string? SqlExtraOptions { get; set; }
}

public class TestConnectionResultDto
{
    public bool Success { get; set; }
    /// <summary>Always a safe, generic message — never a raw exception, SQL error
    /// detail, or SAP Service Layer error body.</summary>
    public string Message { get; set; } = string.Empty;
}

public class TestAllResultDto
{
    public TestConnectionResultDto Sql { get; set; } = new();
    public TestConnectionResultDto Sap { get; set; } = new();
}
