namespace SAPB1.Api.Auth;

/// <summary>Rules for NEW passwords only (set by an administrator, or chosen by the user). Existing passwords are never re-checked, so nobody is locked out by this.</summary>
public static class PasswordPolicy
{
    public const int MinLength = 8;

    /// <summary>Returns the reason a password is not acceptable, or null when it is fine.</summary>
    public static string? Validate(string? password, string? username)
    {
        if (string.IsNullOrEmpty(password) || password.Length < MinLength) return $"Password must be at least {MinLength} characters.";
        if (password.Length > 128) return "Password is too long (128 characters at most).";
        if (!password.Any(char.IsLetter) || !password.Any(char.IsDigit)) return "Password must contain at least one letter and one number.";
        if (!string.IsNullOrWhiteSpace(username) && password.Contains(username.Trim(), StringComparison.OrdinalIgnoreCase)) return "Password must not contain the username.";
        return null;
    }
}
