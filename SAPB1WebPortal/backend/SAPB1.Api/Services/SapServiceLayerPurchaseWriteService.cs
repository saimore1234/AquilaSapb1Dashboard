using System.Net;
using System.Text;
using System.Text.Json;
using SAPB1.Api.DTOs.Purchase;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Services;

/// <summary>
/// Creates a real SAP B1 Purchase Request via the Service Layer
/// (POST {ServiceLayerUrl}/PurchaseRequests), for the company the current
/// request is authenticated against. This is the only write path in the API —
/// every other service (SqlPurchaseService, SqlSapB1Service, ...) remains
/// read-only SQL, untouched by this class.
///
/// The exact request shape below was confirmed against STEST's live
/// $metadata/UserFieldsMD, not assumed:
///  - PurchaseRequests uses SAP B1's shared "Document"/"DocumentLine" OData
///    types; the header's required-date property is spelled "RequriedDate"
///    (SAP's own typo, verified in $metadata) and the per-line one is
///    "ShipDate" (matches the existing read path's `l.ShipDate AS
///    RequiredDate` in SqlPurchaseService).
///  - "Requester" is validated by SAP against a real SAP B1 user code,
///    unlike "RequesterName" (free text) — the portal's own login identity
///    isn't guaranteed to match a SAP B1 user, so only RequesterName is set.
///  - Every line requires the custom field U_CapRev ("Revenue"/"Capital") —
///    STEST has it configured as mandatory with no default value.
/// </summary>
public class SapServiceLayerPurchaseWriteService : IPurchaseRequestWriteService
{
    private const string HttpClientName = "SapServiceLayerWrite";
    private static readonly string[] ValidCapitalOrRevenue = { "Revenue", "Capital" };

    private readonly ICompanyContext _companyContext;
    private readonly ICompanyRegistry _companyRegistry;
    private readonly ISapServiceLayerSessionManager _sessionManager;
    private readonly ISapB1Service _sapB1Service;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<SapServiceLayerPurchaseWriteService> _logger;

