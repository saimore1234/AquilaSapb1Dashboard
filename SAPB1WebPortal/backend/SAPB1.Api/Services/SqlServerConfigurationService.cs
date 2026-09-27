using System.Text;
using System.Text.Json;
using Dapper;
using Microsoft.Data.SqlClient;
using SAPB1.Api.DTOs.Admin;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Services;

/// <summary>
/// Dapper-based CRUD + connection-testing over dbo.ServerConfigurations
/// (SAPB1PortalAdmin), following the same query style as SqlAdminService —
/// parameterized SQL, explicit column lists. Every mutating method keeps
/// ICompanyConfigurationProvider (the in-memory runtime cache consulted by
/// CompanyRegistry/CompanyConnectionFactory/SapServiceLayerSessionManager) in
/// sync and writes an audit row. Passwords are encrypted at rest via
/// ISecretProtector and never returned to a caller in plaintext or ciphertext.
/// </summary>
public class SqlServerConfigurationService : IServerConfigurationService
{
    private const string HttpClientName = "SapServiceLayerWrite";

    private readonly IPortalConnectionFactory _connectionFactory;
    private readonly ISecretProtector _secretProtector;
    private readonly ICompanyConfigurationProvider _cache;
    private readonly IAuditLogService _auditLog;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<SqlServerConfigurationService> _logger;

