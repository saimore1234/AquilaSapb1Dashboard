using SAPB1.Api.Auth;
using SAPB1.Api.Interfaces;
using SAPB1.Api.Models;

namespace SAPB1.Api.Services;

// NOTE ON RBAC (added after the class doc below was written): AuthService now
// tries the single portal-admin credential FIRST, completely unchanged from
// before RBAC existed. Only if that fails does it fall back to checking the
// new Users table (SqlAdminService) added for role/permission-based access —
// see the bottom of ValidateCredentialsAsync. The portal admin is never a row
// in that table; it keeps working exactly as documented below regardless of
// anything in the RBAC system.

/// <summary>
/// Validates a company code against the server-side allow-list
/// (ICompanyRegistry), then checks the entered username/password against a
/// single portal-managed credential (Auth:PortalUsername /
/// Auth:PortalPasswordHash in user-secrets) — NOT against SAP B1 itself.
///
/// This project originally verified credentials against the real SAP Business
/// One Service Layer (see SapServiceLayerAuthenticator, still present and
/// registered as ISapB1Authenticator, just not called from here). That was
/// switched off deliberately: this environment's SAP B1 Service Layer sits
/// behind an SLD (System Landscape Directory) / Keycloak SSO layer that is
/// intermittently failing server-side (error -304 "Fail to NONE-SSO login
/// from SLD"), independent of whether the SAP B1 password is correct — that
/// is a SAP B1 server configuration/licensing issue, not something fixable
/// from this codebase. Re-enabling real SAP B1 auth later is a small,
/// contained change: make this class depend on ISapB1Authenticator again and
/// call it instead of the checks below — nothing else in the auth pipeline
/// (JWT issuing, company context, controllers) needs to change either way.
///
/// The one login gates the portal only; which SAP B1 company database gets
/// read from is still decided per the chosen company and enforced entirely
/// server-side via ICompanyRegistry / ICompanyConnectionFactory, exactly as
/// before — this change affects only "who may open the portal", not "which
/// database a request can reach".
/// </summary>
public class AuthService : IAuthService
{
    private readonly ICompanyRegistry _companyRegistry;
    private readonly IConfiguration _configuration;
    private readonly IAdminService _adminService;
    private readonly ILogger<AuthService> _logger;

    public AuthService(
        ICompanyRegistry companyRegistry,
        IConfiguration configuration,
        IAdminService adminService,
        ILogger<AuthService> logger)
    {
        _companyRegistry = companyRegistry;
        _configuration = configuration;
        _adminService = adminService;
        _logger = logger;
    }

    public async Task<(bool Success, AuthenticatedUser? User)> ValidateCredentialsAsync(
        string companyCode, string username, string password, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(companyCode) || string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
        {
            return (false, null);
        }

        var company = _companyRegistry.FindByCode(companyCode);
        if (company is null)
        {
            _logger.LogWarning("Login failed: unknown company code attempted.");
            return (false, null);
        }

        var portalUsername = _configuration["Auth:PortalUsername"];
        var portalPasswordHash = _configuration["Auth:PortalPasswordHash"];

        if (string.IsNullOrWhiteSpace(portalUsername) || string.IsNullOrWhiteSpace(portalPasswordHash))
        {
            _logger.LogError(
                "Portal login is not configured. Set Auth:PortalUsername and Auth:PortalPasswordHash via " +
                "'dotnet user-secrets' — see README section 7.");
            return (false, null);
        }

        var usernameMatches = string.Equals(username, portalUsername, StringComparison.OrdinalIgnoreCase);
        var passwordMatches = usernameMatches && PasswordHasher.Verify(password, portalPasswordHash);

        if (usernameMatches && passwordMatches)
        {
            var adminUser = new AuthenticatedUser
            {
                Username = username,
                CompanyCode = company.Code,
                CompanyName = company.Name,
                Role = Roles.Admin
            };

            return (true, adminUser);
        }

        // Not the portal admin — check the RBAC-backed Users table (added for
        // Administration/roles/permissions; see Interfaces/IAdminInterfaces.cs).
        // This never runs for a correct admin login above, so admin's behavior
        // is completely unaffected by anything below.
        var record = await _adminService.GetUserByUsernameAsync(username, ct);
        if (record is null || !record.IsActive || string.IsNullOrEmpty(record.RoleName))
        {
            _logger.LogWarning("Login failed: bad credentials for company {Code}.", company.Code);
            return (false, null);
        }

        if (!PasswordHasher.Verify(password, record.PasswordHash))
        {
            _logger.LogWarning("Login failed: bad credentials for company {Code}.", company.Code);
            return (false, null);
        }

        await _adminService.RecordLoginAsync(record.Id, ct);

        var user = new AuthenticatedUser
        {
            Username = record.Username,
            CompanyCode = company.Code,
            CompanyName = company.Name,
            Role = record.RoleName,
            UserId = record.Id
        };

        return (true, user);
    }
}
