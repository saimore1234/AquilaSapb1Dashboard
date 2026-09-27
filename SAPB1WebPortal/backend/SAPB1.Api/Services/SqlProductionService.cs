using System.Data;
using Dapper;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Production;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Services;

/// <summary>
/// Read-only SQL implementation of SAP B1 Production/Manufacturing data,
/// using the same pattern as SqlSapB1Service/SqlPurchaseService/SqlSalesService:
/// direct, parameterized Dapper queries against whichever company
/// ICompanyConnectionFactory resolves for the current request. Deliberately
/// READ-ONLY — writing production data needs to go through SAP B1's own
/// business logic (Service Layer/DI API), same rationale as the other
/// modules.
///
/// TABLES USED (verified against this project's actual STEST company
/// database via INFORMATION_SCHEMA.COLUMNS before writing any query here —
/// column names are NOT assumed from generic SAP B1 documentation; this
/// installation has real column-naming quirks even in these tables, e.g.
/// OITT's base quantity column is misspelled "Qauntity" (not "Quantity")
/// and WOR1's warehouse column is "wareHouse" (lowercase w, not "WhsCode")):
///
///   OWOR        Production Order header (DocEntry, DocNum, ItemCode = the
///               finished good, Status, Type, PlannedQty, CmpltQty, RjctQty,
///               PostDate, DueDate, Warehouse, Priority, OriginType/OriginNum)
///   WOR1        Production Order components (DocEntry, LineNum, ItemCode,
///               PlannedQty, IssuedQty, wareHouse, IssueType, UomCode,
///               ItemName — denormalized directly on the line, no OITM join needed)
///   OITT/ITT1   Bill of Materials header/components (OITT.Code = the parent/
///               produced item's code; ITT1.Father = OITT.Code, ITT1.Code =
///               the component item code, ITT1.ItemName also denormalized)
///   OINM        Inventory transaction log — finished-goods receipts from
///               production are rows here with InQty > 0 whose AppObjType/
///               AppObjAbs point back at the originating OWOR (AppObjType
///               202 is the standard, version-stable SAP B1 DI API
///               "oProductionOrders" object-type code — the same numbering
///               family already empirically confirmed correct in this exact
///               installation for Purchase/Sales; see SqlPurchaseService and
///               SqlSalesService class docs for the confirmed codes in that
///               family. Unlike those, this code has zero real data to check
///               against here — every configured company database in this
///               environment has 0 rows in OWOR/WOR1/OITT/ITT1 at
///               verification time — so it is unverified, a controlled gap
///               like SqlPurchaseService's ORPC=19 note, not a crash)
///   OITW        Item-Warehouse stock (OnHand, IsCommited, AvgPrice) — the
///               SAME table and the SAME Available = OnHand - IsCommited
///               formula already used throughout SqlSapB1Service, reused
///               here rather than inventing a new availability definition
///   OITM/OWHS   Item and warehouse master data, as used elsewhere
///
/// STATUS/TYPE LABELS: OWOR.Status ('P'/'R'/'L'/'C') and OWOR.Type ('S'/'A')
/// use the standard, documented SAP B1 DI API codes (ProductionOrderStatusEnum
/// / ProductionOrderTypeEnum) and OITT.TreeType ('S' = Sales BOM) the
/// standard BoBomType code — but because every configured company here has
/// zero rows in these tables, none of these value mappings could be checked
/// against real data (only the COLUMN NAMES were verified, via
/// INFORMATION_SCHEMA). Every mapping below falls back to the raw database
/// code for anything unrecognized, so it can show an unmapped label but
/// never a wrong one.
/// </summary>
public class SqlProductionService : IProductionService
{
    // Standard, version-stable SAP B1 DI API object-type code for Production Orders.
    private const string ProductionOrderObjType = "202";

    private readonly ICompanyConnectionFactory _connectionFactory;
    private readonly ILogger<SqlProductionService> _logger;