    public SqlServerConfigurationService(
        IPortalConnectionFactory connectionFactory,
        ISecretProtector secretProtector,
        ICompanyConfigurationProvider cache,
        IAuditLogService auditLog,
        IHttpClientFactory httpClientFactory,
        ILogger<SqlServerConfigurationService> logger)
    {
        _connectionFactory = connectionFactory;
        _secretProtector = secretProtector;
        _cache = cache;
        _auditLog = auditLog;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    // -----------------------------------------------------------------
    // CRUD
    // -----------------------------------------------------------------

    public async Task<List<ServerConfigurationListItemDto>> GetAllAsync(CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        const string sql = @"
            SELECT Id, CompanyCode, CompanyName, SapCompanyDb, ServiceLayerUrl, SqlServer, SqlDatabase,
                   IsActive, LastTestedAtUtc, LastTestResult, CreatedAt, UpdatedAt
            FROM ServerConfigurations
            ORDER BY CompanyCode";

        return (await db.QueryAsync<ServerConfigurationListItemDto>(new CommandDefinition(sql, cancellationToken: ct))).ToList();
    }

    public async Task<ServerConfigurationDetailDto?> GetByIdAsync(int id, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var row = await GetRowAsync(db, id, ct);
        if (row is null) return null;

        return new ServerConfigurationDetailDto
        {
            Id = row.Id,
            CompanyCode = row.CompanyCode,
            CompanyName = row.CompanyName,
            SapCompanyDb = row.SapCompanyDb,
            ServiceLayerUrl = row.ServiceLayerUrl,
            SqlServer = row.SqlServer,
            SqlDatabase = row.SqlDatabase,
            IsActive = row.IsActive,
            LastTestedAtUtc = row.LastTestedAtUtc,
            LastTestResult = row.LastTestResult,
            CreatedAt = row.CreatedAt,
            UpdatedAt = row.UpdatedAt,
            SapUsername = row.SapUsername,
            SqlUsername = row.SqlUsername,
            SqlExtraOptions = row.SqlExtraOptions,
            HasSapPassword = !string.IsNullOrEmpty(row.SapPasswordEncrypted),
            HasSqlPassword = !string.IsNullOrEmpty(row.SqlPasswordEncrypted)
        };
    }

    public async Task<int> CreateAsync(CreateServerConfigurationDto dto, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        var duplicateNote = await FindSoftDuplicateNoteAsync(db, dto.SapCompanyDb, dto.ServiceLayerUrl, excludeId: null, ct);

        const string sql = @"
            INSERT INTO ServerConfigurations
                (CompanyCode, CompanyName, SapCompanyDb, ServiceLayerUrl, SapUsername, SapPasswordEncrypted,
                 SqlServer, SqlDatabase, SqlUsername, SqlPasswordEncrypted, SqlExtraOptions, IsActive,
                 CreatedAt, UpdatedAt)
            OUTPUT INSERTED.Id
            VALUES
                (@CompanyCode, @CompanyName, @SapCompanyDb, @ServiceLayerUrl, @SapUsername, @SapPasswordEncrypted,
                 @SqlServer, @SqlDatabase, @SqlUsername, @SqlPasswordEncrypted, @SqlExtraOptions, @IsActive,
                 SYSUTCDATETIME(), SYSUTCDATETIME())";

        var id = await db.ExecuteScalarAsync<int>(new CommandDefinition(sql, new
        {
            dto.CompanyCode,
            dto.CompanyName,
            dto.SapCompanyDb,
            dto.ServiceLayerUrl,
            dto.SapUsername,
            SapPasswordEncrypted = _secretProtector.Protect(dto.SapPassword),
            dto.SqlServer,
            dto.SqlDatabase,
            dto.SqlUsername,
            SqlPasswordEncrypted = _secretProtector.Protect(dto.SqlPassword),
            dto.SqlExtraOptions,
            dto.IsActive
        }, cancellationToken: ct));

        if (dto.IsActive)
        {
            _cache.Set(dto.CompanyCode, new CachedCompanyConfig(
                dto.CompanyCode, dto.CompanyName, dto.SapCompanyDb, dto.ServiceLayerUrl,
                dto.SapUsername, dto.SapPassword,
                BuildSqlConnectionString(dto.SqlServer, dto.SqlDatabase, dto.SqlUsername, dto.SqlPassword, dto.SqlExtraOptions)));
        }

        await _auditLog.LogAsync(dto.CompanyCode, id, "Create", true, duplicateNote, ct);
        return id;
    }

    public async Task<bool> UpdateAsync(int id, UpdateServerConfigurationDto dto, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var existing = await GetRowAsync(db, id, ct);
        if (existing is null) return false;

        var sapPasswordEncrypted = string.IsNullOrEmpty(dto.SapPassword) ? existing.SapPasswordEncrypted : _secretProtector.Protect(dto.SapPassword);
        var sqlPasswordEncrypted = string.IsNullOrEmpty(dto.SqlPassword) ? existing.SqlPasswordEncrypted : _secretProtector.Protect(dto.SqlPassword);

        var duplicateNote = await FindSoftDuplicateNoteAsync(db, dto.SapCompanyDb, dto.ServiceLayerUrl, excludeId: id, ct);

        const string sql = @"
            UPDATE ServerConfigurations
            SET CompanyName = @CompanyName, SapCompanyDb = @SapCompanyDb, ServiceLayerUrl = @ServiceLayerUrl,
                SapUsername = @SapUsername, SapPasswordEncrypted = @SapPasswordEncrypted,
                SqlServer = @SqlServer, SqlDatabase = @SqlDatabase, SqlUsername = @SqlUsername,
                SqlPasswordEncrypted = @SqlPasswordEncrypted, SqlExtraOptions = @SqlExtraOptions,
                IsActive = @IsActive, UpdatedAt = SYSUTCDATETIME()
            WHERE Id = @Id";

        var rows = await db.ExecuteAsync(new CommandDefinition(sql, new
        {
            Id = id,
            dto.CompanyName,
            dto.SapCompanyDb,
            dto.ServiceLayerUrl,
            dto.SapUsername,
            SapPasswordEncrypted = sapPasswordEncrypted,
            dto.SqlServer,
            dto.SqlDatabase,
            dto.SqlUsername,
            SqlPasswordEncrypted = sqlPasswordEncrypted,
            dto.SqlExtraOptions,
            dto.IsActive
        }, cancellationToken: ct));

        if (rows == 0) return false;

        if (dto.IsActive)
        {
            var sapPassword = _secretProtector.Unprotect(sapPasswordEncrypted);
            var sqlPassword = _secretProtector.Unprotect(sqlPasswordEncrypted);
            _cache.Set(existing.CompanyCode, new CachedCompanyConfig(
                existing.CompanyCode, dto.CompanyName, dto.SapCompanyDb, dto.ServiceLayerUrl,
                dto.SapUsername, sapPassword,
                BuildSqlConnectionString(dto.SqlServer, dto.SqlDatabase, dto.SqlUsername, sqlPassword, dto.SqlExtraOptions)));
        }
        else
        {
            _cache.Remove(existing.CompanyCode);
        }

        await _auditLog.LogAsync(existing.CompanyCode, id, "Update", true, duplicateNote, ct);
        return true;
    }

    public async Task<bool> SetActiveAsync(int id, bool isActive, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var existing = await GetRowAsync(db, id, ct);
        if (existing is null) return false;

        var rows = await db.ExecuteAsync(new CommandDefinition(
            "UPDATE ServerConfigurations SET IsActive = @IsActive, UpdatedAt = SYSUTCDATETIME() WHERE Id = @Id",
            new { Id = id, IsActive = isActive }, cancellationToken: ct));
        if (rows == 0) return false;

        if (isActive)
        {
            var sapPassword = _secretProtector.Unprotect(existing.SapPasswordEncrypted);
            var sqlPassword = _secretProtector.Unprotect(existing.SqlPasswordEncrypted);
            _cache.Set(existing.CompanyCode, new CachedCompanyConfig(
                existing.CompanyCode, existing.CompanyName, existing.SapCompanyDb, existing.ServiceLayerUrl,
                existing.SapUsername, sapPassword,
                BuildSqlConnectionString(existing.SqlServer, existing.SqlDatabase, existing.SqlUsername, sqlPassword, existing.SqlExtraOptions)));
        }
        else
        {
            _cache.Remove(existing.CompanyCode);
        }

        await _auditLog.LogAsync(existing.CompanyCode, id, isActive ? "Enable" : "Disable", true, null, ct);
        return true;
    }

    public async Task<bool> DeleteAsync(int id, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var existing = await GetRowAsync(db, id, ct);
        if (existing is null) return false;

        var rows = await db.ExecuteAsync(new CommandDefinition(
            "DELETE FROM ServerConfigurations WHERE Id = @Id", new { Id = id }, cancellationToken: ct));
        if (rows == 0) return false;

        _cache.Remove(existing.CompanyCode);
        await _auditLog.LogAsync(existing.CompanyCode, null, "Delete", true, null, ct);
        return true;
    }

    // -----------------------------------------------------------------
    // Connection testing — always throwaway, never touches
    // ICompanyConnectionFactory or ISapServiceLayerSessionManager, so a test
    // can never disrupt a real cached session or pooled connection.
    // -----------------------------------------------------------------

    public async Task<TestConnectionResultDto> TestSqlAsync(int? id, TestConnectionDto? dto, CancellationToken ct = default)
    {
        var (values, companyCode, configId) = await ResolveTestValuesAsync(id, dto, ct);
        var result = await TestSqlInternalAsync(values, ct);
        await RecordTestOutcomeAsync(configId, companyCode, "TestSql", result, ct);
        return result;
    }

    public async Task<TestConnectionResultDto> TestSapAsync(int? id, TestConnectionDto? dto, CancellationToken ct = default)
    {
        var (values, companyCode, configId) = await ResolveTestValuesAsync(id, dto, ct);
        var result = await TestSapInternalAsync(values, companyCode, ct);
        await RecordTestOutcomeAsync(configId, companyCode, "TestSap", result, ct);
        return result;
    }

    public async Task<TestAllResultDto> TestAllAsync(int? id, TestConnectionDto? dto, CancellationToken ct = default)
    {
        var (values, companyCode, configId) = await ResolveTestValuesAsync(id, dto, ct);
        var sql = await TestSqlInternalAsync(values, ct);
        var sap = await TestSapInternalAsync(values, companyCode, ct);
        var combined = new TestConnectionResultDto
        {
            Success = sql.Success && sap.Success,
            Message = sql.Success && sap.Success ? "Both connections successful." : "See individual results."
        };
        await RecordTestOutcomeAsync(configId, companyCode, "TestAll", combined, ct);
        return new TestAllResultDto { Sql = sql, Sap = sap };
    }

    public async Task<List<CachedCompanyConfig>> LoadAllActiveForCacheAsync(CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        const string sql = @"
            SELECT CompanyCode, CompanyName, SapCompanyDb, ServiceLayerUrl, SapUsername, SapPasswordEncrypted,
                   SqlServer, SqlDatabase, SqlUsername, SqlPasswordEncrypted, SqlExtraOptions
            FROM ServerConfigurations
            WHERE IsActive = 1";

        var rows = await db.QueryAsync<ServerConfigurationRow>(new CommandDefinition(sql, cancellationToken: ct));

        var result = new List<CachedCompanyConfig>();
        foreach (var row in rows)
        {
            try
            {
                var sapPassword = _secretProtector.Unprotect(row.SapPasswordEncrypted);
                var sqlPassword = _secretProtector.Unprotect(row.SqlPasswordEncrypted);
                result.Add(new CachedCompanyConfig(
                    row.CompanyCode, row.CompanyName, row.SapCompanyDb, row.ServiceLayerUrl,
                    row.SapUsername, sapPassword,
                    BuildSqlConnectionString(row.SqlServer, row.SqlDatabase, row.SqlUsername, sqlPassword, row.SqlExtraOptions)));
            }
            catch (Exception ex)
            {
                // A single row's secrets failing to decrypt (e.g. Data Protection
                // key ring changed) must never take down the whole cache warm-up —
                // that company just falls back to file config, or is unreachable
                // until an admin re-saves its passwords via Edit.
                _logger.LogError(ex, "Could not decrypt stored credentials for company {Code}; it will not be available from the database-driven cache.", row.CompanyCode);
            }
        }

        return result;
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    private async Task<(TestConnectionDto Values, string CompanyCode, int? ConfigId)> ResolveTestValuesAsync(
        int? id, TestConnectionDto? dto, CancellationToken ct)
    {
        if (id is int configId)
        {
            using var db = _connectionFactory.CreateConnection();
            var row = await GetRowAsync(db, configId, ct)
                ?? throw new InvalidOperationException($"Server configuration {configId} not found.");

            return (new TestConnectionDto
            {
                SapCompanyDb = row.SapCompanyDb,
                ServiceLayerUrl = row.ServiceLayerUrl,
                SapUsername = row.SapUsername,
                SapPassword = _secretProtector.Unprotect(row.SapPasswordEncrypted),
                SqlServer = row.SqlServer,
                SqlDatabase = row.SqlDatabase,
                SqlUsername = row.SqlUsername,
                SqlPassword = _secretProtector.Unprotect(row.SqlPasswordEncrypted),
                SqlExtraOptions = row.SqlExtraOptions
            }, row.CompanyCode, configId);
        }

        if (dto is null)
            throw new InvalidOperationException("Either an id or a TestConnectionDto must be supplied.");

        return (dto, dto.SapCompanyDb, null);
    }

    private async Task RecordTestOutcomeAsync(int? configId, string companyCode, string action, TestConnectionResultDto result, CancellationToken ct)
    {
        if (configId is int id)
        {
            using var db = _connectionFactory.CreateConnection();
            await db.ExecuteAsync(new CommandDefinition(
                "UPDATE ServerConfigurations SET LastTestedAtUtc = SYSUTCDATETIME(), LastTestResult = @Result WHERE Id = @Id",
                new { Id = id, Result = result.Success ? "Success" : "Failed" }, cancellationToken: ct));
        }

        await _auditLog.LogAsync(companyCode, configId, action, result.Success, result.Message, ct);
    }

    private async Task<TestConnectionResultDto> TestSqlInternalAsync(TestConnectionDto values, CancellationToken ct)
    {
        try
        {
            var connectionString = BuildSqlConnectionString(values.SqlServer, values.SqlDatabase, values.SqlUsername, values.SqlPassword, values.SqlExtraOptions, connectTimeoutSeconds: 8);
            await using var connection = new SqlConnection(connectionString);
            await connection.OpenAsync(ct);
            return new TestConnectionResultDto { Success = true, Message = "SQL Server connection successful." };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SQL connection test failed for server {Server}, database {Database}.", values.SqlServer, values.SqlDatabase);
            return new TestConnectionResultDto { Success = false, Message = "SQL Server connection failed. Check server, database, and credentials." };
        }
    }

    private async Task<TestConnectionResultDto> TestSapInternalAsync(TestConnectionDto values, string companyCodeForLogging, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(values.ServiceLayerUrl))
            return new TestConnectionResultDto { Success = false, Message = "Service Layer URL is required." };

        var client = _httpClientFactory.CreateClient(HttpClientName);
        var loginUrl = $"{values.ServiceLayerUrl.TrimEnd('/')}/Login";
        string? cookieHeader = null;

        try
        {
            // Deliberately StringContent, not JsonContent/PostAsJsonAsync — mirrors
            // SapServiceLayerSessionManager.LoginAsync's documented quirk for this
            // environment's Service Layer. Kept as an independent, throwaway login:
            // this NEVER calls into ISapServiceLayerSessionManager, so it can never
            // evict or overwrite a real cached session for a live company.
            var json = JsonSerializer.Serialize(new { CompanyDB = values.SapCompanyDb, UserName = values.SapUsername, Password = values.SapPassword });
            using var request = new HttpRequestMessage(HttpMethod.Post, loginUrl)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json")
            };
            using var response = await client.SendAsync(request, ct);

            if (!response.IsSuccessStatusCode)
            {
                string? sapErrorDetail = null;
                try { sapErrorDetail = await response.Content.ReadAsStringAsync(ct); } catch { /* non-fatal */ }
                _logger.LogWarning(
                    "SAP Service Layer test login failed for company {Code} ({StatusCode}): {SapError}",
                    companyCodeForLogging, (int)response.StatusCode, sapErrorDetail);
                return new TestConnectionResultDto { Success = false, Message = "SAP Business One Service Layer authentication failed." };
            }

            if (response.Headers.TryGetValues("Set-Cookie", out var cookies))
            {
                cookieHeader = string.Join("; ", cookies.Select(c => c.Split(';', 2)[0].Trim()).Where(c => c.Length > 0));
            }

            return new TestConnectionResultDto { Success = true, Message = "SAP Business One Service Layer connection successful." };
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            _logger.LogWarning(ex, "Could not reach the SAP B1 Service Layer for test at {Url}.", values.ServiceLayerUrl);
            return new TestConnectionResultDto { Success = false, Message = "Could not reach the SAP Business One Service Layer." };
        }
        finally
        {
            // Best-effort logout of this throwaway session — never let a test
            // leak a live SAP B1 session slot. Failure here is non-fatal.
            if (!string.IsNullOrEmpty(cookieHeader))
            {
                try
                {
                    using var logoutRequest = new HttpRequestMessage(HttpMethod.Post, $"{values.ServiceLayerUrl.TrimEnd('/')}/Logout");
                    logoutRequest.Headers.Add("Cookie", cookieHeader);
                    using var _ = await client.SendAsync(logoutRequest, ct);
                }
                catch { /* best-effort only */ }
            }
        }
    }

