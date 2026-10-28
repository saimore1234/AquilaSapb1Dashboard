using Dapper;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Services;

public sealed class AuditEntryDto
{
    public long Id { get; set; }
    public DateTime At { get; set; }
    public string? Company { get; set; }
    public string? Username { get; set; }
    public string Action { get; set; } = "";
    public string? Target { get; set; }
    public string? Detail { get; set; }
    public bool Success { get; set; }
    public string? Ip { get; set; }
}

/// <summary>
/// The "must change password" flag and the audit log. Both live in columns / a table added by db/009_SecurityAudit.sql; until that script has been run
/// every method here quietly does nothing (login and everything else keep working exactly as before). Audit writes never throw into the request.
/// </summary>
public interface ISecurityService
{
    Task<bool> GetMustChangeAsync(int userId, CancellationToken ct = default);
    /// <summary>Stores a new password hash; mustChange sets/clears the flag (ignored while the column does not exist).</summary>
    Task<bool> SetPasswordAsync(int userId, string passwordHash, bool mustChange, CancellationToken ct = default);
    Task AuditAsync(string action, string? username = null, string? target = null, string? detail = null, bool success = true);
    Task<(List<AuditEntryDto> Items, int Total)> ListAuditAsync(string? action, string? username, int page, int pageSize, CancellationToken ct = default);
}

public sealed class SecurityService : ISecurityService
{
    private static bool? _hasFlag, _hasAudit;
    private readonly IPortalConnectionFactory _portal;
    private readonly IHttpContextAccessor _http;
    private readonly ILogger<SecurityService> _log;

    public SecurityService(IPortalConnectionFactory portal, IHttpContextAccessor http, ILogger<SecurityService> log)
    {
        _portal = portal; _http = http; _log = log;
    }

    private async Task<bool> FlagColumnAsync(System.Data.IDbConnection db, CancellationToken ct)
    {
        if (_hasFlag == true) return true;
        var has = await db.ExecuteScalarAsync<int>(new CommandDefinition("SELECT CASE WHEN COL_LENGTH('dbo.Users','MustChangePassword') IS NULL THEN 0 ELSE 1 END", cancellationToken: ct)) == 1;
        if (has) _hasFlag = true; // re-checked on every call while missing, so running the script takes effect without a restart
        return has;
    }

    private async Task<bool> AuditTableAsync(System.Data.IDbConnection db, CancellationToken ct)
    {
        if (_hasAudit == true) return true;
        var has = await db.ExecuteScalarAsync<int>(new CommandDefinition("SELECT CASE WHEN OBJECT_ID('dbo.AuditLog','U') IS NULL THEN 0 ELSE 1 END", cancellationToken: ct)) == 1;
        if (has) _hasAudit = true;
        return has;
    }

    public async Task<bool> GetMustChangeAsync(int userId, CancellationToken ct = default)
    {
        try
        {
            using var db = _portal.CreateConnection();
            if (!await FlagColumnAsync(db, ct)) return false;
            return await db.ExecuteScalarAsync<bool>(new CommandDefinition("SELECT MustChangePassword FROM dbo.Users WHERE Id = @Id", new { Id = userId }, cancellationToken: ct));
        }
        catch (Exception ex) { _log.LogWarning(ex, "Could not read MustChangePassword."); return false; }
    }

    public async Task<bool> SetPasswordAsync(int userId, string passwordHash, bool mustChange, CancellationToken ct = default)
    {
        using var db = _portal.CreateConnection();
        var flag = await FlagColumnAsync(db, ct) ? ", MustChangePassword = @Must" : "";
        var rows = await db.ExecuteAsync(new CommandDefinition(
            $"UPDATE dbo.Users SET PasswordHash = @Hash, UpdatedAt = SYSUTCDATETIME(){flag} WHERE Id = @Id",
            new { Id = userId, Hash = passwordHash, Must = mustChange }, cancellationToken: ct));
        return rows > 0;
    }

    public async Task AuditAsync(string action, string? username = null, string? target = null, string? detail = null, bool success = true)
    {
        try
        {
            var ctx = _http.HttpContext;
            username ??= ctx?.User?.Identity?.Name;
            var company = ctx?.User?.FindFirst(Auth.AppClaimTypes.CompanyDb)?.Value;
            var ip = ctx?.Connection.RemoteIpAddress?.ToString();
            using var db = _portal.CreateConnection();
            if (!await AuditTableAsync(db, CancellationToken.None)) return;
            await db.ExecuteAsync(new CommandDefinition(
                "INSERT INTO dbo.AuditLog (Company, Username, Action, Target, Detail, Success, Ip) VALUES (@Company, @Username, @Action, @Target, @Detail, @Success, @Ip)",
                new { Company = company, Username = Trunc(username, 100), Action = Trunc(action, 60), Target = Trunc(target, 200), Detail = Trunc(detail, 1000), Success = success, Ip = Trunc(ip, 64) }));
        }
        catch (Exception ex) { _log.LogWarning(ex, "Audit write failed for {Action}.", action); }
    }

    private static string? Trunc(string? s, int n) => s is null ? null : s.Length <= n ? s : s[..n];

    public async Task<(List<AuditEntryDto> Items, int Total)> ListAuditAsync(string? action, string? username, int page, int pageSize, CancellationToken ct = default)
    {
        using var db = _portal.CreateConnection();
        if (!await AuditTableAsync(db, ct)) return (new List<AuditEntryDto>(), 0);
        page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 200);
        const string where = "WHERE (@Action IS NULL OR Action = @Action) AND (@User IS NULL OR Username LIKE '%' + @User + '%' OR Target LIKE '%' + @User + '%')";
        var p = new { Action = string.IsNullOrWhiteSpace(action) ? null : action, User = string.IsNullOrWhiteSpace(username) ? null : username.Trim(), Skip = (page - 1) * pageSize, Take = pageSize };
        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition($"SELECT COUNT(*) FROM dbo.AuditLog {where}", p, cancellationToken: ct));
        var items = (await db.QueryAsync<AuditEntryDto>(new CommandDefinition(
            $"SELECT Id, At, Company, Username, Action, Target, Detail, Success, Ip FROM dbo.AuditLog {where} ORDER BY Id DESC OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY", p, cancellationToken: ct))).ToList();
        return (items, total);
    }
}
