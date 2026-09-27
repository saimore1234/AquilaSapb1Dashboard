using System.ComponentModel.DataAnnotations;

namespace SAPB1.Api.DTOs.Auth;

public class LoginRequestDto
{
    [Required]
    public string CompanyDb { get; set; } = string.Empty;

    [Required]
    public string Username { get; set; } = string.Empty;

    [Required]
    public string Password { get; set; } = string.Empty;
}

public class LoginResponseDto
{
    public string Token { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;

    /// <summary>Portal company code, e.g. "STEST" — also the JWT's "companyDb" claim.</summary>
    public string Company { get; set; } = string.Empty;

    public string CompanyName { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public int ExpiresIn { get; set; } // seconds until expiry
    public DateTime ExpiresAtUtc { get; set; }
}

/// <summary>What GET /api/auth/companies returns — safe for an anonymous login dropdown.</summary>
public class CompanyOptionDto
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
}