    private static string BuildSqlConnectionString(string server, string database, string username, string password, string? extraOptions, int? connectTimeoutSeconds = null)
    {
        var builder = new StringBuilder();
        builder.Append($"Server={server};Database={database};User Id={username};Password={password};");
        if (connectTimeoutSeconds is int timeout)
            builder.Append($"Connect Timeout={timeout};");
        if (!string.IsNullOrWhiteSpace(extraOptions))
            builder.Append(extraOptions.TrimEnd(';')).Append(';');
        return builder.ToString();
    }

    private static async Task<ServerConfigurationRow?> GetRowAsync(System.Data.IDbConnection db, int id, CancellationToken ct)
    {
        const string sql = @"
            SELECT Id, CompanyCode, CompanyName, SapCompanyDb, ServiceLayerUrl, SapUsername, SapPasswordEncrypted,
                   SqlServer, SqlDatabase, SqlUsername, SqlPasswordEncrypted, SqlExtraOptions, IsActive,
                   LastTestedAtUtc, LastTestResult, CreatedAt, UpdatedAt
            FROM ServerConfigurations
            WHERE Id = @Id";

        return await db.QuerySingleOrDefaultAsync<ServerConfigurationRow>(new CommandDefinition(sql, new { Id = id }, cancellationToken: ct));
    }

