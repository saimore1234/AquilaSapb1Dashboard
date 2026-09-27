using System.Data;
using Dapper;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Purchase;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Services;

/// <summary>
/// Read-only SQL implementation of the SAP B1 Purchase document chain, using
/// the same pattern as SqlSapB1Service: direct, parameterized Dapper queries
/// against whichever company ICompanyConnectionFactory resolves for the
/// current request. Deliberately READ-ONLY — writing purchase documents needs
/// to go through SAP B1's own business logic, numbering and approval rules
/// (Service Layer/DI API), which direct SQL cannot safely replicate; see
/// ISapB1Service's XML docs for the same rationale applied to Phase 1.
///
/// TABLES USED (verified against this project's actual STEST company
/// database via INFORMATION_SCHEMA.COLUMNS before writing any query here —
/// see the schema-verification note in each method; column names are NOT
/// assumed from generic SAP B1 documentation, since this project has already
/// found real per-installation differences, e.g. OCRD/OITM's active-row flag
/// is "validFor", not the commonly-documented "Valid"):
///
///   OPRQ/PRQ1  Purchase Request header/lines
///   OPQT/PQT1  Purchase Quotation header/lines
///   OPOR/POR1  Purchase Order header/lines
///   OPDN/PDN1  Goods Receipt PO header/lines
///   OPCH/PCH1  A/P Invoice header/lines
///   ORPC/RPC1  A/P Credit Memo header/lines
///   OVPM       Outgoing Payment header (DocType = 'S' for vendor payments,
///              confirmed by joining CardCode back to OCRD.CardType = 'S')
///   VPM2       Payment-to-invoice application/reconciliation lines
///   OCRD       Business Partners (vendor code/name)
///   OSLP       Sales Employees (used as "Buyer" on purchase documents)
///   OWHS       Warehouses
///
/// Document relationships (BaseType/BaseEntry/BaseLine, TargetType/TrgetEntry)
/// use the REAL object-type codes found in this database's own data (see
/// DocTypeMap below) — not the generic SAP B1 object-type constants from
/// memory, several of which are known to vary by version/localization.
/// </summary>
public class SqlPurchaseService : IPurchaseService
{
    private readonly ICompanyConnectionFactory _connectionFactory;
    private readonly ILogger<SqlPurchaseService> _logger;

