using System.Data;
using Microsoft.Data.SqlClient;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Data;

/// <summary>
/// Opens a SQL Server connection to whichever SAP B1 company database the
/// CURRENT request is authenticated against (ICompanyContext, sourced only
/// from the already-validated JWT). The company code is used purely as a
/// dictionary key into a set of connection strings built from configuration at
/// startup — it is never concatenated into a connection string or SQL text —
/// and it is re-validated against the server-side allow-list (ICompanyRegistry)
/// here as defense in depth, even though it can only ever have come from a
/// signed JWT claim in the first place.
///
/// Each company's connection string is supplied via
/// 'dotnet user-secrets set "CompanyConnectionStrings:{Code}" "..."' in
/// development, or the CompanyConnectionStrings__{Code} environment variable
/// in production — never in appsettings.json. This replaces the single fixed
/// ConnectionStrings:SapB1Db used before multi-company support; see README.
/// </summary>
public class CompanyConnectionFactory : ICompanyConnectionFactory
{
    private readonly ICompanyContext _companyContext;
    private readonly ICompanyRegistry _registry;
    private readonly ICompanyConfigurationProvider _dbConfig;
    private readonly IReadOnlyDictionary<string, string> _connectionStrings;

    public CompanyConnectionFactory(
        ICompanyContext companyContext,
        ICompanyRegistry registry,
        ICompanyConfigurationProvider dbConfig,
        IConfiguration configuration)
    {
        _companyContext = companyContext;
        _registry = registry;
        _dbConfig = dbConfig;

        _connectionStrings = configuration
            .GetSection("CompanyConnectionStrings")
            .GetChildren()
            .Where(c => !string.IsNullOrWhiteSpace(c.Value))
            .ToDictionary(c => c.Key, c => c.Value!, StringComparer.OrdinalIgnoreCase);
    }

    public IDbConnection CreateConnection()
    {
        var code = _companyContext.CompanyCode;
        if (string.IsNullOrWhiteSpace(code))
        {
            throw new UnauthorizedAccessException("Request has no authenticated company context.");
        }

        // Defense in depth: re-check the allow-list even though `code` can only
        // ever have come from a signed, already-validated JWT claim.
        if (_registry.FindByCode(code) is null)
        {
            throw new UnauthorizedAccessException($"Company '{code}' is not a configured company database.");
        }

        // Database-driven configuration (Administration → Server / Company
        // Configuration) takes priority; fall back to file/user-secrets
        // configuration for any company not yet migrated there.
        if (_dbConfig.TryGet(code, out var db))
        {
            return new SqlConnection(db.SqlConnectionString);
        }

        if (!_connectionStrings.TryGetValue(code, out var cs) || string.IsNullOrWhiteSpace(cs))
        {
            throw new InvalidOperationException(
                $"No connection string configured for company '{code}'. Set it via " +
                $"'dotnet user-secrets set \"CompanyConnectionStrings:{code}\" \"...\"' in development, " +
                $"or the CompanyConnectionStrings__{code} environment variable in production, " +
                $"or add it via Administration → Server / Company Configuration. See README section 4.");
        }

        return new SqlConnection(cs);
    }
}
