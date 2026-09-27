using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Reports;

namespace SAPB1.Api.Interfaces;

/// <summary>
/// The small set of Reports Center endpoints that have no existing module to
/// reuse — see ReportsDtos.cs class docs for why this isn't a parallel
/// implementation of every report in the catalog.
/// </summary>
public interface IReportsService
{
    Task<ManagementSummaryDto> GetManagementSummaryAsync(CancellationToken ct = default);
    Task<PagedResult<StockAgeingRowDto>> GetStockAgeingAsync(StockAgeingQuery query, CancellationToken ct = default);
    Task<PagedResult<InventoryMovementDto>> GetInventoryMovementAsync(InventoryMovementQuery query, CancellationToken ct = default);
}
