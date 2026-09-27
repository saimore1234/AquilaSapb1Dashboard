using System.Data;
using SAPB1.Api.Models;

namespace SAPB1.Api.Interfaces;

/// <summary>Public-safe metadata for one configured SAP B1 company database —
/// exactly what GET /api/auth/companies returns. No connection info.</summary>
public record CompanyOption(string Code, string Name);

/// <summary>
/// Server-side allow-list of SAP B1 company databases this portal is configured
/// for. The frontend never sends a raw database name — it only ever sends the
/// company's portal Code at login (chosen from this list), and every request
/// after that is scoped by the company baked into the JWT, not by client input.
/// </summary>
public interface ICompanyRegistry
{
    IReadOnlyList<CompanyOption> GetPublicCompanyList();
    CompanyEntry? FindByCode(string code);
}

/// <summary>The company the CURRENT authenticated request is scoped to, resolved
/// from the validated JWT's "companyDb" claim — never from a query string,
/// header, or request body, so a client can never switch databases mid-session
/// by sending a different value.</summary>
public interface ICompanyContext
{
    string CompanyCode { get; }
    string Username { get; }
}

/// <summary>Opens a read-only ADO.NET connection to the SQL Server database
/// backing the CURRENTLY AUTHENTICATED company (ICompanyContext), resolved only
/// through the server-side allow-list (ICompanyRegistry) — never from client
/// input, and never by concatenating a database name into a connection string
/// or SQL text.</summary>
public interface ICompanyConnectionFactory
{
    IDbConnection CreateConnection();
}

/// <summary>Verifies an SAP B1 username/password against the real SAP Business
/// One Service Layer for a given company. A true result means SAP B1 itself
/// authenticated this exact credential pair — this is genuine SAP B1 identity
/// verification, never a comparison against a locally stored password.</summary>
public interface ISapB1Authenticator
{
    Task<bool> ValidateCredentialsAsync(CompanyEntry company, string username, string password, CancellationToken ct = default);
}

/// <summary>
/// Tracks revoked JWTs (by "jti" claim) so POST /api/auth/logout can actually
/// invalidate a token immediately, even though JWTs are otherwise stateless and
/// would normally stay valid until their natural expiry. In-memory /
/// single-instance for Phase 1 — replace with a distributed cache (e.g. Redis)
/// if the API is ever scaled out to multiple instances, since each instance
/// would otherwise keep its own separate revocation list.
/// </summary>
public interface ITokenRevocationStore
{
    void Revoke(string jti, DateTime expiresAtUtc);
    bool IsRevoked(string jti);
}
