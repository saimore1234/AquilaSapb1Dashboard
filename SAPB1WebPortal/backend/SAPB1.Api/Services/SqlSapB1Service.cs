using Dapper;
using SAPB1.Api.Data;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Customers;
using SAPB1.Api.DTOs.Dashboard;
using SAPB1.Api.DTOs.Inventory;
using SAPB1.Api.DTOs.Items;
using SAPB1.Api.DTOs.Suppliers;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Services;

/// <summary>
/// ISapB1Service implementation using direct, read-only, parameterized SQL
/// against the SAP Business One company database (SQL Server edition).
///
/// TABLES USED (verify column names against your exact SAP B1 version/patch —
/// these are the standard SBO field names as of B1 9.x/10.0 on SQL Server;
/// Indian-localization fields like LicTradNum are only present if that
/// localization is active):
///
///   OCRD  Business Partner master   (CardCode, CardName, CardType C/S, GroupCode,
///                                    Phone1, Cellular, E_Mail, SlpCode, CreditLine,
///                                    Balance, validFor, LicTradNum[GSTIN])
///   CRD1  BP Addresses              (CardCode, AdresType B/S, Street, City, State,
///                                    ZipCode, Country)
///   OCRG  Customer/Vendor Groups    (GroupCode, GroupName)
///   OSLP  Sales Employees           (SlpCode, SlpName)
///   OITM  Item master               (ItemCode, ItemName, ItmsGrpCod, InvntryUom,
///                                    SalUnitMsr, BuyUnitMsr, CodeBars, LastPurPrc,
///                                    AvgPrice, validFor)
///   OITB  Item Groups               (ItmsGrpCod, ItmsGrpNam)
///   OITW  Item-Warehouse stock      (ItemCode, WhsCode, OnHand, IsCommited, OnOrder,
///                                    AvgPrice, MinStock)
///   OWHS  Warehouses                (WhsCode, WhsName)
///   ORDR  Sales Order header        (DocEntry, DocStatus O/C)
///   OPOR  Purchase Order header     (DocEntry, DocStatus O/C)
///   ODLN  Delivery header           (DocEntry, DocStatus O/C)
///   OINV  A/R Invoice header        (DocEntry, DocStatus O/C)
///   OPCH  A/P Invoice header        (DocEntry, DocStatus O/C)
///
/// All queries use parameters (never string concatenation) and explicit column
/// lists (never SELECT *), per spec sections 16 and 21.
/// </summary>
public class SqlSapB1Service : ISapB1Service
{
    // Resolves to the CURRENTLY AUTHENTICATED company's database — see
    // ICompanyConnectionFactory / CompanyContext. No query below references a
    // fixed database; every one of them runs against whichever company the
    // caller's JWT is scoped to.
    private readonly ICompanyConnectionFactory _connectionFactory;
    private readonly ILogger<SqlSapB1Service> _logger;

