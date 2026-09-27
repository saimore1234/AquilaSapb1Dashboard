using Microsoft.Extensions.Options;
using SAPB1.Api.Interfaces;
using SAPB1.Api.Models;

namespace SAPB1.Api.Auth;

/// <summary>
/// The file-configured half is built once at startup from the "CompanyDatabases"
/// config section (appsettings.json — no secrets); the database-driven half is
/// consulted first via ICompanyConfigurationProvider (Administration → Server /
/// Company Configuration), falling back to the file list for any company code
/// not yet migrated there. Every company lookup in the app — at login, and
/// again defensively inside CompanyConnectionFactory — goes through this class,
/// so there is exactly one place that defines which company codes are valid.
/// </summary>
public class CompanyRegistry : ICompanyRegistry
{
    private readonly Dictionary<string, CompanyEntry> _byCode;
    private readonly ICompanyConfigurationProvider _dbConfig;

    public CompanyRegistry(IOptions<CompanyDatabaseOptions> options, ICompanyConfigurationProvider dbConfig)
    {
        _byCode = options.Value.Companies
            .Where(c => !string.IsNullOrWhiteSpace(c.Code))
            .ToDictionary(c => c.Code, StringComparer.OrdinalIgnoreCase);
        _dbConfig = dbConfig;
    }

    public IReadOnlyList<CompanyOption> GetPublicCompanyList()
    {
        var byCode = new Dictionary<string, CompanyOption>(StringComparer.OrdinalIgnoreCase);

        foreach (var c in _byCode.Values)
        {
            byCode[c.Code] = new CompanyOption(c.Code, c.Name);
        }

        // Database-driven companies take priority over a same-coded file entry.
        foreach (var c in _dbConfig.GetAll())
        {
            byCode[c.Code] = new CompanyOption(c.Code, c.Name);
        }

        return byCode.Values.ToList();
    }

    public CompanyEntry? FindByCode(string code)
    {
        if (string.IsNullOrWhiteSpace(code)) return null;

        if (_dbConfig.TryGet(code, out var db))
        {
            return new CompanyEntry
            {
                Code = db.Code,
                Name = db.Name,
                ServiceLayerCompanyDb = db.SapCompanyDb,
                ServiceLayerUrl = db.ServiceLayerUrl
            };
        }

        return _byCode.GetValueOrDefault(code);
    }
}