    public SqlProductionService(ICompanyConnectionFactory connectionFactory, ILogger<SqlProductionService> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    private static string MapOrderStatus(string? status) => status switch
    {
        "P" => "Planned",
        "R" => "Released",
        "L" => "Closed",
        "C" => "Cancelled",
        _ => status ?? "Unknown"
    };

    private static string MapOrderType(string? type) => type switch
    {
        "S" => "Standard",
        "A" => "Special",
        "D" => "Disassembly",
        _ => type ?? "Unknown"
    };

    private static string MapTreeType(string? treeType) => treeType switch
    {
        "S" => "Sales BOM",
        "A" => "Assembly",
        _ => "Production BOM"
    };

    // Reuses the codes this portal already confirmed empirically for its own
    // Sales/Purchase modules (SqlSalesService: Sales Order=17; SqlPurchaseService: Purchase Order=22).
    private static string? DescribeOrigin(string? originType, int? originNum)
    {
        if (originNum is null or 0) return null;
        var label = originType?.Trim() switch
        {
            "17" => "Sales Order",
            "22" => "Purchase Order",
            "23" => "Sales Quotation",
            _ => "Document"
        };
        return $"{label} #{originNum}";
    }

    private static string AvailabilityStatus(double remainingQty, double available)
    {
        if (remainingQty <= 0) return "Available";
        if (available <= 0) return "Shortage";
        return available >= remainingQty ? "Available" : "Partially Available";
    }

    // ---------------------------------------------------------------
    // BILL OF MATERIALS (OITT / ITT1)
    // ---------------------------------------------------------------
    public async Task<PagedResult<BomDto>> GetBomsAsync(BomQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string whereSql = @"
            WHERE (@Search IS NULL OR t.Code LIKE @SearchLike OR i.ItemName LIKE @SearchLike)
              AND (@Type IS NULL
                   OR (@Type = 'Sales' AND t.TreeType = 'S')
                   OR (@Type = 'Production' AND (t.TreeType <> 'S' OR t.TreeType IS NULL)))";

        var p = new DynamicParameters();
        p.Add("Search", query.Search);
        p.Add("SearchLike", query.Search is null ? null : $"%{query.Search}%");
        p.Add("Type", query.Type);
        p.Add("Skip", query.Skip);
        p.Add("PageSize", query.PageSize);

        var countSql = $"SELECT COUNT(*) FROM OITT t LEFT JOIN OITM i ON i.ItemCode = t.Code {whereSql}";
        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, p, cancellationToken: ct));

        var listSql = $@"
            SELECT t.Code, i.ItemName, t.TreeType, t.Qauntity AS Quantity, t.ToWH AS Warehouse,
                   (SELECT COUNT(*) FROM ITT1 c WHERE c.Father = t.Code) AS ComponentCount
            FROM OITT t
            LEFT JOIN OITM i ON i.ItemCode = t.Code
            {whereSql}
            ORDER BY t.Code
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var rows = (await db.QueryAsync(new CommandDefinition(listSql, p, cancellationToken: ct))).ToList();
        var items = rows.Select(r => new BomDto
        {
            Code = r.Code, ItemName = r.ItemName, TreeType = MapTreeType(r.TreeType),
            Quantity = (double)r.Quantity, Warehouse = r.Warehouse, ComponentCount = (int)r.ComponentCount
        }).ToList();

