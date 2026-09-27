using System.Security.Cryptography;

namespace SAPB1.Api.Auth;

/// <summary>
/// PBKDF2 password hashing for the portal's own shared login (see
/// AuthService — this is NOT SAP B1 authentication; it gates who may open the
/// portal and pick a company, independent of SAP B1's own user accounts).
/// Stored format: "{iterations}.{saltBase64}.{hashBase64}". Used both to
/// verify logins and (via the standalone HashPassword) to generate the hash
/// you put into User Secrets for Auth:PortalPasswordHash — see README section 7.
/// </summary>
public static class PasswordHasher
{
    private const int SaltSize = 16;
    private const int HashSize = 32;
    private const int DefaultIterations = 100_000;

    public static string HashPassword(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, DefaultIterations, HashAlgorithmName.SHA256, HashSize);
        return $"{DefaultIterations}.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    public static bool Verify(string password, string storedHash)
    {
        var parts = storedHash.Split('.', 3);
        if (parts.Length != 3) return false;

        var iterations = int.Parse(parts[0]);
        var salt = Convert.FromBase64String(parts[1]);
        var expectedHash = Convert.FromBase64String(parts[2]);

        var actualHash = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, expectedHash.Length);
        return CryptographicOperations.FixedTimeEquals(actualHash, expectedHash);
    }
}
