using SAPB1.Api.DTOs.Admin;

namespace SAPB1.Api.Interfaces;

/// <summary>
/// Reversible, server-side-only protection for stored secrets (SAP/SQL
/// passwords) — NOT PasswordHasher, which is one-way and only for the portal's
/// own login. Backed by the ASP.NET Core Data Protection API; see
/// Auth/DataProtectionSecretProtector.cs.
/// </summary>
public interface ISecretProtector
{
    string Protect(string plaintext);
    string Unprotect(string protectedText);
}

/// <summary>
/// One company's fully-resolved runtime configuration, DECRYPTED and ready to
/// use — held only in memory (ICompanyConfigurationProvider), never persisted
/// or logged in this shape. Code is the portal company code (matches the JWT
/// companyDb claim / CompanyEntry.Code).
/// </summary>
public record CachedCompanyConfig(
    string Code,
    string Name,
    string SapCompanyDb,
    string ServiceLayerUrl,
    string SapUsername,
    string SapPassword,
    string SqlConnectionString);

/// <summary>
/// Pure in-memory, zero-I/O cache of database-driven company configuration,
/// keyed by company code (case-insensitive). Deliberately synchronous and
/// dependency-free so any Singleton (CompanyRegistry, SapServiceLayerSessionManager)
/// can safely depend on it without a captive-dependency problem, and any Scoped
/// service (SqlServerConfigurationService, CompanyConnectionFactory) can equally
/// depend on/mutate it. Populated at startup by ServerConfigurationCacheWarmupService
/// and kept in sync on every Create/Update/Enable/Disable/Delete — no polling,
/// no TTL: an edit takes effect on the very next request, no app restart needed.
/// Companies with no entry here fall back to file/user-secrets configuration
/// exactly as before this feature existed.
/// </summary>
public interface ICompanyConfigurationProvider
{
    bool TryGet(string code, out CachedCompanyConfig entry);
    IReadOnlyCollection<CachedCompanyConfig> GetAll();
    void Set(string code, CachedCompanyConfig entry);
    void Remove(string code);
}

/// <summary>
/// CRUD + connection-testing for the database-driven server/company
/// configuration (Administration → Server / Company Configuration). Mirrors
/// IAdminService's structure/style. Every mutating method keeps
/// ICompanyConfigurationProvider in sync and writes an IAuditLogService entry;
/// never returns a raw password to a caller.
/// </summary>
public interface IServerConfigurationService
{
    Task<List<ServerConfigurationListItemDto>> GetAllAsync(CancellationToken ct = default);
    Task<ServerConfigurationDetailDto?> GetByIdAsync(int id, CancellationToken ct = default);
    Task<int> CreateAsync(CreateServerConfigurationDto dto, CancellationToken ct = default);
    Task<bool> UpdateAsync(int id, UpdateServerConfigurationDto dto, CancellationToken ct = default);
    Task<bool> SetActiveAsync(int id, bool isActive, CancellationToken ct = default);
    Task<bool> DeleteAsync(int id, CancellationToken ct = default);

    /// <summary>Tests connectivity. Pass a non-null <paramref name="dto"/> (plaintext,
    /// from an in-progress Add/Edit form) to test before saving; pass
    /// <paramref name="id"/> instead to test an already-saved row (the server
    /// decrypts its stored secrets) — exactly one of the two must be supplied.</summary>
    Task<TestConnectionResultDto> TestSqlAsync(int? id, TestConnectionDto? dto, CancellationToken ct = default);
    Task<TestConnectionResultDto> TestSapAsync(int? id, TestConnectionDto? dto, CancellationToken ct = default);
    Task<TestAllResultDto> TestAllAsync(int? id, TestConnectionDto? dto, CancellationToken ct = default);

    /// <summary>Loads every ACTIVE row, decrypted, for the startup cache warm-up.
    /// Never call this per-request — see ServerConfigurationCacheWarmupService.</summary>
    Task<List<CachedCompanyConfig>> LoadAllActiveForCacheAsync(CancellationToken ct = default);
}

/// <summary>
/// Minimal audit trail scoped to Server/Company Configuration changes only
/// (no generic audit framework). Never logs a password, token, or raw exception —
/// Detail is always a short, safe summary.
/// </summary>
public interface IAuditLogService
{
    Task LogAsync(string companyCode, int? serverConfigurationId, string action, bool success, string? detail, CancellationToken ct = default);
}
