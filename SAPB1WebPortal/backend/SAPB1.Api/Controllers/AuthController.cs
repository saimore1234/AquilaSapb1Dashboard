using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SAPB1.Api.Auth;
using SAPB1.Api.DTOs.Admin;
using SAPB1.Api.DTOs.Auth;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.Interfaces;
using SAPB1.Api.Models;
using SAPB1.Api.Services;

namespace SAPB1.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly ITokenService _tokenService;
    private readonly ICompanyRegistry _companyRegistry;
    private readonly ITokenRevocationStore _revocationStore;
    private readonly IAdminService _adminService;
    private readonly ISecurityService _security;
    private readonly LoginAttemptTracker _attempts;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IAuthService authService,
        ITokenService tokenService,
        ICompanyRegistry companyRegistry,
        ITokenRevocationStore revocationStore,
        IAdminService adminService,
        ISecurityService security,
        LoginAttemptTracker attempts,
        ILogger<AuthController> logger)
    {
        _security = security;
        _attempts = attempts;
        _authService = authService;
        _tokenService = tokenService;
        _companyRegistry = companyRegistry;
        _revocationStore = revocationStore;
        _adminService = adminService;
        _logger = logger;
    }

    /// <summary>
    /// GET /api/auth/companies — public list of configured SAP B1 company
    /// databases for the login dropdown. Never returns connection strings, SQL
    /// credentials, or Service Layer URLs.
    /// </summary>
    [HttpGet("companies")]
    [AllowAnonymous]
    public ActionResult<ApiResponse<List<CompanyOptionDto>>> GetCompanies()
    {
        var companies = _companyRegistry.GetPublicCompanyList()
            .Select(c => new CompanyOptionDto { Code = c.Code, Name = c.Name })
            .OrderBy(c => c.Name)
            .ToList();

        return Ok(ApiResponse<List<CompanyOptionDto>>.Ok(companies));
    }

    /// <summary>
    /// POST /api/auth/login — validates the chosen company against the
    /// server-side allow-list, then verifies the SAP B1 username/password
    /// against that company's real SAP Business One Service Layer, and returns
    /// a JWT scoped to that company. Every later request derives its company
    /// context only from this token — never from anything the client sends
    /// per-request.
    /// </summary>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<ApiResponse<LoginResponseDto>>> Login([FromBody] LoginRequestDto request, CancellationToken ct)
    {
        if (!ModelState.IsValid)
            return BadRequest(ApiResponse<LoginResponseDto>.Fail("Company, username and password are required."));

        var locked = _attempts.MinutesLocked(request.Username);
        if (locked > 0)
        {
            await _security.AuditAsync("LoginBlocked", request.Username, null, $"Account locked; {locked} min left", false);
            return StatusCode(StatusCodes.Status429TooManyRequests,
                ApiResponse<LoginResponseDto>.Fail($"Too many failed sign-in attempts. Try again in {locked} minute(s)."));
        }

        var (success, user) = await _authService.ValidateCredentialsAsync(request.CompanyDb, request.Username, request.Password, ct);
        if (!success || user is null)
        {
            var nowLocked = _attempts.RecordFailure(request.Username);
            await _security.AuditAsync("LoginFailed", request.Username, null, request.CompanyDb, false);
            if (nowLocked) await _security.AuditAsync("AccountLocked", request.Username, null, "Too many failed sign-in attempts", false);
            // Intentionally generic — do not reveal whether the company or username exists.
            return Unauthorized(ApiResponse<LoginResponseDto>.Fail("Invalid company, username or password."));
        }
        _attempts.RecordSuccess(request.Username);
        await _security.AuditAsync("Login", user.Username, null, user.CompanyCode);

        var (token, expiresAtUtc) = _tokenService.GenerateToken(user);

        var response = new LoginResponseDto
        {
            Token = token,
            Username = user.Username,
            Company = user.CompanyCode,
            CompanyName = user.CompanyName,
            Role = user.Role,
            ExpiresAtUtc = expiresAtUtc,
            ExpiresIn = Math.Max(0, (int)(expiresAtUtc - DateTime.UtcNow).TotalSeconds),
            MustChangePassword = user.MustChangePassword
        };

        return Ok(ApiResponse<LoginResponseDto>.Ok(response, "Login successful."));
    }

    /// <summary>
    /// POST /api/auth/change-password — the signed-in user sets a new password (current password required). Works for accounts flagged to change a
    /// temporary password too. Returns a fresh token (without the "must change" restriction); the old one is revoked.
    /// </summary>
    [HttpPost("change-password")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<LoginResponseDto>>> ChangePassword([FromBody] ChangePasswordRequestDto request, CancellationToken ct)
    {
        var username = User.Identity?.Name ?? "";
        if (!int.TryParse(User.FindFirstValue("userId"), out var userId))
            return BadRequest(ApiResponse<LoginResponseDto>.Fail("This account's password is managed in the server configuration."));

        if (_attempts.MinutesLocked(username) > 0)
            return StatusCode(StatusCodes.Status429TooManyRequests, ApiResponse<LoginResponseDto>.Fail("Too many failed attempts. Try again later."));

        var record = await _adminService.GetUserByUsernameAsync(username, ct);
        if (record is null || !record.IsActive || !PasswordHasher.Verify(request.CurrentPassword ?? "", record.PasswordHash))
        {
            _attempts.RecordFailure(username);
            await _security.AuditAsync("PasswordChangeFailed", username, null, "Wrong current password", false);
            return BadRequest(ApiResponse<LoginResponseDto>.Fail("Your current password is not correct."));
        }

        var problem = PasswordPolicy.Validate(request.NewPassword, username);
        if (problem is not null) return BadRequest(ApiResponse<LoginResponseDto>.Fail(problem));
        if (request.NewPassword == request.CurrentPassword) return BadRequest(ApiResponse<LoginResponseDto>.Fail("The new password must be different from the current one."));

        await _security.SetPasswordAsync(userId, PasswordHasher.HashPassword(request.NewPassword!), false, ct);
        _attempts.RecordSuccess(username);
        await _security.AuditAsync("PasswordChanged", username, username);

        var jti = User.FindFirstValue(JwtRegisteredClaimNames.Jti);
        if (!string.IsNullOrEmpty(jti) && long.TryParse(User.FindFirstValue(JwtRegisteredClaimNames.Exp), out var exp))
            _revocationStore.Revoke(jti, DateTimeOffset.FromUnixTimeSeconds(exp).UtcDateTime);

        var fresh = new AuthenticatedUser
        {
            Username = record.Username,
            CompanyCode = User.FindFirstValue(AppClaimTypes.CompanyDb) ?? "",
            CompanyName = User.FindFirstValue(AppClaimTypes.CompanyName) ?? "",
            Role = record.RoleName ?? "",
            UserId = userId
        };
        var (token, expiresAtUtc) = _tokenService.GenerateToken(fresh);
        return Ok(ApiResponse<LoginResponseDto>.Ok(new LoginResponseDto
        {
            Token = token, Username = fresh.Username, Company = fresh.CompanyCode, CompanyName = fresh.CompanyName, Role = fresh.Role,
            ExpiresAtUtc = expiresAtUtc, ExpiresIn = Math.Max(0, (int)(expiresAtUtc - DateTime.UtcNow).TotalSeconds)
        }, "Password changed."));
    }

    /// <summary>
    /// POST /api/auth/logout — revokes the caller's current JWT immediately
    /// (see ITokenRevocationStore) instead of leaving it valid until its
    /// natural expiry. Requires a valid bearer token.
    /// </summary>
    [HttpPost("logout")]
    [Authorize]
    public ActionResult<ApiResponse<object>> Logout()
    {
        var jti = User.FindFirstValue(JwtRegisteredClaimNames.Jti);
        var expClaim = User.FindFirstValue(JwtRegisteredClaimNames.Exp);

        if (!string.IsNullOrEmpty(jti) && long.TryParse(expClaim, out var expUnixSeconds))
        {
            var expiresAtUtc = DateTimeOffset.FromUnixTimeSeconds(expUnixSeconds).UtcDateTime;
            _revocationStore.Revoke(jti, expiresAtUtc);
        }

        return Ok(ApiResponse<object>.Ok(new { }, "Logged out."));
    }

    /// <summary>
    /// GET /api/auth/me — the caller's identity plus their resolved permission set,
    /// for the frontend to gate navigation/buttons (UX only; the backend enforces
    /// permissions independently via RequirePermissionAttribute on every endpoint).
    /// The portal Admin superuser gets IsSuperUser=true instead of a DB lookup —
    /// it is never a row in the Users table.
    /// </summary>
    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<ApiResponse<CurrentUserDto>>> Me(CancellationToken ct)
    {
        var isAdmin = User.IsInRole(Roles.Admin);
        var role = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;

        var access = isAdmin ? new RoleAccess(true) : await _adminService.GetRoleAccessAsync(role, ct);

        var dto = new CurrentUserDto
        {
            Username = User.Identity?.Name ?? string.Empty,
            Role = role,
            Company = User.FindFirstValue(AppClaimTypes.CompanyDb) ?? string.Empty,
            CompanyName = User.FindFirstValue(AppClaimTypes.CompanyName) ?? string.Empty,
            IsSuperUser = access.IsFullAccess,
            MustChangePassword = User.HasClaim(AppClaimTypes.MustChangePassword, "1"),
            Permissions = access.ModuleKeys.ToList(),
            PageRules = access.PageRules.ToDictionary(kv => kv.Key, kv => kv.Value)
        };

        // Salesperson scope: tells the UI which salespersons this login is limited to (the SERVER enforces it either way).
        var scope = HttpContext.RequestServices.GetRequiredService<ISalesScope>().Current;
        dto.SalesScope = new SalesScopeDto { Restricted = scope.Restricted, Linked = scope.SlpCodes.Length > 0, OwnTargetsOnly = scope.RoleRestricted };
        if (scope.SlpCodes.Length > 0)
        {
            try
            {
                using var db = HttpContext.RequestServices.GetRequiredService<ICompanyConnectionFactory>().CreateUnscopedConnection();
                dto.SalesScope.Salespersons = (await Dapper.SqlMapper.QueryAsync<SalesScopePersonDto>(db, new Dapper.CommandDefinition(
                    "SELECT SlpCode AS Code, SlpName AS Name FROM OSLP WHERE SlpCode IN @Codes ORDER BY SlpName", new { Codes = scope.SlpCodes }, cancellationToken: ct))).ToList();
            }
            catch (Exception) { /* names are cosmetic */ }
        }

        return Ok(ApiResponse<CurrentUserDto>.Ok(dto));
    }
}