    private async Task<string?> FindSoftDuplicateNoteAsync(System.Data.IDbConnection db, string sapCompanyDb, string serviceLayerUrl, int? excludeId, CancellationToken ct)
    {
        const string sql = @"
            SELECT TOP 1 CompanyCode FROM ServerConfigurations
            WHERE SapCompanyDb = @SapCompanyDb AND ServiceLayerUrl = @ServiceLayerUrl AND IsActive = 1
              AND (@ExcludeId IS NULL OR Id <> @ExcludeId)";

        var other = await db.QuerySingleOrDefaultAsync<string>(new CommandDefinition(
            sql, new { SapCompanyDb = sapCompanyDb, ServiceLayerUrl = serviceLayerUrl, ExcludeId = excludeId }, cancellationToken: ct));

        return other is null ? null : $"Note: company code '{other}' already points at the same SAP CompanyDB/Service Layer URL.";
    }

    /// <summary>Internal row shape only — includes encrypted secrets, never mapped
    /// directly to an API response.</summary>
    private class ServerConfigurationRow
    {
        public int Id { get; set; }
        public string CompanyCode { get; set; } = string.Empty;
        public string CompanyName { get; set; } = string.Empty;
        public string SapCompanyDb { get; set; } = string.Empty;
        public string ServiceLayerUrl { get; set; } = string.Empty;
        public string SapUsername { get; set; } = string.Empty;
        public string SapPasswordEncrypted { get; set; } = string.Empty;
        public string SqlServer { get; set; } = string.Empty;
        public string SqlDatabase { get; set; } = string.Empty;
        public string SqlUsername { get; set; } = string.Empty;
        public string SqlPasswordEncrypted { get; set; } = string.Empty;
        public string? SqlExtraOptions { get; set; }
        public bool IsActive { get; set; }
        public DateTime? LastTestedAtUtc { get; set; }
        public string? LastTestResult { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }
}
