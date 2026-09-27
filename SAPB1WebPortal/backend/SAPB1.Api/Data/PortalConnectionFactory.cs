using System.Data;
using Microsoft.Data.SqlClient;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Data;

/// <summary>
/// Opens a connection to the portal's own database (SAPB1PortalAdmin by default),
/// configured once via "PortalDb:ConnectionString" in user-secrets/environment —
/// never per-company. This is deliberately simpler than CompanyConnectionFactory:
/// there is exactly one portal database shared across every SAP B1 company, per the
/// project owner's explicit decision (RBAC is global, not company-specific).
/// </summary>
public class PortalConnectionFactory : IPortalConnectionFactory
{
    private readonly string _connectionString;

    public PortalConnectionFactory(IConfiguration configuration)
    {
        _connectionString = configuration["PortalDb:ConnectionString"]
            ?? throw new InvalidOperationException(
                "PortalDb:ConnectionString is not configured. Set it via " +
                "'dotnet user-secrets set \"PortalDb:ConnectionString\" \"...\"' in development, " +
                "or the PortalDb__ConnectionString environment variable in production.");
    }

    public IDbConnection CreateConnection() => new SqlConnection(_connectionString);
}
