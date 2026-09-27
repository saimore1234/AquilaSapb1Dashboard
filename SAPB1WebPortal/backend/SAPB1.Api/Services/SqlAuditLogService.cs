using Dapper;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Services;

/// <summary>
/// Writes to dbo.ServerConfigurationAuditLog (SAPB1PortalAdmin). Scoped to the
/// Server/Company Configuration feature only — not a generic audit framework.
/// Resolves "who performed this" from the current request's identity so every
/// other caller doesn't have to thread a username through each method.
/// </summary>
public class SqlAuditLogService : IAuditLogService
{
    private readonly IPortalConnectionFactory _connectionFactory;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public SqlAuditLogService(IPortalConnectionFactory connectionFactory, IHttpContextAccessor httpContextAccessor)
    {
        _connectionFactory = connectionFactory;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task LogAsync(string companyCode, int? serverConfigurationId, string action, bool success, string? detail, CancellationToken ct = default)
    {
        var performedBy = _httpContextAccessor.HttpContext?.User?.Identity?.Name;
        if (string.IsNullOrWhiteSpace(performedBy)) performedBy = "system";

        using var db = _connectionFactory.CreateConnection();
        const string sql = @"
            INSERT INTO ServerConfigurationAuditLog
                (ServerConfigurationId, CompanyCode, Action, PerformedBy, PerformedAtUtc, Success, Detail)
            VALUES
                (@ServerConfigurationId, @CompanyCode, @Action, @PerformedBy, SYSUTCDATETIME(), @Success, @Detail)";

        await db.ExecuteAsync(new CommandDefinition(sql, new
        {
            ServerConfigurationId = serverConfigurationId,
            CompanyCode = companyCode,
            Action = action,
            PerformedBy = performedBy,
            Success = success,
            Detail = detail
        }, cancellationToken: ct));
    }
}
