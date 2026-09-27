using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Services;

/// <summary>
/// Startup-only: loads every ACTIVE dbo.ServerConfigurations row (decrypted)
/// into ICompanyConfigurationProvider once, so CompanyRegistry/
/// CompanyConnectionFactory/SapServiceLayerSessionManager can resolve
/// database-driven companies from the very first request. Wrapped in try/catch
/// so a database outage at boot never crashes the app — it just means every
/// company falls back to file/user-secrets configuration until the next
/// successful warm-up (a future edit via the admin API repopulates individual
/// entries immediately regardless of this hosted service's outcome).
/// </summary>
public class ServerConfigurationCacheWarmupService : IHostedService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ICompanyConfigurationProvider _cache;
    private readonly ILogger<ServerConfigurationCacheWarmupService> _logger;

    public ServerConfigurationCacheWarmupService(
        IServiceScopeFactory scopeFactory,
        ICompanyConfigurationProvider cache,
        ILogger<ServerConfigurationCacheWarmupService> logger)
    {
        _scopeFactory = scopeFactory;
        _cache = cache;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<IServerConfigurationService>();
            var entries = await service.LoadAllActiveForCacheAsync(cancellationToken);

            foreach (var entry in entries)
            {
                _cache.Set(entry.Code, entry);
            }

            _logger.LogInformation("Server configuration cache warm-up loaded {Count} active database-driven company/companies.", entries.Count);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Server configuration cache warm-up failed; database-driven companies are unavailable until the next successful load. File/user-secrets-configured companies are unaffected.");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
