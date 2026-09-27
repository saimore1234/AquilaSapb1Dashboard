using Microsoft.AspNetCore.DataProtection;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Auth;

/// <summary>
/// Reversible protection for stored SAP/SQL passwords (Server / Company
/// Configuration), backed by the ASP.NET Core Data Protection API — authenticated
/// encryption (AES-256-CBC + HMAC) with automatic key rotation, ships in the Web
/// SDK already targeted by this project (no new package). NOT PasswordHasher,
/// which is one-way PBKDF2 for the portal's own login only.
///
/// The key ring is persisted to a fixed folder (see Program.cs
/// AddDataProtection/PersistKeysToFileSystem — DataProtection:KeysDirectory)
/// rather than the default per-user-profile location, so it survives IIS
/// app-pool identity changes and redeploys. BACK UP THAT FOLDER: if it is ever
/// lost, every stored secret becomes permanently undecryptable — Unprotect will
/// throw, which callers turn into a per-row "test failed" / "re-enter password"
/// UX rather than a crash (see SqlServerConfigurationService).
/// </summary>
public class DataProtectionSecretProtector : ISecretProtector
{
    private const string Purpose = "SAPB1.Api.ServerConfiguration.v1";

    private readonly IDataProtector _protector;

    public DataProtectionSecretProtector(IDataProtectionProvider provider)
    {
        _protector = provider.CreateProtector(Purpose);
    }

    public string Protect(string plaintext) => _protector.Protect(plaintext);

    public string Unprotect(string protectedText) => _protector.Unprotect(protectedText);
}