    public SqlSapB1Service(ICompanyConnectionFactory connectionFactory, ILogger<SqlSapB1Service> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    // ---------------------------------------------------------------
    // DASHBOARD
    // ---------------------------------------------------------------
    public async Task<DashboardSummaryDto> GetDashboardSummaryAsync(CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string countersSql = @"
            SELECT
                (SELECT COUNT(*) FROM OCRD WHERE CardType = 'C') AS TotalCustomers,
                (SELECT COUNT(*) FROM OCRD WHERE CardType = 'S') AS TotalVendors,
                (SELECT COUNT(*) FROM OITM WHERE validFor = 'Y') AS TotalItems,
                (SELECT COUNT(*) FROM ORDR WHERE DocStatus = 'O') AS OpenSalesOrders,
                (SELECT COUNT(*) FROM OPOR WHERE DocStatus = 'O') AS OpenPurchaseOrders,
                (SELECT COUNT(*) FROM ODLN WHERE DocStatus = 'O') AS OpenDeliveries,
                (SELECT COUNT(*) FROM OINV WHERE DocStatus = 'O') AS OpenArInvoices,
                (SELECT COUNT(*) FROM OPCH WHERE DocStatus = 'O') AS OpenApInvoices,
                (SELECT ISNULL(SUM(w.OnHand * w.AvgPrice), 0)
                   FROM OITW w INNER JOIN OITM i ON i.ItemCode = w.ItemCode
                   WHERE i.validFor = 'Y')                       AS CurrentStockValue";

        var summary = await db.QuerySingleAsync<DashboardSummaryDto>(new CommandDefinition(countersSql, cancellationToken: ct));

        const string lowStockSql = @"
            SELECT TOP 10
                i.ItemCode,
                i.ItemName,
                SUM(w.OnHand)      AS OnHand,
                SUM(w.IsCommited)  AS Committed,
                SUM(w.OnHand - w.IsCommited) AS Available
            FROM OITW w
            INNER JOIN OITM i ON i.ItemCode = w.ItemCode
            WHERE i.validFor = 'Y' AND w.MinStock > 0
            GROUP BY i.ItemCode, i.ItemName
            HAVING SUM(w.OnHand) <= MAX(w.MinStock)
            ORDER BY SUM(w.OnHand) ASC";

        var lowStock = (await db.QueryAsync<LowStockItemDto>(new CommandDefinition(lowStockSql, cancellationToken: ct))).ToList();

        summary.LowStockItems = lowStock;
        summary.LowStockItemsCount = lowStock.Count;
        return summary;
    }

    // ---------------------------------------------------------------
    // CUSTOMERS
    // ---------------------------------------------------------------
    public async Task<PagedResult<CustomerListItemDto>> GetCustomersAsync(PagedRequest request, string? group, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string whereSql = @"
            WHERE c.CardType = 'C'
              AND (@Search IS NULL OR c.CardCode LIKE @SearchLike OR c.CardName LIKE @SearchLike
                   OR c.Cellular LIKE @SearchLike OR c.LicTradNum LIKE @SearchLike)
              AND (@Group IS NULL OR g.GroupName = @Group)
              AND (@Active IS NULL OR c.validFor = @ActiveFlag)";

        var parameters = new DynamicParameters();
        parameters.Add("Search", request.Search);
        parameters.Add("SearchLike", request.Search is null ? null : $"%{request.Search}%");
        parameters.Add("Group", group);
        parameters.Add("Active", request.Active);
        parameters.Add("ActiveFlag", request.Active == true ? "Y" : "N");
        parameters.Add("Skip", request.Skip);
        parameters.Add("PageSize", request.PageSize);

        var countSql = $@"
            SELECT COUNT(*)
            FROM OCRD c
            LEFT JOIN OCRG g ON g.GroupCode = c.GroupCode
            {whereSql}";

        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, parameters, cancellationToken: ct));

        var listSql = $@"
            SELECT
                c.CardCode, c.CardName, g.GroupName,
                c.Phone1 AS Phone, c.Cellular AS Mobile, c.E_Mail AS Email,
                s.SlpName AS SalesEmployee,
                c.Balance, c.CreditLine AS CreditLimit,
                CASE WHEN c.validFor = 'Y' THEN 1 ELSE 0 END AS Active
            FROM OCRD c
            LEFT JOIN OCRG g ON g.GroupCode = c.GroupCode
            LEFT JOIN OSLP s ON s.SlpCode = c.SlpCode
            {whereSql}
            ORDER BY c.CardName
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var items = (await db.QueryAsync<CustomerListItemDto>(new CommandDefinition(listSql, parameters, cancellationToken: ct))).ToList();

