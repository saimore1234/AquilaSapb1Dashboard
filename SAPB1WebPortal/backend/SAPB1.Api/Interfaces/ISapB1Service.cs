using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Customers;
using SAPB1.Api.DTOs.Dashboard;
using SAPB1.Api.DTOs.Inventory;
using SAPB1.Api.DTOs.Items;
using SAPB1.Api.DTOs.Suppliers;

namespace SAPB1.Api.Interfaces;

/// <summary>
/// Abstraction over how SAP Business One data is retrieved. Phase 1 implements this
/// with direct read-only SQL Server queries (SqlSapB1Service). A later
/// ServiceLayerSapB1Service can implement the same interface using the SAP B1
/// Service Layer/DI API instead — controllers never need to change.
///
/// When to use SQL Server directly vs. Service Layer:
///  - SQL Server (current): fast, efficient for reporting/list/aggregate queries
///    (dashboards, paged lists, joins across many tables). Requires direct DB
///    network access and a read-only SQL login. Cannot write to B1 safely
///    without bypassing B1 business logic, so it is used for READ-ONLY data only.
///  - Service Layer (future): required for any create/update/delete of B1
///    documents, since it enforces B1 business rules, approvals and numbering.
///    Slower for large report-style reads. Use it once Version 1 (read-only)
///    is stable and write operations are needed (see spec section 26).
/// </summary>
public interface ISapB1Service
{
    Task<DashboardSummaryDto> GetDashboardSummaryAsync(CancellationToken ct = default);

    Task<PagedResult<CustomerListItemDto>> GetCustomersAsync(PagedRequest request, string? group, CancellationToken ct = default);
    Task<CustomerDetailDto?> GetCustomerByCardCodeAsync(string cardCode, CancellationToken ct = default);

    Task<PagedResult<SupplierListItemDto>> GetSuppliersAsync(PagedRequest request, string? group, CancellationToken ct = default);
    Task<SupplierDetailDto?> GetSupplierByCardCodeAsync(string cardCode, CancellationToken ct = default);

    Task<PagedResult<ItemListItemDto>> GetItemsAsync(PagedRequest request, string? group, CancellationToken ct = default);
    Task<ItemDetailDto?> GetItemByCodeAsync(string itemCode, CancellationToken ct = default);

    Task<PagedResult<InventoryListItemDto>> GetInventoryAsync(PagedRequest request, string? warehouse, string? itemGroup, string? stockStatus, CancellationToken ct = default);
    Task<List<InventoryListItemDto>> GetInventoryByItemAsync(string itemCode, CancellationToken ct = default);
    Task<WarehouseStockSummaryDto?> GetInventoryByWarehouseAsync(string warehouseCode, CancellationToken ct = default);

    /// <summary>All active warehouses (OWHS) for the current company — used to power warehouse pickers.</summary>
    Task<List<WarehouseDto>> GetWarehousesAsync(CancellationToken ct = default);
}
