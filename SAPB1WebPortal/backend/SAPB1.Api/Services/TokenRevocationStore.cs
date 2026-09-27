using System.Collections.Concurrent;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Services;

/// <summary>
/// In-memory revocation list keyed by JWT "jti" so POST /api/auth/logout can
/// actually invalidate a token immediately, even though JWTs are otherwise
/// stateless and would normally stay valid until their natural expiry.
/// Registered as a Singleton — single-process / in-memory is fine for Phase 1
/// (one API instance). If this API is ever scaled to multiple instances,
/// replace this with a distributed cache (e.g. Redis) so every instance shares
/// the same revocation list.
/// </summary>
public class TokenRevocationStore : ITokenRevocationStore
{
    private readonly ConcurrentDictionary<string, DateTime> _revokedJtiToExpiry = new();

    public void Revoke(string jti, DateTime expiresAtUtc)
    {
        if (string.IsNullOrWhiteSpace(jti)) return;
        _revokedJtiToExpiry[jti] = expiresAtUtc;
        PruneExpired();
    }

    public bool IsRevoked(string jti)
    {
        if (string.IsNullOrWhiteSpace(jti)) return false;
        return _revokedJtiToExpiry.ContainsKey(jti);
    }

    // Keeps the dictionary from growing forever: entries past their own token's
    // natural expiry are safe to drop, since the JWT would be rejected as
    // expired anyway.
    private void PruneExpired()
    {
        var now = DateTime.UtcNow;
        foreach (var (jti, expiresAtUtc) in _revokedJtiToExpiry)
        {
            if (expiresAtUtc < now)
            {
                _revokedJtiToExpiry.TryRemove(jti, out _);
            }
        }
    }
}
