using SAPB1.Api.DTOs.Sales;

namespace SAPB1.Api.Interfaces;

/// <summary>Sales Dashboard figures: actual turnover vs the approved targets, plus the named units. Read-only.</summary>
public interface ISalesPerformanceService
{
    Task<SalesPerformanceDto> GetAsync(PerformanceQuery query, CancellationToken ct = default);
}
