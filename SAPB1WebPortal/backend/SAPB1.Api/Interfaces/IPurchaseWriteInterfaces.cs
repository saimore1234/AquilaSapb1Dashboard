using SAPB1.Api.DTOs.Purchase;
using SAPB1.Api.Models;

namespace SAPB1.Api.Interfaces;

/// <summary>
/// Creates real SAP B1 documents via the SAP Business One Service Layer, for
/// the company the CURRENT request is authenticated against (ICompanyContext —
/// same source of truth as every read-only service; never client input). This
/// is the only write path in the API. If Service Layer credentials are not
/// configured for the current company, or SAP B1 rejects the document, this
/// throws a typed exception — it never falls back to SQL and never fabricates
/// a result.
/// </summary>
public interface IPurchaseRequestWriteService
{
    Task<CreatePurchaseRequestResultDto> CreateAsync(CreatePurchaseRequestDto dto, CancellationToken ct = default);
}

/// <summary>An authenticated SAP B1 Service Layer session for one company.</summary>
public record SapServiceLayerSession(string CompanyCode, string CookieHeader, DateTime ExpiresAtUtc);

/// <summary>
/// Caches one SAP B1 Service Layer session (B1SESSION + ROUTEID cookies) per
/// company, logging in on first use or after expiry, so a write request does
/// not need to log in to SAP B1 every time. Singleton (sessions are shared
/// across requests for the same company) but thread-safe for concurrent
/// requests against different — or the same — company.
/// </summary>
public interface ISapServiceLayerSessionManager
{
    Task<SapServiceLayerSession> GetSessionAsync(CompanyEntry company, CancellationToken ct = default);

    /// <summary>Discards a cached session (e.g. after SAP returns 401), forcing a fresh login on the next call.</summary>
    void Invalidate(string companyCode);
}

/// <summary>No SAP B1 Service Layer write credentials are configured for this company. Maps to HTTP 503 — never falls back to SQL.</summary>
public class SapServiceLayerNotConfiguredException : Exception
{
    public SapServiceLayerNotConfiguredException(string companyCode)
        : base($"SAP Business One write access is not configured for company '{companyCode}'.") { }
}

/// <summary>SAP B1 Service Layer could not be reached (network/timeout) or login failed. Maps to HTTP 503.</summary>
public class SapServiceLayerUnavailableException : Exception
{
    public SapServiceLayerUnavailableException(string message, Exception? inner = null) : base(message, inner) { }
}

/// <summary>SAP B1 itself rejected the document (validation/business rule). Carries SAP's own error message verbatim. Maps to HTTP 400.</summary>
public class SapServiceLayerBusinessException : Exception
{
    public SapServiceLayerBusinessException(string sapMessage) : base(sapMessage) { }
}

/// <summary>The portal's own pre-flight validation (item/warehouse existence, required fields) failed before ever calling SAP. Maps to HTTP 400.</summary>
public class PurchaseRequestValidationException : Exception
{
    public PurchaseRequestValidationException(string message) : base(message) { }
}