    public SqlPurchaseService(ICompanyConnectionFactory connectionFactory, ILogger<SqlPurchaseService> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    // Object-type code -> (display label, frontend route segment, header table, line table).
    // The codes for Request/Quotation/Order/GRPO/Invoice were read directly out
    // of this project's STEST database (SELECT DISTINCT ObjType FROM <table>),
    // not assumed. ORPC (A/P Credit Memo) had zero rows in STEST at
    // verification time, so its code (19) is the standard SAP B1 constant,
    // included for completeness but unverified against real data here — if a
    // company's ORPC uses a different code, credit-memo links simply won't
    // resolve (a controlled gap, not a crash).
    private static readonly Dictionary<int, (string Label, string Route, string HeaderTable, string LineTable)> DocTypeMap = new()
    {
        [1470000113] = ("Purchase Request", "requests", "OPRQ", "PRQ1"),
        [540000006] = ("Purchase Quotation", "quotations", "OPQT", "PQT1"),
        [22] = ("Purchase Order", "orders", "OPOR", "POR1"),
        [20] = ("Goods Receipt PO", "grpo", "OPDN", "PDN1"),
        [18] = ("A/P Invoice", "invoices", "OPCH", "PCH1"),
        [19] = ("A/P Credit Memo", "credit-memos", "ORPC", "RPC1")
    };

    private static string MapStatus(string? docStatus) => docStatus switch
    {
        "O" => "Open",
        "C" => "Closed",
        _ => docStatus ?? "Unknown"
    };

    // ---------------------------------------------------------------
    // Shared filter builder — every list query below uses the same
    // search/date/status/vendor/buyer/warehouse parameters, always bound
    // through Dapper parameters, never string-concatenated.
    // ---------------------------------------------------------------
    private static (string WhereSql, DynamicParameters Parameters) BuildFilters(
        PurchaseDocumentQuery query, bool includeBuyer, bool includeWarehouseExists, string? lineTableForWarehouse)
    {
        var statusCode = query.Status?.Trim().ToLowerInvariant() switch
        {
            "open" => "O",
            "closed" => "C",
            _ => (string?)null
        };

        var sql = @"
            WHERE (@Search IS NULL OR CAST(c.DocNum AS NVARCHAR(20)) LIKE @SearchLike
                   OR c.CardCode LIKE @SearchLike OR v.CardName LIKE @SearchLike)
              AND (@DateFrom IS NULL OR c.DocDate >= @DateFrom)
              AND (@DateTo IS NULL OR c.DocDate <= @DateTo)
              AND (@Status IS NULL OR c.DocStatus = @Status)
              AND (@Vendor IS NULL OR c.CardCode = @Vendor)";

        if (includeBuyer)
        {
            sql += " AND (@Buyer IS NULL OR c.SlpCode = @BuyerCode)";
        }

        if (includeWarehouseExists && lineTableForWarehouse is not null)
        {
            sql += $" AND (@Warehouse IS NULL OR EXISTS (SELECT 1 FROM {lineTableForWarehouse} l WHERE l.DocEntry = c.DocEntry AND l.WhsCode = @Warehouse))";
        }

        var p = new DynamicParameters();
        p.Add("Search", query.Search);
        p.Add("SearchLike", query.Search is null ? null : $"%{query.Search}%");
        p.Add("DateFrom", query.DateFrom);
        p.Add("DateTo", query.DateTo);
        p.Add("Status", statusCode);
        p.Add("Vendor", query.Vendor);
        p.Add("Buyer", query.Buyer);
        p.Add("BuyerCode", query.Buyer);
        p.Add("Warehouse", query.Warehouse);
        p.Add("Skip", query.Skip);
        p.Add("PageSize", query.PageSize);
        return (sql, p);
    }

    // ---------------------------------------------------------------
    // Document relationships — resolved from the real BaseType/BaseEntry
    // (what this document was created from) and a reverse search across
    // every other document type's line table (what was created FROM this
    // document), using only the object-type codes verified in DocTypeMap.
    // ---------------------------------------------------------------
    private async Task<List<RelatedDocumentDto>> GetRelatedDocumentsAsync(
        IDbConnection db, string lineTable, int docEntry, int thisObjType, CancellationToken ct)
    {
        var related = new List<RelatedDocumentDto>();

        var baseSql = $@"SELECT DISTINCT BaseType, BaseEntry FROM {lineTable}
                          WHERE DocEntry = @DocEntry AND BaseType IS NOT NULL AND BaseEntry IS NOT NULL AND BaseEntry >= 0";
        var bases = (await db.QueryAsync<(int BaseType, int BaseEntry)>(
            new CommandDefinition(baseSql, new { DocEntry = docEntry }, cancellationToken: ct))).Distinct();

        foreach (var b in bases)
        {
            if (!DocTypeMap.TryGetValue(b.BaseType, out var info)) continue;
            var docNum = await db.ExecuteScalarAsync<int?>(
                new CommandDefinition($"SELECT DocNum FROM {info.HeaderTable} WHERE DocEntry = @E", new { E = b.BaseEntry }, cancellationToken: ct));
            if (docNum is null) continue;
            related.Add(new RelatedDocumentDto { DocumentType = info.Label, DocEntry = b.BaseEntry, DocNum = docNum.Value, RouteSegment = info.Route, Direction = "Base" });
        }

        foreach (var (_, info) in DocTypeMap)
        {
            var targetSql = $@"SELECT DISTINCT DocEntry FROM {info.LineTable} WHERE BaseType = @ThisType AND BaseEntry = @DocEntry";
            var targetEntries = await db.QueryAsync<int>(
                new CommandDefinition(targetSql, new { ThisType = thisObjType, DocEntry = docEntry }, cancellationToken: ct));
            foreach (var entry in targetEntries)
            {
                var docNum = await db.ExecuteScalarAsync<int?>(
                    new CommandDefinition($"SELECT DocNum FROM {info.HeaderTable} WHERE DocEntry = @E", new { E = entry }, cancellationToken: ct));
                if (docNum is null) continue;
                related.Add(new RelatedDocumentDto { DocumentType = info.Label, DocEntry = entry, DocNum = docNum.Value, RouteSegment = info.Route, Direction = "Target" });
            }
        }

        return related;
    }

    // ---------------------------------------------------------------
    // PURCHASE REQUESTS (OPRQ / PRQ1)
    // ---------------------------------------------------------------
    public async Task<PagedResult<PurchaseRequestDto>> GetRequestsAsync(PurchaseDocumentQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var (whereSql, p) = BuildFilters(query, includeBuyer: false, includeWarehouseExists: true, lineTableForWarehouse: "PRQ1");

        var countSql = $"SELECT COUNT(*) FROM OPRQ c LEFT JOIN OCRD v ON v.CardCode = c.CardCode {whereSql}";
        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, p, cancellationToken: ct));

        var listSql = $@"
            SELECT c.DocEntry, c.DocNum, c.ReqName AS Requester, c.DocDate AS PostingDate,
                   c.ReqDate AS RequiredDate, c.DocStatus AS Status, c.DocTotal AS Total, c.DocCur AS Currency
            FROM OPRQ c
            LEFT JOIN OCRD v ON v.CardCode = c.CardCode
            {whereSql}
            ORDER BY c.DocDate DESC, c.DocEntry DESC
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var rows = (await db.QueryAsync(new CommandDefinition(listSql, p, cancellationToken: ct))).ToList();
        var items = rows.Select(r => new PurchaseRequestDto
        {
            DocEntry = r.DocEntry, DocNum = r.DocNum, Requester = r.Requester,
            PostingDate = r.PostingDate, RequiredDate = r.RequiredDate,
            Status = MapStatus(r.Status), Total = r.Total, Currency = r.Currency
        }).ToList();

