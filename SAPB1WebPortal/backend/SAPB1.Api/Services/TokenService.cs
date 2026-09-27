using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using SAPB1.Api.Auth;
using SAPB1.Api.Interfaces;
using SAPB1.Api.Models;

namespace SAPB1.Api.Services;

public class TokenService : ITokenService
{
    private readonly JwtOptions _options;

    public TokenService(IOptions<JwtOptions> options)
    {
        _options = options.Value;
        if (string.IsNullOrWhiteSpace(_options.Key) || _options.Key.Length < 32)
        {
            throw new InvalidOperationException(
                "Jwt:Key is missing or too short. Set it via 'dotnet user-secrets set \"Jwt:Key\" \"<32+ random chars>\"' " +
                "in development or the Jwt__Key environment variable in production.");
        }
    }

    public (string Token, DateTime ExpiresAtUtc) GenerateToken(AuthenticatedUser user)
    {
        var expires = DateTime.UtcNow.AddMinutes(_options.ExpiryMinutes);

        // "companyDb" is the claim every downstream request is scoped by — see
        // CompanyContext / CompanyConnectionFactory. It is set here, once, at
        // login time, from the already-validated company the user authenticated
        // against; nothing later in the pipeline ever re-derives it from
        // anything the client sends.
        var claims = new List<Claim>
        {
            new(ClaimTypes.Name, user.Username),
            new(ClaimTypes.Role, user.Role),
            new(AppClaimTypes.CompanyDb, user.CompanyCode),
            new(AppClaimTypes.CompanyName, user.CompanyName),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        // Only present for RBAC-backed users (see AuthenticatedUser.UserId) — the
        // portal admin's token is otherwise byte-for-byte unchanged from before RBAC.
        if (user.UserId.HasValue)
        {
            claims.Add(new Claim("userId", user.UserId.Value.ToString()));
        }

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.Key));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _options.Issuer,
            audience: _options.Audience,
            claims: claims,
            expires: expires,
            signingCredentials: creds);

        return (new JwtSecurityTokenHandler().WriteToken(token), expires);
    }
}
