using System.Collections.Concurrent;
using System.Text;
using System.Text.Json;
using SAPB1.Api.Interfaces;
using SAPB1.Api.Models;

namespace SAPB1.Api.Services;

/// <summary>
/// Logs into the SAP B1 Service Layer for a company and caches the resulting
/// B1SESSION/ROUTEID cookies until they're close to expiry (SAP B1 reports its
/// own session timeout in the Login response), so a burst of write requests for
/// the same company reuses one session instead of logging in every time.
///
/// This is a SEPARATE, purpose-built credential path — see
/// "SapServiceLayerCredentials:{CompanyCode}" in configuration — and is never
/// the portal's own login credential (Auth:PortalUsername/PasswordHash), which
/// only gates the portal itself and never talks to SAP B1.
/// </summary>
public class SapServiceLayerSessionManager : ISapServiceLayerSessionManager
{
    private const string HttpClientName = "SapServiceLayerWrite";

    // SAP B1 reports its own session timeout (in minutes); a session is
    // discarded this many minutes early so an in-flight request never starts
    // against a session that expires mid-call.
    private static readonly TimeSpan ExpiryBuffer = TimeSpan.FromMinutes(2);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ICompanyConfigurationProvider _dbConfig;
    private readonly ILogger<SapServiceLayerSessionManager> _logger;

    private readonly ConcurrentDictionary<string, SapServiceLayerSession> _sessions = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _loginLocks = new(StringComparer.OrdinalIgnoreCase);

    public SapServiceLayerSessionManager(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ICompanyConfigurationProvider dbConfig,
        ILogger<SapServiceLayerSessionManager> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _dbConfig = dbConfig;
        _logger = logger;
    }

    public void Invalidate(string companyCode)
    {
        _sessions.TryRemove(companyCode, out _);
    }

    public async Task<SapServiceLayerSession> GetSessionAsync(CompanyEntry company, CancellationToken ct = default)
    {
        if (_sessions.TryGetValue(company.Code, out var cached) && cached.ExpiresAtUtc > DateTime.UtcNow)
        {
            return cached;
        }

        var gate = _loginLocks.GetOrAdd(company.Code, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(ct);
        try
        {
            // Another request may have already logged in while we waited.
            if (_sessions.TryGetValue(company.Code, out cached) && cached.ExpiresAtUtc > DateTime.UtcNow)
            {
                return cached;
            }

            var session = await LoginAsync(company, ct);
            _sessions[company.Code] = session;
            return session;
        }
        finally
        {
            gate.Release();
        }
    }

    private async Task<SapServiceLayerSession> LoginAsync(CompanyEntry company, CancellationToken ct)
    {
        // Database-driven configuration (Administration → Server / Company
        // Configuration) takes priority; fall back to user-secrets/env
        // configuration for any company not yet migrated there.
        string? username;
        string? password;
        if (_dbConfig.TryGet(company.Code, out var db))
        {
            username = db.SapUsername;
            password = db.SapPassword;
        }
        else
        {
            username = _configuration[$"SapServiceLayerCredentials:{company.Code}:Username"];
            password = _configuration[$"SapServiceLayerCredentials:{company.Code}:Password"];
        }

        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
        {
            throw new SapServiceLayerNotConfiguredException(company.Code);
        }

        if (string.IsNullOrWhiteSpace(company.ServiceLayerUrl))
        {
            throw new SapServiceLayerNotConfiguredException(company.Code);
        }

        var client = _httpClientFactory.CreateClient(HttpClientName);
        var loginUrl = $"{company.ServiceLayerUrl.TrimEnd('/')}/Login";
        var serviceLayerCompanyDb = string.IsNullOrWhiteSpace(company.ServiceLayerCompanyDb)
            ? company.Code
            : company.ServiceLayerCompanyDb;

        HttpResponseMessage response;
        try
        {
            // Deliberately StringContent, not JsonContent.Create/PostAsJsonAsync: this
            // SAP B1 Service Layer install's front end returns a generic "Invalid login
            // credential" (code 206) for otherwise-correct credentials when the body
            // arrives via JsonContent (which does not pre-compute Content-Length the
            // same way), while byte-identical JSON sent through StringContent (or curl)
            // succeeds every time. Verified directly against this environment.
            var json = JsonSerializer.Serialize(new { CompanyDB = serviceLayerCompanyDb, UserName = username, Password = password });
            using var request = new HttpRequestMessage(HttpMethod.Post, loginUrl)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json")
            };
            response = await client.SendAsync(request, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            _logger.LogError(ex, "Could not reach the SAP B1 Service Layer for company {Code} at {Url}.", company.Code, company.ServiceLayerUrl);
            throw new SapServiceLayerUnavailableException(
                $"Could not reach the SAP Business One Service Layer for company '{company.Code}'.", ex);
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                string? sapErrorDetail = null;
                try { sapErrorDetail = await response.Content.ReadAsStringAsync(ct); } catch { /* non-fatal */ }

                _logger.LogError(
                    "SAP B1 Service Layer login failed for company {Code} ({StatusCode}): {SapError}",
                    company.Code, (int)response.StatusCode, sapErrorDetail);

                throw new SapServiceLayerUnavailableException(
                    $"SAP Business One Service Layer authentication failed for company '{company.Code}'.");
            }

            var cookieHeader = BuildCookieHeader(response);
            if (string.IsNullOrEmpty(cookieHeader))
            {
                throw new SapServiceLayerUnavailableException(
                    $"SAP Business One Service Layer did not return a session for company '{company.Code}'.");
            }

            var sessionTimeoutMinutes = 30d;
            try
            {
                await using var stream = await response.Content.ReadAsStreamAsync(ct);
                using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
                if (doc.RootElement.TryGetProperty("SessionTimeout", out var timeoutEl) && timeoutEl.TryGetDouble(out var minutes))
                {
                    sessionTimeoutMinutes = minutes;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not parse SessionTimeout from SAP B1 login response for company {Code}; defaulting to 30 minutes.", company.Code);
            }

            var expiry = DateTime.UtcNow.AddMinutes(sessionTimeoutMinutes) - ExpiryBuffer;
            return new SapServiceLayerSession(company.Code, cookieHeader, expiry);
        }
    }

    private static string BuildCookieHeader(HttpResponseMessage response)
    {
        if (!response.Headers.TryGetValues("Set-Cookie", out var cookies))
        {
            return string.Empty;
        }

        var parts = new List<string>();
        foreach (var cookie in cookies)
        {
            // Each Set-Cookie value looks like "B1SESSION=...;HttpOnly;;Secure;..." —
            // we only need the "name=value" pair for the request Cookie header.
            var nameValue = cookie.Split(';', 2)[0].Trim();
            if (!string.IsNullOrEmpty(nameValue))
            {
                parts.Add(nameValue);
            }
        }

        return string.Join("; ", parts);
    }
}
