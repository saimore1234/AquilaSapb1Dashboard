using SAPB1.Api.DTOs.Sales;

namespace SAPB1.Api.Interfaces;

/// <summary>
/// Salesperson target plans (portal database) compared with actual sales (SAP B1, read-only).
/// Every method is scoped to the authenticated user's company; the acting user always comes
/// from the validated identity, never from the request body.
/// </summary>
public interface ISalesTargetService
{
    Task<SalesTargetOptionsDto> GetOptionsAsync(CancellationToken ct = default);
    /// <summary>Server-side search of the SAP Item Master (code or name), sellable and not frozen.</summary>
    Task<List<SalesTargetItemOptionDto>> SearchItemsAsync(string? search, int limit, int offset, bool includeNonSales, CancellationToken ct = default);
    Task<SalesTargetListDto> ListAsync(SalesTargetQuery query, CancellationToken ct = default);
    Task<SalesTargetDetailDto?> GetAsync(int id, bool includeTax, CancellationToken ct = default);
    Task<SalesTargetResult> CreateAsync(SaveSalesTargetRequest request, string user, CancellationToken ct = default);
    Task<SalesTargetResult> UpdateAsync(int id, SaveSalesTargetRequest request, string user, CancellationToken ct = default);
    Task<SalesTargetResult> SubmitAsync(int id, string user, CancellationToken ct = default);
    Task<SalesTargetResult> ApproveAsync(int id, string? remarks, string user, CancellationToken ct = default);
    Task<SalesTargetResult> RejectAsync(int id, string? remarks, string user, CancellationToken ct = default);
    Task<SalesTargetResult> ReviseAsync(int id, string user, CancellationToken ct = default);
    Task<SalesTargetResult> DeleteAsync(int id, string user, CancellationToken ct = default);
}
