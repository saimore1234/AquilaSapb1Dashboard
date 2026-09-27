using SAPB1.Api.Models;

namespace SAPB1.Api.Interfaces;

/// <summary>
/// Validates a company code against the server-side allow-list, then verifies
/// the SAP B1 username/password for that company via ISapB1Authenticator (real
/// SAP Business One Service Layer authentication). Replaces the Phase 1
/// placeholder portal-login-list approach — every login is now checked against
/// actual SAP Business One, not a locally stored password.
/// </summary>
public interface IAuthService
{
    Task<(bool Success, AuthenticatedUser? User)> ValidateCredentialsAsync(
        string companyCode, string username, string password, CancellationToken ct = default);
}

/// <summary>Issues application JWTs for an already-authenticated SAP B1 user.</summary>
public interface ITokenService
{
    (string Token, DateTime ExpiresAtUtc) GenerateToken(AuthenticatedUser user);
}