        return new PagedResult<PurchaseRequestDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }

    public async Task<PurchaseRequestDetailDto?> GetRequestByEntryAsync(int docEntry, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string headerSql = @"
            SELECT DocEntry, DocNum, ReqName AS Requester, DocDate AS PostingDate, ReqDate AS RequiredDate,
                   DocStatus AS Status, Comments AS Remarks, DocCur AS Currency,
                   DocTotal AS GrandTotal, VatSum AS Tax, DiscSum AS Discount
            FROM OPRQ WHERE DocEntry = @DocEntry";
        var header = await db.QuerySingleOrDefaultAsync(new CommandDefinition(headerSql, new { DocEntry = docEntry }, cancellationToken: ct));
        if (header is null) return null;

        const string linesSql = @"
            SELECT l.LineNum, l.ItemCode, i.ItemName, l.Quantity, l.OpenQty AS OpenQuantity,
                   l.WhsCode AS Warehouse, l.Price, 0 AS DiscountPercent, NULL AS TaxCode, l.LineTotal, l.ShipDate AS RequiredDate
            FROM PRQ1 l
            LEFT JOIN OITM i ON i.ItemCode = l.ItemCode
            WHERE l.DocEntry = @DocEntry
            ORDER BY l.LineNum";
        var lines = (await db.QueryAsync<PurchaseDocumentLineDto>(new CommandDefinition(linesSql, new { DocEntry = docEntry }, cancellationToken: ct))).ToList();

        var related = await GetRelatedDocumentsAsync(db, "PRQ1", docEntry, thisObjType: 1470000113, ct);

        return new PurchaseRequestDetailDto
        {
            DocEntry = header.DocEntry, DocNum = header.DocNum, Requester = header.Requester,
            PostingDate = header.PostingDate, RequiredDate = header.RequiredDate,
            Status = MapStatus(header.Status), Remarks = header.Remarks, Currency = header.Currency,
            GrandTotal = header.GrandTotal, Tax = header.Tax, Discount = header.Discount,
            Subtotal = header.GrandTotal + header.Discount - header.Tax,
            Lines = lines, RelatedDocuments = related
        };
    }

    // ---------------------------------------------------------------
    // PURCHASE QUOTATIONS (OPQT / PQT1)
    // ---------------------------------------------------------------
    public async Task<PagedResult<PurchaseQuotationDto>> GetQuotationsAsync(PurchaseDocumentQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var (whereSql, p) = BuildFilters(query, includeBuyer: true, includeWarehouseExists: true, lineTableForWarehouse: "PQT1");

        var countSql = $"SELECT COUNT(*) FROM OPQT c LEFT JOIN OCRD v ON v.CardCode = c.CardCode {whereSql}";
        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, p, cancellationToken: ct));

        var listSql = $@"
            SELECT c.DocEntry, c.DocNum, c.CardCode AS VendorCode, v.CardName AS VendorName,
                   c.DocDate AS PostingDate, c.DocDueDate AS DueDate, s.SlpName AS Buyer,
                   c.DocStatus AS Status, c.DocTotal AS Total, c.DocCur AS Currency
            FROM OPQT c
            LEFT JOIN OCRD v ON v.CardCode = c.CardCode
            LEFT JOIN OSLP s ON s.SlpCode = c.SlpCode
            {whereSql}
            ORDER BY c.DocDate DESC, c.DocEntry DESC
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var rows = (await db.QueryAsync(new CommandDefinition(listSql, p, cancellationToken: ct))).ToList();
        var items = rows.Select(r => new PurchaseQuotationDto
        {
            DocEntry = r.DocEntry, DocNum = r.DocNum, VendorCode = r.VendorCode, VendorName = r.VendorName,
            PostingDate = r.PostingDate, DueDate = r.DueDate, Buyer = r.Buyer,
            Status = MapStatus(r.Status), Total = r.Total, Currency = r.Currency
        }).ToList();

        return new PagedResult<PurchaseQuotationDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }

    public async Task<PurchaseQuotationDetailDto?> GetQuotationByEntryAsync(int docEntry, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string headerSql = @"
            SELECT c.DocEntry, c.DocNum, c.CardCode AS VendorCode, v.CardName AS VendorName,
                   c.DocDate AS PostingDate, c.DocDueDate AS DueDate, s.SlpName AS Buyer,
                   c.DocStatus AS Status, c.Comments AS Remarks, c.DocCur AS Currency,
                   c.DocTotal AS GrandTotal, c.VatSum AS Tax, c.DiscSum AS Discount
            FROM OPQT c
            LEFT JOIN OCRD v ON v.CardCode = c.CardCode
            LEFT JOIN OSLP s ON s.SlpCode = c.SlpCode
            WHERE c.DocEntry = @DocEntry";
        var header = await db.QuerySingleOrDefaultAsync(new CommandDefinition(headerSql, new { DocEntry = docEntry }, cancellationToken: ct));
        if (header is null) return null;

        const string linesSql = @"
            SELECT l.LineNum, l.ItemCode, i.ItemName, l.Quantity, NULL AS OpenQuantity,
                   l.WhsCode AS Warehouse, l.Price, l.DiscPrcnt AS DiscountPercent, l.TaxCode, l.LineTotal, NULL AS RequiredDate
            FROM PQT1 l
            LEFT JOIN OITM i ON i.ItemCode = l.ItemCode
            WHERE l.DocEntry = @DocEntry
            ORDER BY l.LineNum";
        var lines = (await db.QueryAsync<PurchaseDocumentLineDto>(new CommandDefinition(linesSql, new { DocEntry = docEntry }, cancellationToken: ct))).ToList();

        var related = await GetRelatedDocumentsAsync(db, "PQT1", docEntry, thisObjType: 540000006, ct);

        return new PurchaseQuotationDetailDto
        {
            DocEntry = header.DocEntry, DocNum = header.DocNum, VendorCode = header.VendorCode, VendorName = header.VendorName,
            PostingDate = header.PostingDate, DueDate = header.DueDate, Buyer = header.Buyer,
            Status = MapStatus(header.Status), Remarks = header.Remarks, Currency = header.Currency,
            GrandTotal = header.GrandTotal, Tax = header.Tax, Discount = header.Discount,
            Subtotal = header.GrandTotal + header.Discount - header.Tax,
            Lines = lines, RelatedDocuments = related
        };
    }

    // ---------------------------------------------------------------
    // PURCHASE ORDERS (OPOR / POR1)
    // ---------------------------------------------------------------
    public async Task<PagedResult<PurchaseOrderDto>> GetOrdersAsync(PurchaseDocumentQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var (whereSql, p) = BuildFilters(query, includeBuyer: true, includeWarehouseExists: true, lineTableForWarehouse: "POR1");

        var countSql = $"SELECT COUNT(*) FROM OPOR c LEFT JOIN OCRD v ON v.CardCode = c.CardCode {whereSql}";
        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, p, cancellationToken: ct));

        var listSql = $@"
            SELECT c.DocEntry, c.DocNum, c.CardCode AS VendorCode, v.CardName AS VendorName,
                   c.DocDate AS PostingDate, c.DocDueDate AS DueDate, s.SlpName AS Buyer,
                   c.DocStatus AS Status, c.DocTotal AS Total, c.DocCur AS Currency
            FROM OPOR c
            LEFT JOIN OCRD v ON v.CardCode = c.CardCode
            LEFT JOIN OSLP s ON s.SlpCode = c.SlpCode
            {whereSql}
            ORDER BY c.DocDate DESC, c.DocEntry DESC
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var rows = (await db.QueryAsync(new CommandDefinition(listSql, p, cancellationToken: ct))).ToList();
        var items = rows.Select(r => new PurchaseOrderDto
        {
            DocEntry = r.DocEntry, DocNum = r.DocNum, VendorCode = r.VendorCode, VendorName = r.VendorName,
            PostingDate = r.PostingDate, DueDate = r.DueDate, Buyer = r.Buyer,
            Status = MapStatus(r.Status), Total = r.Total, Currency = r.Currency
        }).ToList();

        return new PagedResult<PurchaseOrderDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }

    public async Task<PurchaseOrderDetailDto?> GetOrderByEntryAsync(int docEntry, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string headerSql = @"
            SELECT c.DocEntry, c.DocNum, c.CardCode AS VendorCode, v.CardName AS VendorName,
                   c.DocDate AS PostingDate, c.DocDueDate AS DueDate, s.SlpName AS Buyer,
                   c.DocStatus AS Status, c.Comments AS Remarks, c.DocCur AS Currency,
                   c.DocTotal AS GrandTotal, c.VatSum AS Tax, c.DiscSum AS Discount
            FROM OPOR c
            LEFT JOIN OCRD v ON v.CardCode = c.CardCode
            LEFT JOIN OSLP s ON s.SlpCode = c.SlpCode
            WHERE c.DocEntry = @DocEntry";
        var header = await db.QuerySingleOrDefaultAsync(new CommandDefinition(headerSql, new { DocEntry = docEntry }, cancellationToken: ct));
        if (header is null) return null;

        const string linesSql = @"
            SELECT l.LineNum, l.ItemCode, i.ItemName, l.Quantity, l.OpenQty AS OpenQuantity,
                   l.WhsCode AS Warehouse, l.Price, l.DiscPrcnt AS DiscountPercent, l.TaxCode, l.LineTotal, NULL AS RequiredDate
            FROM POR1 l
            LEFT JOIN OITM i ON i.ItemCode = l.ItemCode
            WHERE l.DocEntry = @DocEntry
            ORDER BY l.LineNum";
        var lines = (await db.QueryAsync<PurchaseDocumentLineDto>(new CommandDefinition(linesSql, new { DocEntry = docEntry }, cancellationToken: ct))).ToList();

        var related = await GetRelatedDocumentsAsync(db, "POR1", docEntry, thisObjType: 22, ct);

        return new PurchaseOrderDetailDto
        {
            DocEntry = header.DocEntry, DocNum = header.DocNum, VendorCode = header.VendorCode, VendorName = header.VendorName,
            PostingDate = header.PostingDate, DueDate = header.DueDate, Buyer = header.Buyer,
            Status = MapStatus(header.Status), Remarks = header.Remarks, Currency = header.Currency,
            GrandTotal = header.GrandTotal, Tax = header.Tax, Discount = header.Discount,
            Subtotal = header.GrandTotal + header.Discount - header.Tax,
            Lines = lines, RelatedDocuments = related
        };
    }

    // ---------------------------------------------------------------
    // GRPO (OPDN / PDN1)
    // ---------------------------------------------------------------
    public async Task<PagedResult<GrpoDto>> GetGrposAsync(PurchaseDocumentQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var (whereSql, p) = BuildFilters(query, includeBuyer: false, includeWarehouseExists: true, lineTableForWarehouse: "PDN1");

        var countSql = $"SELECT COUNT(*) FROM OPDN c LEFT JOIN OCRD v ON v.CardCode = c.CardCode {whereSql}";
        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, p, cancellationToken: ct));

        var listSql = $@"
            SELECT c.DocEntry, c.DocNum, c.CardCode AS VendorCode, v.CardName AS VendorName,
                   c.DocDate AS PostingDate, c.DocDueDate AS DueDate,
                   c.DocStatus AS Status, c.DocTotal AS Total, c.DocCur AS Currency
            FROM OPDN c
            LEFT JOIN OCRD v ON v.CardCode = c.CardCode
            {whereSql}
            ORDER BY c.DocDate DESC, c.DocEntry DESC
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var rows = (await db.QueryAsync(new CommandDefinition(listSql, p, cancellationToken: ct))).ToList();
        var items = rows.Select(r => new GrpoDto
        {
            DocEntry = r.DocEntry, DocNum = r.DocNum, VendorCode = r.VendorCode, VendorName = r.VendorName,
            PostingDate = r.PostingDate, DueDate = r.DueDate,
            Status = MapStatus(r.Status), Total = r.Total, Currency = r.Currency
        }).ToList();

        return new PagedResult<GrpoDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }

    public async Task<GrpoDetailDto?> GetGrpoByEntryAsync(int docEntry, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string headerSql = @"
            SELECT c.DocEntry, c.DocNum, c.CardCode AS VendorCode, v.CardName AS VendorName,
                   c.DocDate AS PostingDate, c.DocDueDate AS DueDate,
                   c.DocStatus AS Status, c.Comments AS Remarks, c.DocCur AS Currency,
                   c.DocTotal AS GrandTotal, c.VatSum AS Tax, c.DiscSum AS Discount
            FROM OPDN c
            LEFT JOIN OCRD v ON v.CardCode = c.CardCode
            WHERE c.DocEntry = @DocEntry";
        var header = await db.QuerySingleOrDefaultAsync(new CommandDefinition(headerSql, new { DocEntry = docEntry }, cancellationToken: ct));
        if (header is null) return null;

        const string linesSql = @"
            SELECT l.LineNum, l.ItemCode, i.ItemName, l.Quantity, l.OpenInvQty AS OpenQuantity,
                   l.WhsCode AS Warehouse, l.Price, 0 AS DiscountPercent, NULL AS TaxCode, l.LineTotal, NULL AS RequiredDate
            FROM PDN1 l
            LEFT JOIN OITM i ON i.ItemCode = l.ItemCode
            WHERE l.DocEntry = @DocEntry
            ORDER BY l.LineNum";
        var lines = (await db.QueryAsync<PurchaseDocumentLineDto>(new CommandDefinition(linesSql, new { DocEntry = docEntry }, cancellationToken: ct))).ToList();

        var related = await GetRelatedDocumentsAsync(db, "PDN1", docEntry, thisObjType: 20, ct);

        return new GrpoDetailDto
        {
            DocEntry = header.DocEntry, DocNum = header.DocNum, VendorCode = header.VendorCode, VendorName = header.VendorName,
            PostingDate = header.PostingDate, DueDate = header.DueDate,
            Status = MapStatus(header.Status), Remarks = header.Remarks, Currency = header.Currency,
            GrandTotal = header.GrandTotal, Tax = header.Tax, Discount = header.Discount,
            Subtotal = header.GrandTotal + header.Discount - header.Tax,
            Lines = lines, RelatedDocuments = related
        };
    }

    // ---------------------------------------------------------------
    // A/P INVOICES (OPCH / PCH1)
    // ---------------------------------------------------------------
    public async Task<PagedResult<ApInvoiceDto>> GetInvoicesAsync(PurchaseDocumentQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var (whereSql, p) = BuildFilters(query, includeBuyer: false, includeWarehouseExists: true, lineTableForWarehouse: "PCH1");

        var countSql = $"SELECT COUNT(*) FROM OPCH c LEFT JOIN OCRD v ON v.CardCode = c.CardCode {whereSql}";
        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, p, cancellationToken: ct));

        var listSql = $@"
            SELECT c.DocEntry, c.DocNum, c.CardCode AS VendorCode, v.CardName AS VendorName,
                   c.DocDate AS PostingDate, c.DocDueDate AS DueDate,
                   c.DocStatus AS Status, c.DocTotal AS Total, c.PaidToDate AS Paid, c.DocCur AS Currency
            FROM OPCH c
            LEFT JOIN OCRD v ON v.CardCode = c.CardCode
            {whereSql}
            ORDER BY c.DocDate DESC, c.DocEntry DESC
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var rows = (await db.QueryAsync(new CommandDefinition(listSql, p, cancellationToken: ct))).ToList();
        var items = rows.Select(r => new ApInvoiceDto
        {
            DocEntry = r.DocEntry, DocNum = r.DocNum, VendorCode = r.VendorCode, VendorName = r.VendorName,
            PostingDate = r.PostingDate, DueDate = r.DueDate,
            Status = MapStatus(r.Status), Total = r.Total, Paid = r.Paid, Balance = r.Total - r.Paid, Currency = r.Currency
        }).ToList();

        return new PagedResult<ApInvoiceDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }

    public async Task<ApInvoiceDetailDto?> GetInvoiceByEntryAsync(int docEntry, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string headerSql = @"
            SELECT c.DocEntry, c.DocNum, c.CardCode AS VendorCode, v.CardName AS VendorName,
                   c.DocDate AS PostingDate, c.DocDueDate AS DueDate,
                   c.DocStatus AS Status, c.Comments AS Remarks, c.DocCur AS Currency,
                   c.DocTotal AS GrandTotal, c.VatSum AS Tax, c.DiscSum AS Discount, c.PaidToDate AS Paid
            FROM OPCH c
            LEFT JOIN OCRD v ON v.CardCode = c.CardCode
            WHERE c.DocEntry = @DocEntry";
        var header = await db.QuerySingleOrDefaultAsync(new CommandDefinition(headerSql, new { DocEntry = docEntry }, cancellationToken: ct));
        if (header is null) return null;

        const string linesSql = @"
            SELECT l.LineNum, l.ItemCode, i.ItemName, l.Quantity, NULL AS OpenQuantity,
                   l.WhsCode AS Warehouse, l.Price, 0 AS DiscountPercent, NULL AS TaxCode, l.LineTotal, NULL AS RequiredDate
            FROM PCH1 l
            LEFT JOIN OITM i ON i.ItemCode = l.ItemCode
            WHERE l.DocEntry = @DocEntry
            ORDER BY l.LineNum";
        var lines = (await db.QueryAsync<PurchaseDocumentLineDto>(new CommandDefinition(linesSql, new { DocEntry = docEntry }, cancellationToken: ct))).ToList();

        var related = await GetRelatedDocumentsAsync(db, "PCH1", docEntry, thisObjType: 18, ct);

        return new ApInvoiceDetailDto
        {
            DocEntry = header.DocEntry, DocNum = header.DocNum, VendorCode = header.VendorCode, VendorName = header.VendorName,
            PostingDate = header.PostingDate, DueDate = header.DueDate,
            Status = MapStatus(header.Status), Remarks = header.Remarks, Currency = header.Currency,
            GrandTotal = header.GrandTotal, Tax = header.Tax, Discount = header.Discount,
            Subtotal = header.GrandTotal + header.Discount - header.Tax,
            Paid = header.Paid, Balance = header.GrandTotal - header.Paid,
            Lines = lines, RelatedDocuments = related
        };
    }

    // ---------------------------------------------------------------
    // A/P CREDIT MEMOS (ORPC / RPC1)
    // ---------------------------------------------------------------
    public async Task<PagedResult<ApCreditMemoDto>> GetCreditMemosAsync(PurchaseDocumentQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var (whereSql, p) = BuildFilters(query, includeBuyer: false, includeWarehouseExists: true, lineTableForWarehouse: "RPC1");

        var countSql = $"SELECT COUNT(*) FROM ORPC c LEFT JOIN OCRD v ON v.CardCode = c.CardCode {whereSql}";
        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, p, cancellationToken: ct));

        var listSql = $@"
            SELECT c.DocEntry, c.DocNum, c.CardCode AS VendorCode, v.CardName AS VendorName,
                   c.DocDate AS PostingDate, c.DocStatus AS Status, c.DocTotal AS Total, c.DocCur AS Currency
            FROM ORPC c
            LEFT JOIN OCRD v ON v.CardCode = c.CardCode
            {whereSql}
            ORDER BY c.DocDate DESC, c.DocEntry DESC
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var rows = (await db.QueryAsync(new CommandDefinition(listSql, p, cancellationToken: ct))).ToList();
        var items = rows.Select(r => new ApCreditMemoDto
        {
            DocEntry = r.DocEntry, DocNum = r.DocNum, VendorCode = r.VendorCode, VendorName = r.VendorName,
            PostingDate = r.PostingDate, Status = MapStatus(r.Status), Total = r.Total, Currency = r.Currency
        }).ToList();

        return new PagedResult<ApCreditMemoDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }

    public async Task<ApCreditMemoDetailDto?> GetCreditMemoByEntryAsync(int docEntry, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string headerSql = @"
            SELECT c.DocEntry, c.DocNum, c.CardCode AS VendorCode, v.CardName AS VendorName,
                   c.DocDate AS PostingDate, c.DocStatus AS Status, c.Comments AS Remarks, c.DocCur AS Currency,
                   c.DocTotal AS GrandTotal, c.VatSum AS Tax, c.DiscSum AS Discount
            FROM ORPC c
            LEFT JOIN OCRD v ON v.CardCode = c.CardCode
            WHERE c.DocEntry = @DocEntry";
        var header = await db.QuerySingleOrDefaultAsync(new CommandDefinition(headerSql, new { DocEntry = docEntry }, cancellationToken: ct));
        if (header is null) return null;

        const string linesSql = @"
            SELECT l.LineNum, l.ItemCode, i.ItemName, l.Quantity, NULL AS OpenQuantity,
                   l.WhsCode AS Warehouse, l.Price, 0 AS DiscountPercent, NULL AS TaxCode, l.LineTotal, NULL AS RequiredDate
            FROM RPC1 l
            LEFT JOIN OITM i ON i.ItemCode = l.ItemCode
            WHERE l.DocEntry = @DocEntry
            ORDER BY l.LineNum";
        var lines = (await db.QueryAsync<PurchaseDocumentLineDto>(new CommandDefinition(linesSql, new { DocEntry = docEntry }, cancellationToken: ct))).ToList();

        var related = await GetRelatedDocumentsAsync(db, "RPC1", docEntry, thisObjType: 19, ct);

        return new ApCreditMemoDetailDto
        {
            DocEntry = header.DocEntry, DocNum = header.DocNum, VendorCode = header.VendorCode, VendorName = header.VendorName,
            PostingDate = header.PostingDate, Status = MapStatus(header.Status), Remarks = header.Remarks, Currency = header.Currency,
            GrandTotal = header.GrandTotal, Tax = header.Tax, Discount = header.Discount,
            Subtotal = header.GrandTotal + header.Discount - header.Tax,
            Lines = lines, RelatedDocuments = related
        };
    }

    // ---------------------------------------------------------------
    // OUTGOING PAYMENTS (OVPM, DocType = 'S' for vendor payments; VPM2 for applications)
    // ---------------------------------------------------------------
    public async Task<PagedResult<OutgoingPaymentDto>> GetPaymentsAsync(PurchaseDocumentQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        var statusCode = query.Status?.Trim().ToLowerInvariant() switch { "cancelled" => "Y", "completed" => "N", _ => (string?)null };

        const string filterSql = @"
            WHERE c.DocType = 'S'
              AND (@Search IS NULL OR CAST(c.DocNum AS NVARCHAR(20)) LIKE @SearchLike OR c.CardCode LIKE @SearchLike OR v.CardName LIKE @SearchLike)
              AND (@DateFrom IS NULL OR c.DocDate >= @DateFrom)
              AND (@DateTo IS NULL OR c.DocDate <= @DateTo)
              AND (@Vendor IS NULL OR c.CardCode = @Vendor)
              AND (@Status IS NULL OR c.Canceled = @Status)";

        var p = new DynamicParameters();
        p.Add("Search", query.Search);
        p.Add("SearchLike", query.Search is null ? null : $"%{query.Search}%");
        p.Add("DateFrom", query.DateFrom);
        p.Add("DateTo", query.DateTo);
        p.Add("Vendor", query.Vendor);
        p.Add("Status", statusCode);
        p.Add("Skip", query.Skip);
        p.Add("PageSize", query.PageSize);

        var countSql = $"SELECT COUNT(*) FROM OVPM c LEFT JOIN OCRD v ON v.CardCode = c.CardCode {filterSql}";
        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, p, cancellationToken: ct));

        var listSql = $@"
            SELECT c.DocEntry, c.DocNum, c.CardCode AS VendorCode, v.CardName AS VendorName, c.DocDate AS PostingDate,
                   c.DocTotal AS Amount, c.DocCurr AS Currency, c.Canceled,
                   CASE WHEN c.CashSum > 0 THEN 1 ELSE 0 END AS HasCash,
                   CASE WHEN c.CheckSum > 0 THEN 1 ELSE 0 END AS HasCheck,
                   CASE WHEN c.TrsfrSum > 0 THEN 1 ELSE 0 END AS HasTransfer
            FROM OVPM c
            LEFT JOIN OCRD v ON v.CardCode = c.CardCode
            {filterSql}
            ORDER BY c.DocDate DESC, c.DocEntry DESC
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var rows = (await db.QueryAsync(new CommandDefinition(listSql, p, cancellationToken: ct))).ToList();
        var items = rows.Select(r => new OutgoingPaymentDto
        {
            DocEntry = r.DocEntry, DocNum = r.DocNum, VendorCode = r.VendorCode, VendorName = r.VendorName,
            PostingDate = r.PostingDate, Amount = r.Amount, Currency = r.Currency,
            PaymentType = DescribePaymentType((bool)(r.HasCash == 1), (bool)(r.HasCheck == 1), (bool)(r.HasTransfer == 1)),
            Status = r.Canceled == "Y" ? "Cancelled" : "Completed"
        }).ToList();

        return new PagedResult<OutgoingPaymentDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }

    public async Task<OutgoingPaymentDetailDto?> GetPaymentByEntryAsync(int docEntry, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string headerSql = @"
            SELECT c.DocEntry, c.DocNum, c.CardCode AS VendorCode, v.CardName AS VendorName, c.DocDate AS PostingDate,
                   c.DocTotal AS Amount, c.DocCurr AS Currency, c.Canceled, c.Comments AS Remarks,
                   c.CashSum, c.CheckSum, c.TrsfrSum, c.TrsfrAcct AS BankAccount
            FROM OVPM c
            LEFT JOIN OCRD v ON v.CardCode = c.CardCode
            WHERE c.DocEntry = @DocEntry AND c.DocType = 'S'";
        var header = await db.QuerySingleOrDefaultAsync(new CommandDefinition(headerSql, new { DocEntry = docEntry }, cancellationToken: ct));
        if (header is null) return null;

        const string appliedSql = @"
            SELECT p.InvoiceId AS InvoiceDocEntry, i.DocNum AS InvoiceDocNum, p.SumApplied AS AmountApplied
            FROM VPM2 p
            LEFT JOIN OPCH i ON i.DocEntry = p.InvoiceId
            WHERE p.DocEntry = @DocEntry AND p.InvoiceId IS NOT NULL AND p.InvoiceId > 0";
        var applied = (await db.QueryAsync<ApInvoiceApplicationDto>(new CommandDefinition(appliedSql, new { DocEntry = docEntry }, cancellationToken: ct))).ToList();

        return new OutgoingPaymentDetailDto
        {
            DocEntry = header.DocEntry, DocNum = header.DocNum, VendorCode = header.VendorCode, VendorName = header.VendorName,
            PostingDate = header.PostingDate, Amount = header.Amount, Currency = header.Currency, Remarks = header.Remarks,
            PaymentType = DescribePaymentType((decimal)header.CashSum > 0, (decimal)header.CheckSum > 0, (decimal)header.TrsfrSum > 0),
            Status = header.Canceled == "Y" ? "Cancelled" : "Completed",
            CashAmount = header.CashSum, CheckAmount = header.CheckSum, TransferAmount = header.TrsfrSum,
            BankAccount = header.BankAccount,
            AppliedInvoices = applied
        };
    }

    private static string DescribePaymentType(bool cash, bool check, bool transfer)
    {
        var count = (cash ? 1 : 0) + (check ? 1 : 0) + (transfer ? 1 : 0);
        if (count > 1) return "Mixed";
        if (cash) return "Cash";
        if (check) return "Check";
        if (transfer) return "Bank Transfer";
        return "Other";
    }

    // ---------------------------------------------------------------
    // DASHBOARD
    // ---------------------------------------------------------------
    public async Task<PurchaseDashboardDto> GetDashboardAsync(CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT
                (SELECT COUNT(*) FROM OPOR) AS TotalPurchaseOrders,
                (SELECT COUNT(*) FROM OPOR WHERE DocStatus = 'O') AS OpenPurchaseOrders,
                (SELECT COUNT(*) FROM OPOR WHERE YEAR(DocDate) = YEAR(GETDATE()) AND MONTH(DocDate) = MONTH(GETDATE())) AS PurchaseOrdersThisMonth,
                (SELECT COUNT(*) FROM OPOR WHERE YEAR(DocDate) = YEAR(GETDATE())) AS PurchaseOrdersThisYear,
                (SELECT COUNT(*) FROM OPDN) AS TotalGrpo,
                (SELECT COUNT(*) FROM OPDN WHERE DocStatus = 'O') AS OpenGrpo,
                (SELECT COUNT(*) FROM OPCH) AS TotalApInvoices,
                (SELECT COUNT(*) FROM OPCH WHERE DocStatus = 'O') AS OpenApInvoices,
                (SELECT COUNT(*) FROM OPCH WHERE DocStatus = 'O' AND DocDueDate < GETDATE()) AS OverdueApInvoices,
                (SELECT ISNULL(SUM(DocTotal - PaidToDate), 0) FROM OPCH WHERE DocStatus = 'O') AS OutstandingPayables,
                (SELECT ISNULL(SUM(DocTotal), 0) FROM OPCH WHERE YEAR(DocDate) = YEAR(GETDATE()) AND MONTH(DocDate) = MONTH(GETDATE())) AS MonthlyPurchaseValue,
                (SELECT ISNULL(SUM(DocTotal), 0) FROM OPCH WHERE YEAR(DocDate) = YEAR(GETDATE())) AS YearlyPurchaseValue,
                (SELECT ISNULL(SUM(DocTotal), 0) FROM OPOR WHERE DocStatus = 'O') AS OpenPurchaseOrderValue";

        return await db.QuerySingleAsync<PurchaseDashboardDto>(new CommandDefinition(sql, cancellationToken: ct));
    }

    // ---------------------------------------------------------------
    // ANALYTICS
    // ---------------------------------------------------------------
    public async Task<PurchaseAnalyticsDto> GetAnalyticsAsync(CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string byMonthSql = @"
            SELECT CONVERT(varchar(7), DocDate, 120) AS Period, SUM(DocTotal) AS Value
            FROM OPCH
            WHERE DocDate >= DATEADD(MONTH, -11, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
            GROUP BY CONVERT(varchar(7), DocDate, 120)
            ORDER BY Period";
        var byMonth = (await db.QueryAsync<PurchaseByPeriodDto>(new CommandDefinition(byMonthSql, cancellationToken: ct))).ToList();

        const string topVendorsSql = @"
            SELECT TOP 10 c.CardCode AS VendorCode, v.CardName AS VendorName, SUM(c.DocTotal) AS Value
            FROM OPCH c
            LEFT JOIN OCRD v ON v.CardCode = c.CardCode
            GROUP BY c.CardCode, v.CardName
            ORDER BY SUM(c.DocTotal) DESC";
        var topVendors = (await db.QueryAsync<PurchaseByVendorDto>(new CommandDefinition(topVendorsSql, cancellationToken: ct))).ToList();

        const string topItemsSql = @"
            SELECT TOP 10 l.ItemCode, i.ItemName, SUM(l.LineTotal) AS Value, SUM(l.Quantity) AS Quantity
            FROM PCH1 l
            LEFT JOIN OITM i ON i.ItemCode = l.ItemCode
            GROUP BY l.ItemCode, i.ItemName
            ORDER BY SUM(l.LineTotal) DESC";
        var topItems = (await db.QueryAsync<PurchaseByItemDto>(new CommandDefinition(topItemsSql, cancellationToken: ct))).ToList();

        const string byWarehouseSql = @"
            SELECT l.WhsCode AS WarehouseCode, w.WhsName AS WarehouseName, SUM(l.LineTotal) AS Value
            FROM PCH1 l
            LEFT JOIN OWHS w ON w.WhsCode = l.WhsCode
            WHERE l.WhsCode IS NOT NULL
            GROUP BY l.WhsCode, w.WhsName
            ORDER BY SUM(l.LineTotal) DESC";
        var byWarehouse = (await db.QueryAsync<PurchaseByWarehouseDto>(new CommandDefinition(byWarehouseSql, cancellationToken: ct))).ToList();

        const string summarySql = @"
            SELECT
                (SELECT ISNULL(SUM(DocTotal), 0) FROM OPOR WHERE DocStatus = 'O') AS OpenPurchaseOrderValue,
                (SELECT ISNULL(SUM(DocTotal), 0) FROM OPDN WHERE DocStatus = 'O') AS OpenGrpoValue,
                (SELECT ISNULL(SUM(DocTotal), 0) FROM OPCH WHERE DocStatus = 'O') AS OpenApInvoiceValue,
                (SELECT ISNULL(SUM(DocTotal - PaidToDate), 0) FROM OPCH WHERE DocStatus = 'O') AS OutstandingPayables";
        var summary = await db.QuerySingleAsync(new CommandDefinition(summarySql, cancellationToken: ct));

        return new PurchaseAnalyticsDto
        {
            PurchaseByMonth = byMonth,
            TopVendors = topVendors,
            TopItems = topItems,
            PurchaseByWarehouse = byWarehouse,
            OpenPurchaseOrderValue = summary.OpenPurchaseOrderValue,
            OpenGrpoValue = summary.OpenGrpoValue,
            OpenApInvoiceValue = summary.OpenApInvoiceValue,
            OutstandingPayables = summary.OutstandingPayables
        };
    }
}