        return new PagedResult<BomDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }

    public async Task<BomDetailDto?> GetBomByCodeAsync(string code, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string headerSql = @"
            SELECT t.Code, i.ItemName, t.TreeType, t.Qauntity AS Quantity, t.ToWH AS Warehouse
            FROM OITT t
            LEFT JOIN OITM i ON i.ItemCode = t.Code
            WHERE t.Code = @Code";
        var header = await db.QuerySingleOrDefaultAsync(new CommandDefinition(headerSql, new { Code = code }, cancellationToken: ct));
        if (header is null) return null;

        const string componentsSql = @"
            SELECT c.ChildNum, c.Code AS ItemCode, c.ItemName, c.Quantity, c.Warehouse,
                   c.IssueMthd AS IssueMethod, c.Uom, c.AddQuantit AS AdditionalQuantity
            FROM ITT1 c
            WHERE c.Father = @Code
            ORDER BY c.VisOrder, c.ChildNum";
        var components = (await db.QueryAsync<BomComponentDto>(new CommandDefinition(componentsSql, new { Code = code }, cancellationToken: ct))).ToList();

        return new BomDetailDto
        {
            Code = header.Code, ItemName = header.ItemName, TreeType = MapTreeType(header.TreeType),
            Quantity = (double)header.Quantity, Warehouse = header.Warehouse, Components = components
        };
    }

    // ---------------------------------------------------------------
    // PRODUCTION ORDERS (OWOR / WOR1)
    // ---------------------------------------------------------------
    private static (string WhereSql, DynamicParameters Parameters) BuildOrderFilters(ProductionOrderQuery query, string alias = "c", string? itemNameAlias = "i")
    {
        var statusCode = query.Status?.Trim().ToLowerInvariant() switch
        {
            "planned" => "P",
            "released" => "R",
            "closed" => "L",
            "cancelled" => "C",
            _ => (string?)null
        };

        var sql = $@"
            WHERE (@Search IS NULL OR CAST({alias}.DocNum AS NVARCHAR(20)) LIKE @SearchLike
                   OR {alias}.ItemCode LIKE @SearchLike{(itemNameAlias is null ? "" : $" OR {itemNameAlias}.ItemName LIKE @SearchLike")})
              AND (@DateFrom IS NULL OR {alias}.PostDate >= @DateFrom)
              AND (@DateTo IS NULL OR {alias}.PostDate <= @DateTo)
              AND (@Status IS NULL OR {alias}.Status = @Status)
              AND (@Item IS NULL OR {alias}.ItemCode = @Item)
              AND (@Warehouse IS NULL OR {alias}.Warehouse = @Warehouse)";

        var p = new DynamicParameters();
        p.Add("Search", query.Search);
        p.Add("SearchLike", query.Search is null ? null : $"%{query.Search}%");
        p.Add("DateFrom", query.DateFrom);
        p.Add("DateTo", query.DateTo);
        p.Add("Status", statusCode);
        p.Add("Item", query.Item);
        p.Add("Warehouse", query.Warehouse);
        p.Add("Skip", query.Skip);
        p.Add("PageSize", query.PageSize);
        return (sql, p);
    }

    public async Task<PagedResult<ProductionOrderDto>> GetOrdersAsync(ProductionOrderQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var (whereSql, p) = BuildOrderFilters(query);

        var countSql = $"SELECT COUNT(*) FROM OWOR c LEFT JOIN OITM i ON i.ItemCode = c.ItemCode {whereSql}";
        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, p, cancellationToken: ct));

        var listSql = $@"
            SELECT c.DocEntry, c.DocNum, c.ItemCode, i.ItemName, c.PostDate AS PostingDate, c.DueDate,
                   c.PlannedQty, c.CmpltQty AS CompletedQty, c.Warehouse, c.Status, c.Type AS OrderType, c.Priority,
                   c.OriginType, c.OriginNum
            FROM OWOR c
            LEFT JOIN OITM i ON i.ItemCode = c.ItemCode
            {whereSql}
            ORDER BY c.PostDate DESC, c.DocEntry DESC
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var rows = (await db.QueryAsync(new CommandDefinition(listSql, p, cancellationToken: ct))).ToList();
        var items = rows.Select(r =>
        {
            double planned = (double)r.PlannedQty, completed = (double)r.CompletedQty;
            return new ProductionOrderDto
            {
                DocEntry = r.DocEntry, DocNum = r.DocNum, ItemCode = r.ItemCode, ItemName = r.ItemName,
                PostingDate = r.PostingDate, DueDate = r.DueDate,
                PlannedQty = planned, CompletedQty = completed, RemainingQty = planned - completed,
                Warehouse = r.Warehouse, Status = MapOrderStatus(r.Status), OrderType = MapOrderType(r.OrderType),
                Priority = r.Priority, Origin = DescribeOrigin(r.OriginType, r.OriginNum)
            };
        }).ToList();

        return new PagedResult<ProductionOrderDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }

    public async Task<ProductionOrderDetailDto?> GetOrderByEntryAsync(int docEntry, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string headerSql = @"
            SELECT c.DocEntry, c.DocNum, c.ItemCode, i.ItemName, c.PostDate AS PostingDate, c.DueDate,
                   c.StartDate, c.RlsDate AS ReleaseDate, c.CloseDate,
                   c.PlannedQty, c.CmpltQty AS CompletedQty, c.RjctQty AS RejectedQty,
                   c.Warehouse, c.Status, c.Type AS OrderType, c.Priority, c.Comments AS Remarks,
                   c.OriginType, c.OriginNum
            FROM OWOR c
            LEFT JOIN OITM i ON i.ItemCode = c.ItemCode
            WHERE c.DocEntry = @DocEntry";
        var header = await db.QuerySingleOrDefaultAsync(new CommandDefinition(headerSql, new { DocEntry = docEntry }, cancellationToken: ct));
        if (header is null) return null;

        const string componentsSql = @"
            SELECT l.LineNum, l.ItemCode, l.ItemName, l.PlannedQty, l.IssuedQty,
                   l.wareHouse AS Warehouse, l.IssueType AS IssueMethod, l.UomCode AS Uom,
                   ISNULL(w.OnHand, 0) AS OnHand, ISNULL(w.IsCommited, 0) AS Committed
            FROM WOR1 l
            LEFT JOIN OITW w ON w.ItemCode = l.ItemCode AND w.WhsCode = l.wareHouse
            WHERE l.DocEntry = @DocEntry
            ORDER BY l.LineNum";
        var componentRows = (await db.QueryAsync(new CommandDefinition(componentsSql, new { DocEntry = docEntry }, cancellationToken: ct))).ToList();
        var components = componentRows.Select(r =>
        {
            double planned = (double)r.PlannedQty, issued = (double)r.IssuedQty;
            double onHand = (double)r.OnHand, committed = (double)r.Committed;
            double remaining = planned - issued, available = onHand - committed;
            return new ProductionComponentDto
            {
                LineNum = r.LineNum, ItemCode = r.ItemCode, ItemName = r.ItemName,
                PlannedQty = planned, IssuedQty = issued, RemainingQty = remaining,
                Warehouse = r.Warehouse, IssueMethod = r.IssueMethod, Uom = r.Uom,
                OnHand = onHand, Committed = committed, Available = available,
                AvailabilityStatus = AvailabilityStatus(remaining, available)
            };
        }).ToList();

        var hasBom = await db.ExecuteScalarAsync<int>(
            new CommandDefinition("SELECT COUNT(1) FROM OITT WHERE Code = @ItemCode", new { ItemCode = (string)header.ItemCode }, cancellationToken: ct)) > 0;

        const string receiptsSql = @"
            SELECT TransNum, InQty AS Quantity, Warehouse, DocDate AS PostingDate
            FROM OINM
            WHERE AppObjType = @ObjType AND AppObjAbs = @DocEntry AND InQty > 0
            ORDER BY DocDate, TransNum";
        var receipts = (await db.QueryAsync<ProductionReceiptEventDto>(
            new CommandDefinition(receiptsSql, new { ObjType = ProductionOrderObjType, DocEntry = docEntry }, cancellationToken: ct))).ToList();

        double plannedQty = (double)header.PlannedQty, completedQty = (double)header.CompletedQty;

        return new ProductionOrderDetailDto
        {
            DocEntry = header.DocEntry, DocNum = header.DocNum, ItemCode = header.ItemCode, ItemName = header.ItemName,
            PostingDate = header.PostingDate, DueDate = header.DueDate, StartDate = header.StartDate,
            ReleaseDate = header.ReleaseDate, CloseDate = header.CloseDate,
            PlannedQty = plannedQty, CompletedQty = completedQty, RejectedQty = (double)header.RejectedQty,
            RemainingQty = plannedQty - completedQty,
            Warehouse = header.Warehouse, Status = MapOrderStatus(header.Status), OrderType = MapOrderType(header.OrderType),
            Priority = header.Priority, Remarks = header.Remarks, Origin = DescribeOrigin(header.OriginType, header.OriginNum),
            HasBom = hasBom, Components = components, Receipts = receipts
        };
    }

    // Shared by Material Requirements and Consumption — both join WOR1 (component,
    // alias "l") to OWOR (production order header, alias "c") and let @Search/@Item
    // match either the finished good or the component, unlike BuildOrderFilters
    // above which only ever matches a single ItemCode column.
    private static (string WhereSql, DynamicParameters Parameters) BuildComponentFilters(ProductionOrderQuery query, bool openOrdersOnly)
    {
        var statusCode = query.Status?.Trim().ToLowerInvariant() switch
        {
            "planned" => "P",
            "released" => "R",
            "closed" => "L",
            "cancelled" => "C",
            _ => (string?)null
        };

        var sql = @"
            WHERE (@Search IS NULL OR CAST(c.DocNum AS NVARCHAR(20)) LIKE @SearchLike
                   OR c.ItemCode LIKE @SearchLike OR l.ItemCode LIKE @SearchLike)
              AND (@DateFrom IS NULL OR c.PostDate >= @DateFrom)
              AND (@DateTo IS NULL OR c.PostDate <= @DateTo)
              AND (@Status IS NULL OR c.Status = @Status)
              AND (@Item IS NULL OR c.ItemCode = @Item OR l.ItemCode = @Item)
              AND (@Warehouse IS NULL OR l.wareHouse = @Warehouse)";

        if (openOrdersOnly)
        {
            sql += " AND c.Status IN ('P', 'R')";
        }

        var p = new DynamicParameters();
        p.Add("Search", query.Search);
        p.Add("SearchLike", query.Search is null ? null : $"%{query.Search}%");
        p.Add("DateFrom", query.DateFrom);
        p.Add("DateTo", query.DateTo);
        p.Add("Status", statusCode);
        p.Add("Item", query.Item);
        p.Add("Warehouse", query.Warehouse);
        p.Add("Skip", query.Skip);
        p.Add("PageSize", query.PageSize);
        return (sql, p);
    }

    // ---------------------------------------------------------------
    // MATERIAL REQUIREMENTS — open production orders only (Status Planned/Released)
    // ---------------------------------------------------------------
    public async Task<PagedResult<MaterialRequirementDto>> GetMaterialRequirementsAsync(ProductionOrderQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        var (whereSql, p) = BuildComponentFilters(query, openOrdersOnly: true);

        var countSql = $"SELECT COUNT(*) FROM WOR1 l INNER JOIN OWOR c ON c.DocEntry = l.DocEntry {whereSql}";
        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, p, cancellationToken: ct));

        var listSql = $@"
            SELECT c.DocEntry AS ProductionOrderDocEntry, c.DocNum AS ProductionOrderDocNum,
                   c.ItemCode AS FinishedGoodCode, fi.ItemName AS FinishedGoodName,
                   l.ItemCode AS ComponentItemCode, l.ItemName AS ComponentItemName,
                   l.PlannedQty AS RequiredQty, l.IssuedQty,
                   l.wareHouse AS Warehouse,
                   ISNULL(w.OnHand, 0) AS OnHand, ISNULL(w.IsCommited, 0) AS Committed
            FROM WOR1 l
            INNER JOIN OWOR c ON c.DocEntry = l.DocEntry
            LEFT JOIN OITM fi ON fi.ItemCode = c.ItemCode
            LEFT JOIN OITW w ON w.ItemCode = l.ItemCode AND w.WhsCode = l.wareHouse
            {whereSql}
            ORDER BY c.PostDate DESC, c.DocEntry DESC, l.LineNum
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var rows = (await db.QueryAsync(new CommandDefinition(listSql, p, cancellationToken: ct))).ToList();
        var items = rows.Select(r =>
        {
            double required = (double)r.RequiredQty, issued = (double)r.IssuedQty;
            double onHand = (double)r.OnHand, committed = (double)r.Committed;
            double remaining = required - issued, available = onHand - committed;
            return new MaterialRequirementDto
            {
                ProductionOrderDocEntry = r.ProductionOrderDocEntry, ProductionOrderDocNum = r.ProductionOrderDocNum,
                FinishedGoodCode = r.FinishedGoodCode, FinishedGoodName = r.FinishedGoodName,
                ComponentItemCode = r.ComponentItemCode, ComponentItemName = r.ComponentItemName,
                RequiredQty = required, IssuedQty = issued, RemainingQty = remaining,
                Warehouse = r.Warehouse, OnHand = onHand, Committed = committed, Available = available,
                AvailabilityStatus = AvailabilityStatus(remaining, available)
            };
        }).ToList();

        return new PagedResult<MaterialRequirementDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }

    // ---------------------------------------------------------------
    // COMPONENT CONSUMPTION — across all production orders
    // ---------------------------------------------------------------
    public async Task<PagedResult<MaterialConsumptionDto>> GetConsumptionAsync(ProductionOrderQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        var (whereSql, p) = BuildComponentFilters(query, openOrdersOnly: false);

        var countSql = $"SELECT COUNT(*) FROM WOR1 l INNER JOIN OWOR c ON c.DocEntry = l.DocEntry {whereSql}";
        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, p, cancellationToken: ct));

        var listSql = $@"
            SELECT c.DocEntry AS ProductionOrderDocEntry, c.DocNum AS ProductionOrderDocNum,
                   c.ItemCode AS FinishedGoodCode, fi.ItemName AS FinishedGoodName,
                   l.ItemCode AS ComponentItemCode, l.ItemName AS ComponentItemName,
                   l.PlannedQty, l.IssuedQty, l.wareHouse AS Warehouse, c.PostDate AS PostingDate
            FROM WOR1 l
            INNER JOIN OWOR c ON c.DocEntry = l.DocEntry
            LEFT JOIN OITM fi ON fi.ItemCode = c.ItemCode
            {whereSql}
            ORDER BY c.PostDate DESC, c.DocEntry DESC, l.LineNum
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var rows = (await db.QueryAsync(new CommandDefinition(listSql, p, cancellationToken: ct))).ToList();
        var items = rows.Select(r =>
        {
            double planned = (double)r.PlannedQty, issued = (double)r.IssuedQty;
            return new MaterialConsumptionDto
            {
                ProductionOrderDocEntry = r.ProductionOrderDocEntry, ProductionOrderDocNum = r.ProductionOrderDocNum,
                FinishedGoodCode = r.FinishedGoodCode, FinishedGoodName = r.FinishedGoodName,
                ComponentItemCode = r.ComponentItemCode, ComponentItemName = r.ComponentItemName,
                PlannedQty = planned, IssuedQty = issued, Variance = issued - planned,
                Warehouse = r.Warehouse, PostingDate = r.PostingDate
            };
        }).ToList();

        return new PagedResult<MaterialConsumptionDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }

    // ---------------------------------------------------------------
    // RECEIPT FROM PRODUCTION (OINM rows tied back to a production order)
    // ---------------------------------------------------------------
    public async Task<PagedResult<ProductionReceiptDto>> GetReceiptsAsync(ProductionOrderQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string filterSql = @"
            WHERE n.AppObjType = @ObjType AND n.InQty > 0
              AND (@Search IS NULL OR CAST(n.TransNum AS NVARCHAR(20)) LIKE @SearchLike OR n.ItemCode LIKE @SearchLike OR i.ItemName LIKE @SearchLike)
              AND (@DateFrom IS NULL OR n.DocDate >= @DateFrom)
              AND (@DateTo IS NULL OR n.DocDate <= @DateTo)
              AND (@Item IS NULL OR n.ItemCode = @Item)
              AND (@Warehouse IS NULL OR n.Warehouse = @Warehouse)";

        var p = new DynamicParameters();
        p.Add("ObjType", ProductionOrderObjType);
        p.Add("Search", query.Search);
        p.Add("SearchLike", query.Search is null ? null : $"%{query.Search}%");
        p.Add("DateFrom", query.DateFrom);
        p.Add("DateTo", query.DateTo);
        p.Add("Item", query.Item);
        p.Add("Warehouse", query.Warehouse);
        p.Add("Skip", query.Skip);
        p.Add("PageSize", query.PageSize);

        var countSql = $"SELECT COUNT(*) FROM OINM n LEFT JOIN OITM i ON i.ItemCode = n.ItemCode {filterSql}";
        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, p, cancellationToken: ct));

        var listSql = $@"
            SELECT n.TransNum, c.DocEntry AS ProductionOrderDocEntry, c.DocNum AS ProductionOrderDocNum,
                   n.ItemCode, i.ItemName, n.InQty AS Quantity, n.Warehouse, n.DocDate AS PostingDate
            FROM OINM n
            LEFT JOIN OITM i ON i.ItemCode = n.ItemCode
            LEFT JOIN OWOR c ON c.DocEntry = n.AppObjAbs AND n.AppObjType = @ObjType
            {filterSql}
            ORDER BY n.DocDate DESC, n.TransNum DESC
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var items = (await db.QueryAsync<ProductionReceiptDto>(new CommandDefinition(listSql, p, cancellationToken: ct))).ToList();

        return new PagedResult<ProductionReceiptDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }

    // ---------------------------------------------------------------
    // DASHBOARD
    // ---------------------------------------------------------------
    public async Task<ProductionDashboardDto> GetDashboardAsync(CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT
                (SELECT COUNT(*) FROM OWOR) AS TotalProductionOrders,
                (SELECT COUNT(*) FROM OWOR WHERE Status IN ('P','R')) AS OpenProductionOrders,
                (SELECT COUNT(*) FROM OWOR WHERE Status = 'P') AS PlannedProductionOrders,
                (SELECT COUNT(*) FROM OWOR WHERE Status = 'R') AS ReleasedProductionOrders,
                (SELECT COUNT(*) FROM OWOR WHERE Status = 'R' AND CmpltQty > 0 AND CmpltQty < PlannedQty) AS InProgressProductionOrders,
                (SELECT COUNT(*) FROM OWOR WHERE Status = 'L' OR (PlannedQty > 0 AND CmpltQty >= PlannedQty)) AS CompletedProductionOrders,
                (SELECT COUNT(*) FROM OWOR WHERE Status = 'L') AS ClosedProductionOrders,
                (SELECT COUNT(*) FROM OWOR WHERE Status = 'C') AS CancelledProductionOrders,
                (SELECT ISNULL(SUM(PlannedQty), 0) FROM OWOR WHERE Status IN ('P','R')) AS TotalPlannedQuantity,
                (SELECT ISNULL(SUM(CmpltQty), 0) FROM OWOR WHERE Status IN ('P','R')) AS TotalProducedQuantity,
                (SELECT ISNULL(SUM(PlannedQty - CmpltQty), 0) FROM OWOR WHERE Status IN ('P','R')) AS PendingProductionQuantity,
                (SELECT COUNT(*) FROM OWOR WHERE YEAR(PostDate) = YEAR(GETDATE()) AND MONTH(PostDate) = MONTH(GETDATE())) AS ProductionOrdersThisMonth,
                (SELECT COUNT(*) FROM OWOR WHERE YEAR(PostDate) = YEAR(GETDATE())) AS ProductionOrdersThisYear,
                (SELECT ISNULL(SUM(l.IssuedQty), 0) FROM WOR1 l INNER JOIN OWOR c ON c.DocEntry = l.DocEntry
                    WHERE YEAR(c.PostDate) = YEAR(GETDATE()) AND MONTH(c.PostDate) = MONTH(GETDATE())) AS MaterialConsumptionThisMonth,
                (SELECT ISNULL(SUM(c.CmpltQty * ISNULL(w.AvgPrice, 0)), 0) FROM OWOR c
                    LEFT JOIN OITW w ON w.ItemCode = c.ItemCode AND w.WhsCode = c.Warehouse
                    WHERE YEAR(c.PostDate) = YEAR(GETDATE()) AND MONTH(c.PostDate) = MONTH(GETDATE())) AS ProductionValueThisMonth";

        return await db.QuerySingleAsync<ProductionDashboardDto>(new CommandDefinition(sql, cancellationToken: ct));
    }

    // ---------------------------------------------------------------
    // ANALYTICS
    // ---------------------------------------------------------------
    public async Task<ProductionAnalyticsDto> GetAnalyticsAsync(CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string byMonthSql = @"
            SELECT CONVERT(varchar(7), PostDate, 120) AS Period, COUNT(*) AS OrderCount,
                   SUM(PlannedQty) AS PlannedQty, SUM(CmpltQty) AS ProducedQty
            FROM OWOR
            WHERE PostDate >= DATEADD(MONTH, -11, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
            GROUP BY CONVERT(varchar(7), PostDate, 120)
            ORDER BY Period";
        var byMonth = (await db.QueryAsync<ProductionByPeriodDto>(new CommandDefinition(byMonthSql, cancellationToken: ct))).ToList();

        const string byStatusSql = "SELECT Status, COUNT(*) AS Count FROM OWOR GROUP BY Status";
        var byStatusRows = (await db.QueryAsync(new CommandDefinition(byStatusSql, cancellationToken: ct))).ToList();
        var byStatus = byStatusRows.Select(r => new ProductionByStatusDto { Status = MapOrderStatus(r.Status), Count = (int)r.Count }).ToList();

        const string topProducedSql = @"
            SELECT TOP 10 c.ItemCode, i.ItemName, SUM(c.CmpltQty) AS Quantity
            FROM OWOR c
            LEFT JOIN OITM i ON i.ItemCode = c.ItemCode
            GROUP BY c.ItemCode, i.ItemName
            ORDER BY SUM(c.CmpltQty) DESC";
        var topProduced = (await db.QueryAsync<ProductionByItemDto>(new CommandDefinition(topProducedSql, cancellationToken: ct))).ToList();

        const string topConsumedSql = @"
            SELECT TOP 10 l.ItemCode, MAX(l.ItemName) AS ItemName, SUM(l.IssuedQty) AS Quantity
            FROM WOR1 l
            GROUP BY l.ItemCode
            ORDER BY SUM(l.IssuedQty) DESC";
        var topConsumed = (await db.QueryAsync<ProductionByItemDto>(new CommandDefinition(topConsumedSql, cancellationToken: ct))).ToList();

        const string byWarehouseSql = @"
            SELECT c.Warehouse AS WarehouseCode, w.WhsName AS WarehouseName, COUNT(*) AS OrderCount, SUM(c.CmpltQty) AS ProducedQty
            FROM OWOR c
            LEFT JOIN OWHS w ON w.WhsCode = c.Warehouse
            WHERE c.Warehouse IS NOT NULL
            GROUP BY c.Warehouse, w.WhsName
            ORDER BY SUM(c.CmpltQty) DESC";
        var byWarehouse = (await db.QueryAsync<ProductionByWarehouseDto>(new CommandDefinition(byWarehouseSql, cancellationToken: ct))).ToList();

        const string summarySql = @"
            SELECT
                ISNULL(SUM(c.PlannedQty), 0) AS OpenPlannedQuantity,
                ISNULL(SUM(c.CmpltQty), 0) AS OpenProducedQuantity,
                ISNULL(SUM(c.PlannedQty * ISNULL(w.AvgPrice, 0)), 0) AS OpenProductionValue
            FROM OWOR c
            LEFT JOIN OITW w ON w.ItemCode = c.ItemCode AND w.WhsCode = c.Warehouse
            WHERE c.Status IN ('P','R')";
        var summary = await db.QuerySingleAsync(new CommandDefinition(summarySql, cancellationToken: ct));

        return new ProductionAnalyticsDto
        {
            ProductionByMonth = byMonth,
            ProductionByStatus = byStatus,
            TopProducedItems = topProduced,
            TopConsumedMaterials = topConsumed,
            ProductionByWarehouse = byWarehouse,
            OpenPlannedQuantity = (double)summary.OpenPlannedQuantity,
            OpenProducedQuantity = (double)summary.OpenProducedQuantity,
            OpenProductionValue = (decimal)summary.OpenProductionValue
        };
    }
}
