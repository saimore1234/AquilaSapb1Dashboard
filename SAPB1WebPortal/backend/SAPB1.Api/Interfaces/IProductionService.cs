using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Production;

namespace SAPB1.Api.Interfaces;

/// <summary>
/// Read-only access to SAP B1 Production/Manufacturing data (Bill of
/// Materials, Production Orders, material requirements/consumption, and
/// finished-goods receipts) for the company the current request is
/// authenticated against (see ICompanyConnectionFactory). No write
/// operations — writing production data needs to go through SAP B1's own
/// business logic (Service Layer/DI API), same rationale as
/// ISapB1Service/IPurchaseService/ISalesService.
/// </summary>
public interface IProductionService
{
    Task<ProductionDashboardDto> GetDashboardAsync(CancellationToken ct = default);
    Task<ProductionAnalyticsDto> GetAnalyticsAsync(CancellationToken ct = default);

    Task<PagedResult<BomDto>> GetBomsAsync(BomQuery query, CancellationToken ct = default);
    Task<BomDetailDto?> GetBomByCodeAsync(string code, CancellationToken ct = default);

    Task<PagedResult<ProductionOrderDto>> GetOrdersAsync(ProductionOrderQuery query, CancellationToken ct = default);
    Task<ProductionOrderDetailDto?> GetOrderByEntryAsync(int docEntry, CancellationToken ct = default);

    Task<PagedResult<MaterialRequirementDto>> GetMaterialRequirementsAsync(ProductionOrderQuery query, CancellationToken ct = default);
    Task<PagedResult<MaterialConsumptionDto>> GetConsumptionAsync(ProductionOrderQuery query, CancellationToken ct = default);
    Task<PagedResult<ProductionReceiptDto>> GetReceiptsAsync(ProductionOrderQuery query, CancellationToken ct = default);
}
