using System.Net.Http.Json;
using SAPB1.Api.Interfaces;
using SAPB1.Api.Models;

namespace SAPB1.Api.Services;

/// <summary>
/// Verifies SAP B1 credentials against the real SAP Business One Service Layer
/// (POST {ServiceLayerUrl}/Login). A successful (2xx) response means SAP B1
/// itself has authenticated this exact username/password for this exact
/// company database — this is genuine SAP B1 identity verification, never a
/// comparison against a locally stored copy of the password.
///
/// The Service Layer session obtained here is used ONLY to prove identity and
/// is logged out immediately afterwards — it is never reused. Phase 1's actual
/// data reads continue to go through the existing fast, read-only direct-SQL
/// path (see ICompanyConnectionFactory / SqlSapB1Service), exactly as they did
/// for the single-company version of this portal. This keeps the proven,
/// working report/list query performance while adding real SAP B1 identity
/// verification at the login boundary. A future phase that needs to WRITE to
/// SAP B1 would use Service Layer for that instead (see ISapB1Service's XML
/// docs) — this class is not that; it authenticates only.
/// </summary>
public class SapServiceLayerAuthenticator : ISapB1Authenticator
{
    private const string HttpClientName = "SapServiceLayer";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<SapServiceLayerAuthenticator> _logger;

    public SapServiceLayerAuthenticator(IHttpClientFactory httpClientFactory, ILogger<SapServiceLayerAuthenticator> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<bool> ValidateCredentialsAsync(CompanyEntry company, string username, string password, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(company.ServiceLayerUrl))
        {
            _logger.LogError("Company {Code} has no ServiceLayerUrl configured; cannot verify SAP B1 credentials.", company.Code);
            return false;
        }

        var client = _httpClientFactory.CreateClient(HttpClientName);
        var loginUrl = $"{company.ServiceLayerUrl.TrimEnd('/')}/Login";
        var serviceLayerCompanyDb = string.IsNullOrWhiteSpace(company.ServiceLayerCompanyDb)
            ? company.Code
            : company.ServiceLayerCompanyDb;

        HttpResponseMessage response;
        try
        {
            // Note: the request body (contains the password) and the raw
            // response body are intentionally never logged.
            response = await client.PostAsJsonAsync(loginUrl, new
            {
                CompanyDB = serviceLayerCompanyDb,
                UserName = username,
                Password = password
            }, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            _logger.LogError(ex, "Could not reach the SAP B1 Service Layer for company {Code} at {Url}.", company.Code, company.ServiceLayerUrl);
            return false;
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                // SAP B1's own error body (e.g. "Invalid login credential", "User X
                // is locked") is generic, boilerplate text with no credential data
                // in it, so it's safe to log — and it's the only way to tell a
                // wrong password apart from a locked account, an expired
                // password, or a company-name mismatch.
                string? sapErrorDetail = null;
                try
                {
                    sapErrorDetail = await response.Content.ReadAsStringAsync(ct);
                }
                catch
                {
                    // Non-fatal — we still log the status code below either way.
                }

                _logger.LogWarning(
                    "SAP B1 Service Layer rejected credentials for user {Username} on company {Code} ({StatusCode}): {SapError}",
                    username, company.Code, (int)response.StatusCode, sapErrorDetail);
                return false;
            }

            // Best-effort: close the identity-check session immediately. It was
            // only opened to prove identity and was never used to serve data,
            // so there is nothing else to clean up; a failed logout here does
            // not affect the (already successful) authentication result.
            if (response.Headers.TryGetValues("Set-Cookie", out var cookies))
            {
                var sessionCookie = cookies.FirstOrDefault();
                if (sessionCookie is not null)
                {
                    try
                    {
                        using var logoutRequest = new HttpRequestMessage(HttpMethod.Post, $"{company.ServiceLayerUrl.TrimEnd('/')}/Logout");
                        logoutRequest.Headers.Add("Cookie", sessionCookie);
                        using var logoutResponse = await client.SendAsync(logoutRequest, ct);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to close the SAP B1 Service Layer identity-check session for company {Code} (non-fatal).", company.Code);
                    }
                }
            }

            return true;
        }
    }
}