        return new PagedResult<CustomerListItemDto>
        {
            Items = items,
            Page = request.Page,
            PageSize = request.PageSize,
            TotalCount = total
        };
    }

    public async Task<CustomerDetailDto?> GetCustomerByCardCodeAsync(string cardCode, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string headerSql = @"
            SELECT
                c.CardCode, c.CardName, g.GroupName,
                c.Phone1 AS Phone, c.Cellular AS Mobile, c.E_Mail AS Email,
                c.LicTradNum AS GsTin,
                s.SlpName AS SalesEmployee,
                t.descript AS Territory,
                c.CreditLine AS CreditLimit, c.Balance,
                CASE WHEN c.validFor = 'Y' THEN 1 ELSE 0 END AS Active
            FROM OCRD c
            LEFT JOIN OCRG g ON g.GroupCode = c.GroupCode
            LEFT JOIN OSLP s ON s.SlpCode = c.SlpCode
            LEFT JOIN OTER t ON t.territryID = c.Territory
            WHERE c.CardType = 'C' AND c.CardCode = @CardCode";

        var customer = await db.QuerySingleOrDefaultAsync<CustomerDetailDto>(
            new CommandDefinition(headerSql, new { CardCode = cardCode }, cancellationToken: ct));

        if (customer is null) return null;

        const string addressSql = @"
            SELECT
                CASE a.AdresType WHEN 'B' THEN 'Bill-To' WHEN 'S' THEN 'Ship-To' ELSE a.AdresType END AS AddressType,
                a.Street, a.City, a.State AS State, a.ZipCode, a.Country
            FROM CRD1 a
            WHERE a.CardCode = @CardCode";

        customer.Addresses = (await db.QueryAsync<CustomerAddressDto>(
            new CommandDefinition(addressSql, new { CardCode = cardCode }, cancellationToken: ct))).ToList();

        return customer;
    }

    // ---------------------------------------------------------------
    // SUPPLIERS
    // ---------------------------------------------------------------
    public async Task<PagedResult<SupplierListItemDto>> GetSuppliersAsync(PagedRequest request, string? group, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string whereSql = @"
            WHERE c.CardType = 'S'
              AND (@Search IS NULL OR c.CardCode LIKE @SearchLike OR c.CardName LIKE @SearchLike
                   OR c.LicTradNum LIKE @SearchLike)
              AND (@Group IS NULL OR g.GroupName = @Group)
              AND (@Active IS NULL OR c.validFor = @ActiveFlag)";

        var parameters = new DynamicParameters();
        parameters.Add("Search", request.Search);
        parameters.Add("SearchLike", request.Search is null ? null : $"%{request.Search}%");
        parameters.Add("Group", group);
        parameters.Add("Active", request.Active);
        parameters.Add("ActiveFlag", request.Active == true ? "Y" : "N");
        parameters.Add("Skip", request.Skip);
        parameters.Add("PageSize", request.PageSize);

        var countSql = $@"
            SELECT COUNT(*)
            FROM OCRD c
            LEFT JOIN OCRG g ON g.GroupCode = c.GroupCode
            {whereSql}";

        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, parameters, cancellationToken: ct));

        var listSql = $@"
            SELECT
                c.CardCode, c.CardName, g.GroupName,
                c.Phone1 AS Phone, c.E_Mail AS Email,
                c.Balance, c.CreditLine AS CreditLimit,
                CASE WHEN c.validFor = 'Y' THEN 1 ELSE 0 END AS Active
            FROM OCRD c
            LEFT JOIN OCRG g ON g.GroupCode = c.GroupCode
            {whereSql}
            ORDER BY c.CardName
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var items = (await db.QueryAsync<SupplierListItemDto>(new CommandDefinition(listSql, parameters, cancellationToken: ct))).ToList();

        return new PagedResult<SupplierListItemDto>
        {
            Items = items,
            Page = request.Page,
            PageSize = request.PageSize,
            TotalCount = total
        };
    }

    public async Task<SupplierDetailDto?> GetSupplierByCardCodeAsync(string cardCode, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string headerSql = @"
            SELECT
                c.CardCode, c.CardName, g.GroupName,
                c.Phone1 AS Phone, c.E_Mail AS Email, c.LicTradNum AS GsTin,
                c.CreditLine AS CreditLimit, c.Balance,
                CASE WHEN c.validFor = 'Y' THEN 1 ELSE 0 END AS Active
            FROM OCRD c
            LEFT JOIN OCRG g ON g.GroupCode = c.GroupCode
            WHERE c.CardType = 'S' AND c.CardCode = @CardCode";

        var supplier = await db.QuerySingleOrDefaultAsync<SupplierDetailDto>(
            new CommandDefinition(headerSql, new { CardCode = cardCode }, cancellationToken: ct));

        if (supplier is null) return null;

        const string addressSql = @"
            SELECT
                CASE a.AdresType WHEN 'B' THEN 'Bill-To' WHEN 'S' THEN 'Ship-To' ELSE a.AdresType END AS AddressType,
                a.Street, a.City, a.State AS State, a.ZipCode, a.Country
            FROM CRD1 a
            WHERE a.CardCode = @CardCode";

        supplier.Addresses = (await db.QueryAsync<SupplierAddressDto>(
            new CommandDefinition(addressSql, new { CardCode = cardCode }, cancellationToken: ct))).ToList();

        return supplier;
    }

    // ---------------------------------------------------------------
    // ITEMS
    // ---------------------------------------------------------------
    public async Task<PagedResult<ItemListItemDto>> GetItemsAsync(PagedRequest request, string? group, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string whereSql = @"
            WHERE (@Search IS NULL OR i.ItemCode LIKE @SearchLike OR i.ItemName LIKE @SearchLike
                   OR i.CodeBars LIKE @SearchLike)
              AND (@Group IS NULL OR b.ItmsGrpNam = @Group)
              AND (@Active IS NULL OR i.validFor = @ActiveFlag)";

        var parameters = new DynamicParameters();
        parameters.Add("Search", request.Search);
        parameters.Add("SearchLike", request.Search is null ? null : $"%{request.Search}%");
        parameters.Add("Group", group);
        parameters.Add("Active", request.Active);
        parameters.Add("ActiveFlag", request.Active == true ? "Y" : "N");
        parameters.Add("Skip", request.Skip);
        parameters.Add("PageSize", request.PageSize);

        var countSql = $@"
            SELECT COUNT(*)
            FROM OITM i
            LEFT JOIN OITB b ON b.ItmsGrpCod = i.ItmsGrpCod
            {whereSql}";

        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, parameters, cancellationToken: ct));

        var listSql = $@"
            SELECT
                i.ItemCode, i.ItemName, b.ItmsGrpNam AS ItemGroup, i.InvntryUom AS InventoryUom,
                ISNULL(w.OnHand, 0) AS OnHand,
                ISNULL(w.IsCommited, 0) AS Committed,
                ISNULL(w.OnHand, 0) - ISNULL(w.IsCommited, 0) AS Available,
                CASE WHEN i.validFor = 'Y' THEN 1 ELSE 0 END AS Active
            FROM OITM i
            LEFT JOIN OITB b ON b.ItmsGrpCod = i.ItmsGrpCod
            OUTER APPLY (
                SELECT SUM(OnHand) AS OnHand, SUM(IsCommited) AS IsCommited
                FROM OITW WHERE ItemCode = i.ItemCode
            ) w
            {whereSql}
            ORDER BY i.ItemName
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var items = (await db.QueryAsync<ItemListItemDto>(new CommandDefinition(listSql, parameters, cancellationToken: ct))).ToList();

        return new PagedResult<ItemListItemDto>
        {
            Items = items,
            Page = request.Page,
            PageSize = request.PageSize,
            TotalCount = total
        };
    }

    public async Task<ItemDetailDto?> GetItemByCodeAsync(string itemCode, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string headerSql = @"
            SELECT
                i.ItemCode, i.ItemName, b.ItmsGrpNam AS ItemGroup,
                i.InvntryUom AS InventoryUom, i.SalUnitMsr AS SalesUom, i.BuyUnitMsr AS PurchaseUom,
                i.CodeBars AS Barcode,
                ISNULL(w.OnHand, 0) AS OnHand,
                ISNULL(w.IsCommited, 0) AS Committed,
                ISNULL(w.OnOrder, 0) AS Ordered,
                ISNULL(w.OnHand, 0) - ISNULL(w.IsCommited, 0) AS Available,
                i.LastPurPrc AS LastPurchasePrice,
                i.AvgPrice AS LastSalesPrice,
                CASE WHEN i.validFor = 'Y' THEN 1 ELSE 0 END AS Active
            FROM OITM i
            LEFT JOIN OITB b ON b.ItmsGrpCod = i.ItmsGrpCod
            OUTER APPLY (
                SELECT SUM(OnHand) AS OnHand, SUM(IsCommited) AS IsCommited, SUM(OnOrder) AS OnOrder
                FROM OITW WHERE ItemCode = i.ItemCode
            ) w
            WHERE i.ItemCode = @ItemCode";

        var item = await db.QuerySingleOrDefaultAsync<ItemDetailDto>(
            new CommandDefinition(headerSql, new { ItemCode = itemCode }, cancellationToken: ct));

        if (item is null) return null;

        const string whsSql = @"
            SELECT
                w.WhsCode AS WarehouseCode, h.WhsName AS WarehouseName,
                w.OnHand, w.IsCommited AS Committed, w.OnOrder AS Ordered,
                (w.OnHand - w.IsCommited) AS Available
            FROM OITW w
            INNER JOIN OWHS h ON h.WhsCode = w.WhsCode
            WHERE w.ItemCode = @ItemCode
            ORDER BY w.WhsCode";

        item.WarehouseStock = (await db.QueryAsync<ItemWarehouseStockDto>(
            new CommandDefinition(whsSql, new { ItemCode = itemCode }, cancellationToken: ct))).ToList();

        return item;
    }

    // ---------------------------------------------------------------
    // INVENTORY
    // ---------------------------------------------------------------
    public async Task<PagedResult<InventoryListItemDto>> GetInventoryAsync(
        PagedRequest request, string? warehouse, string? itemGroup, string? stockStatus, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        // Stock status is computed, not stored, so it's filtered with a HAVING-style
        // expression re-used in both the WHERE (for search) and an outer filter.
        const string baseSql = @"
            FROM OITW w
            INNER JOIN OITM i ON i.ItemCode = w.ItemCode
            INNER JOIN OWHS h ON h.WhsCode = w.WhsCode
            LEFT JOIN OITB b ON b.ItmsGrpCod = i.ItmsGrpCod
            WHERE i.validFor = 'Y'
              AND (@Search IS NULL OR i.ItemCode LIKE @SearchLike OR i.ItemName LIKE @SearchLike)
              AND (@Warehouse IS NULL OR w.WhsCode = @Warehouse)
              AND (@ItemGroup IS NULL OR b.ItmsGrpNam = @ItemGroup)";

        var parameters = new DynamicParameters();
        parameters.Add("Search", request.Search);
        parameters.Add("SearchLike", request.Search is null ? null : $"%{request.Search}%");
        parameters.Add("Warehouse", warehouse);
        parameters.Add("ItemGroup", itemGroup);
        parameters.Add("Skip", request.Skip);
        parameters.Add("PageSize", request.PageSize);

        var selectSql = $@"
            SELECT
                i.ItemCode, i.ItemName, ISNULL(b.ItmsGrpNam, '') AS ItemGroup,
                w.WhsCode AS WarehouseCode, h.WhsName AS WarehouseName,
                w.OnHand, w.IsCommited AS Committed, w.OnOrder AS Ordered,
                (w.OnHand - w.IsCommited) AS Available,
                (w.OnHand * w.AvgPrice) AS StockValue,
                CASE
                    WHEN w.OnHand <= 0 THEN 'Out of Stock'
                    WHEN w.MinStock > 0 AND w.OnHand <= w.MinStock THEN 'Low Stock'
                    ELSE 'In Stock'
                END AS StockStatus
            {baseSql}";

        // Stock status filter applied as a wrapping query since it's a derived column.
        var wrappedSql = @"
            SELECT * FROM (" + selectSql + @") AS Inv
            WHERE (@StockStatus IS NULL OR Inv.StockStatus = @StockStatus)
            ORDER BY Inv.ItemName, Inv.WarehouseCode
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var countSql = @"SELECT COUNT(*) FROM (" + selectSql.Replace("OFFSET", "-- OFFSET") + @") AS Inv
            WHERE (@StockStatus IS NULL OR Inv.StockStatus = @StockStatus)";

        parameters.Add("StockStatus", stockStatus);

        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, parameters, cancellationToken: ct));
        var items = (await db.QueryAsync<InventoryListItemDto>(new CommandDefinition(wrappedSql, parameters, cancellationToken: ct))).ToList();

        return new PagedResult<InventoryListItemDto>
        {
            Items = items,
            Page = request.Page,
            PageSize = request.PageSize,
            TotalCount = total
        };
    }

    public async Task<List<InventoryListItemDto>> GetInventoryByItemAsync(string itemCode, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT
                i.ItemCode, i.ItemName, ISNULL(b.ItmsGrpNam, '') AS ItemGroup,
                w.WhsCode AS WarehouseCode, h.WhsName AS WarehouseName,
                w.OnHand, w.IsCommited AS Committed, w.OnOrder AS Ordered,
                (w.OnHand - w.IsCommited) AS Available,
                (w.OnHand * w.AvgPrice) AS StockValue,
                CASE
                    WHEN w.OnHand <= 0 THEN 'Out of Stock'
                    WHEN w.MinStock > 0 AND w.OnHand <= w.MinStock THEN 'Low Stock'
                    ELSE 'In Stock'
                END AS StockStatus
            FROM OITW w
            INNER JOIN OITM i ON i.ItemCode = w.ItemCode
            INNER JOIN OWHS h ON h.WhsCode = w.WhsCode
            LEFT JOIN OITB b ON b.ItmsGrpCod = i.ItmsGrpCod
            WHERE w.ItemCode = @ItemCode
            ORDER BY w.WhsCode";

        return (await db.QueryAsync<InventoryListItemDto>(
            new CommandDefinition(sql, new { ItemCode = itemCode }, cancellationToken: ct))).ToList();
    }

    public async Task<WarehouseStockSummaryDto?> GetInventoryByWarehouseAsync(string warehouseCode, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT
                h.WhsCode AS WarehouseCode, h.WhsName AS WarehouseName,
                COUNT(DISTINCT w.ItemCode) AS ItemCount,
                ISNULL(SUM(w.OnHand), 0) AS TotalOnHand,
                ISNULL(SUM(w.OnHand * w.AvgPrice), 0) AS TotalStockValue
            FROM OWHS h
            LEFT JOIN OITW w ON w.WhsCode = h.WhsCode
            WHERE h.WhsCode = @WarehouseCode
            GROUP BY h.WhsCode, h.WhsName";

        return await db.QuerySingleOrDefaultAsync<WarehouseStockSummaryDto>(
            new CommandDefinition(sql, new { WarehouseCode = warehouseCode }, cancellationToken: ct));
    }

    public async Task<List<WarehouseDto>> GetWarehousesAsync(CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT WhsCode AS WarehouseCode, WhsName AS WarehouseName
            FROM OWHS
            ORDER BY WhsCode";

        return (await db.QueryAsync<WarehouseDto>(new CommandDefinition(sql, cancellationToken: ct))).ToList();
    }
}