    public SapServiceLayerPurchaseWriteService(
        ICompanyContext companyContext,
        ICompanyRegistry companyRegistry,
        ISapServiceLayerSessionManager sessionManager,
        ISapB1Service sapB1Service,
        IHttpClientFactory httpClientFactory,
        ILogger<SapServiceLayerPurchaseWriteService> logger)
    {
        _companyContext = companyContext;
        _companyRegistry = companyRegistry;
        _sessionManager = sessionManager;
        _sapB1Service = sapB1Service;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public async Task<CreatePurchaseRequestResultDto> CreateAsync(CreatePurchaseRequestDto dto, CancellationToken ct = default)
    {
        var companyCode = _companyContext.CompanyCode;
        if (string.IsNullOrWhiteSpace(companyCode))
        {
            throw new UnauthorizedAccessException("Request has no authenticated company context.");
        }

        var company = _companyRegistry.FindByCode(companyCode)
            ?? throw new UnauthorizedAccessException($"Company '{companyCode}' is not a configured company database.");

        await ValidateAsync(dto, ct);

        var session = await _sessionManager.GetSessionAsync(company, ct);
        var payload = BuildPayload(dto);

        try
        {
            var result = await PostAsync(company, session, payload, ct);
            _logger.LogInformation(
                "Purchase Request created in SAP B1: user={User} company={Company} docEntry={DocEntry} docNum={DocNum}",
                _companyContext.Username, companyCode, result.DocEntry, result.DocNum);
            return result;
        }
        catch (SapServiceLayerBusinessException ex)
        {
            _logger.LogWarning(
                "SAP B1 rejected Purchase Request creation: user={User} company={Company} error={Error}",
                _companyContext.Username, companyCode, ex.Message);
            throw;
        }
    }

    private async Task ValidateAsync(CreatePurchaseRequestDto dto, CancellationToken ct)
    {
        if (dto.RequiredDate == default)
        {
            throw new PurchaseRequestValidationException("Required Date is required.");
        }

        if (dto.Lines.Count == 0)
        {
            throw new PurchaseRequestValidationException("At least one line is required.");
        }

        var seenLines = new HashSet<(string ItemCode, string Warehouse)>(
            new TupleOrdinalIgnoreCaseComparer());

        foreach (var line in dto.Lines)
        {
            if (string.IsNullOrWhiteSpace(line.ItemCode))
            {
                throw new PurchaseRequestValidationException("Item Code is required on every line.");
            }

            if (line.Quantity <= 0)
            {
                throw new PurchaseRequestValidationException($"Quantity for item '{line.ItemCode}' must be greater than zero.");
            }

            if (string.IsNullOrWhiteSpace(line.WarehouseCode))
            {
                throw new PurchaseRequestValidationException($"Warehouse is required for item '{line.ItemCode}'.");
            }

            if (!ValidCapitalOrRevenue.Contains(line.CapitalOrRevenue, StringComparer.OrdinalIgnoreCase))
            {
                throw new PurchaseRequestValidationException(
                    $"Capital/Revenue for item '{line.ItemCode}' must be either 'Revenue' or 'Capital'.");
            }

            if (!seenLines.Add((line.ItemCode, line.WarehouseCode)))
            {
                throw new PurchaseRequestValidationException(
                    $"Duplicate line: item '{line.ItemCode}' in warehouse '{line.WarehouseCode}' appears more than once.");
            }
        }

        // Validate against the current company's real master data before ever
        // calling SAP — friendly errors instead of relying only on SAP's own
        // rejection (though that still happens too, as a second line of defense).
        var warehouses = await _sapB1Service.GetWarehousesAsync(ct);
        var validWarehouseCodes = new HashSet<string>(warehouses.Select(w => w.WarehouseCode), StringComparer.OrdinalIgnoreCase);

        foreach (var line in dto.Lines)
        {
            if (!validWarehouseCodes.Contains(line.WarehouseCode))
            {
                throw new PurchaseRequestValidationException($"Warehouse '{line.WarehouseCode}' was not found in this company.");
            }

            var item = await _sapB1Service.GetItemByCodeAsync(line.ItemCode, ct);
            if (item is null)
            {
                throw new PurchaseRequestValidationException($"Item '{line.ItemCode}' was not found in this company.");
            }

            if (!item.Active)
            {
                throw new PurchaseRequestValidationException($"Item '{line.ItemCode}' is inactive in SAP Business One and cannot be requested.");
            }
        }
    }

    private static object BuildPayload(CreatePurchaseRequestDto dto)
    {
        return new Dictionary<string, object?>
        {
            ["RequriedDate"] = dto.RequiredDate.ToString("yyyy-MM-dd"),
            ["Comments"] = dto.Remarks,
            ["RequesterName"] = dto.Requester,
            ["DocumentLines"] = dto.Lines.Select(l => new Dictionary<string, object?>
            {
                ["ItemCode"] = l.ItemCode,
                ["Quantity"] = l.Quantity,
                ["WarehouseCode"] = l.WarehouseCode,
                ["ShipDate"] = (l.RequiredDate ?? dto.RequiredDate).ToString("yyyy-MM-dd"),
                ["U_CapRev"] = l.CapitalOrRevenue,
                ["U_Remarks"] = l.Remarks
            }).ToList()
        };
    }

    private async Task<CreatePurchaseRequestResultDto> PostAsync(
        Models.CompanyEntry company, SapServiceLayerSession session, object payload, CancellationToken ct, bool isRetry = false)
    {
        var client = _httpClientFactory.CreateClient(HttpClientName);
        var url = $"{company.ServiceLayerUrl.TrimEnd('/')}/PurchaseRequests";

        // StringContent, not JsonContent.Create — see SapServiceLayerSessionManager.LoginAsync
        // for why this SAP B1 Service Layer install requires it.
        var payloadJson = JsonSerializer.Serialize(payload);
        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(payloadJson, Encoding.UTF8, "application/json")
        };
        request.Headers.Add("Cookie", session.CookieHeader);

        HttpResponseMessage response;
        try
        {
            response = await client.SendAsync(request, ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            // Timed out or the connection dropped — SAP B1 may or may not have
            // already created the document. Never invite an automatic retry here.
            _logger.LogError(ex, "Request to SAP B1 Service Layer timed out/failed for company {Code}.", company.Code);
            throw new SapServiceLayerUnavailableException(
                "The request to SAP Business One did not complete (timeout or connection error). " +
                "The Purchase Request may or may not have been created — please check the Purchase Requests list before trying again.", ex);
        }

        using (response)
        {
            if (response.StatusCode == HttpStatusCode.Unauthorized && !isRetry)
            {
                // Session expired server-side before our cached expiry — log in again once.
                _sessionManager.Invalidate(company.Code);
                var freshSession = await _sessionManager.GetSessionAsync(company, ct);
                return await PostAsync(company, freshSession, payload, ct, isRetry: true);
            }

            var body = await response.Content.ReadAsStringAsync(ct);

            if (!response.IsSuccessStatusCode)
            {
                throw new SapServiceLayerBusinessException(ExtractSapErrorMessage(body, response.StatusCode));
            }

            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            var docEntry = root.TryGetProperty("DocEntry", out var docEntryEl) ? docEntryEl.GetInt32() : 0;
            var docNum = root.TryGetProperty("DocNum", out var docNumEl) ? docNumEl.GetInt32() : 0;

            return new CreatePurchaseRequestResultDto
            {
                DocEntry = docEntry,
                DocNum = docNum,
                Status = "Created",
                Company = company.Code
            };
        }
    }

    private static string ExtractSapErrorMessage(string body, HttpStatusCode statusCode)
    {
        try
        {
            using var doc = JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("error", out var error) &&
                error.TryGetProperty("message", out var message) &&
                message.TryGetProperty("value", out var value))
            {
                return value.GetString()?.Trim() ?? $"SAP Business One rejected the request ({(int)statusCode}).";
            }
        }
        catch (JsonException)
        {
            // Fall through to the generic message below.
        }

        return $"SAP Business One rejected the request ({(int)statusCode}).";
    }

    private sealed class TupleOrdinalIgnoreCaseComparer : IEqualityComparer<(string ItemCode, string Warehouse)>
    {
        public bool Equals((string ItemCode, string Warehouse) x, (string ItemCode, string Warehouse) y) =>
            string.Equals(x.ItemCode, y.ItemCode, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(x.Warehouse, y.Warehouse, StringComparison.OrdinalIgnoreCase);

        public int GetHashCode((string ItemCode, string Warehouse) obj) =>
            HashCode.Combine(obj.ItemCode.ToUpperInvariant(), obj.Warehouse.ToUpperInvariant());
    }
}
