using System.Text.RegularExpressions;
using Dapper;
using SAPB1.Api.DTOs.Sales;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Services;

/// <summary>
/// Line-level and ledger reports that reproduce the client's own SAP queries (open sales/purchase order lines, sales
/// register, journal-based customer outstanding). Read-only parameterised Dapper against the company the JWT resolves to.
///
/// Date rule for every report: inclusive start, exclusive end-plus-one-day (DocDate >= @From AND DocDate &lt; @To + 1 day),
/// with the reporting period passed as typed parameters. Joins to dimension tables (OITM, OWHS, OLCT, OSLP, OCRD) are all
/// many-to-one, so they never multiply document lines; totals are computed by the same FROM/WHERE as the rows shown.
/// </summary>
public class SqlSalesDetailReportsService : ISalesDetailReportsService
{
    private readonly ICompanyConnectionFactory _connectionFactory;
    private readonly ICompanyContext _company;
    private readonly IConfiguration _config;

    public SqlSalesDetailReportsService(ICompanyConnectionFactory connectionFactory, ICompanyContext company, IConfiguration config)
    {
        _connectionFactory = connectionFactory;
        _company = company;
        _config = config;
    }

    private static DateTime FyStart(DateTime today) => new(today.Month >= 4 ? today.Year : today.Year - 1, 4, 1);

    private static (DateTime From, DateTime To) Range(DateTime? from, DateTime? to)
    {
        var today = DateTime.Today;
        return ((from ?? FyStart(today)).Date, (to ?? today).Date);
    }

    /// <summary>Escapes LIKE wildcards so a user's text is matched literally.</summary>
    private static string? Like(string? term)
    {
        if (string.IsNullOrWhiteSpace(term)) return null;
        var t = term.Trim();
        if (t.Length > 100) t = t[..100];
        return "%" + Regex.Replace(t, @"[\[%_]", "[$0]") + "%";
    }

    private static string? Clean(string? v, int max = 50) => string.IsNullOrWhiteSpace(v) ? null : v.Trim()[..Math.Min(v.Trim().Length, max)];

    private static DynamicParameters Params(DetailReportQuery q, out DateTime from, out DateTime to)
    {
        (from, to) = Range(q.DateFrom, q.DateTo);
        var pageSize = Math.Clamp(q.PageSize, 1, 5000);
        var p = new DynamicParameters();
        p.Add("From", from);
        p.Add("To", to);
        p.Add("Whs", Clean(q.Warehouse));
        p.Add("Unit", q.Unit);
        p.Add("Branch", q.Branch);
        p.Add("Slp", q.Salesperson);
        p.Add("AllDates", q.AllDates ? 1 : 0);
        p.Add("Customer", Clean(q.Customer));
        p.Add("CustGroup", q.CustomerGroup);
        p.Add("Cat", ProductCategories.Canonical(q.ProductCategory));
        p.Add("ItemLike", Like(q.Item));
        var locs = q.Locations is { Length: > 0 } ? q.Locations : null;
        p.Add("Locs", locs ?? new[] { int.MinValue }); // never expanded to an empty list; HasLocs gates it
        p.Add("HasLocs", locs is null ? 0 : 1);
        p.Add("Skip", (Math.Max(1, q.Page) - 1) * pageSize);
        p.Add("Take", pageSize);
        return p;
    }

    private Dictionary<string, string> UnitLabels() =>
        (_config.GetSection($"SalesTurnover:UnitLabels:{_company.CompanyCode}").Get<Dictionary<string, string>>() ?? new())
            .GroupBy(kv => new string(kv.Key.Where(c => !char.IsWhiteSpace(c)).ToArray()).ToLowerInvariant())
            .ToDictionary(g => g.Key, g => g.First().Value);

    // ------------------------------------------------------------------ filter options
    public async Task<ReportFilterOptionsDto> GetFilterOptionsAsync(CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var dto = new ReportFilterOptionsDto { ProductCategories = ProductCategories.All.ToList() };
        dto.Units = (await db.QueryAsync<TurnoverOptionDto>(new CommandDefinition("SELECT Code, Location AS Name FROM OLCT ORDER BY Location", cancellationToken: ct))).ToList();
        var labels = UnitLabels();
        foreach (var u in dto.Units) u.Label = labels.GetValueOrDefault(new string(u.Name.Where(c => !char.IsWhiteSpace(c)).ToArray()).ToLowerInvariant());
        dto.Branches = (await db.QueryAsync<TurnoverOptionDto>(new CommandDefinition("SELECT BPLId AS Code, BPLName AS Name FROM OBPL ORDER BY BPLName", cancellationToken: ct))).ToList();
        dto.CustomerGroups = (await db.QueryAsync<TurnoverOptionDto>(new CommandDefinition("SELECT GroupCode AS Code, GroupName AS Name FROM OCRG WHERE GroupType = 'C' ORDER BY GroupName", cancellationToken: ct))).ToList();
        dto.Salespersons = (await db.QueryAsync<SalespersonOptionDto>(new CommandDefinition(
            "SELECT SlpCode AS Code, SlpName AS Name, CASE WHEN Active = 'Y' THEN 1 ELSE 0 END AS Active FROM OSLP WHERE SlpCode > 0 ORDER BY SlpName", cancellationToken: ct))).ToList();
        dto.Warehouses = (await db.QueryAsync<WarehouseOptionDto>(new CommandDefinition("SELECT WhsCode AS Code, WhsName AS Name FROM OWHS ORDER BY WhsCode", cancellationToken: ct))).ToList();
        return dto;
    }

    // ------------------------------------------------------------------ Open Sales Orders (client line definition)
    // Client rule: ORDR/RDR1 lines with LineStatus = 'O' on non-cancelled orders; value = the FULL LineTotal of each open
    // line; balance quantity = RDR1.OpenCreQty. Salesperson = the line's own (the client's SO report uses RDR1.SlpCode),
    // falling back to the order header when the line has none (-1 = "no sales employee").
    private static string OpenSoFrom => $@"
        FROM ORDR h
        JOIN RDR1 l ON l.DocEntry = h.DocEntry
        LEFT JOIN OITM i ON i.ItemCode = l.ItemCode
        LEFT JOIN OWHS w ON w.WhsCode = l.WhsCode
        LEFT JOIN OLCT u ON u.Code = l.LocCode
        LEFT JOIN OSLP s ON s.SlpCode = (CASE WHEN l.SlpCode IS NULL OR l.SlpCode = -1 THEN h.SlpCode ELSE l.SlpCode END)
        LEFT JOIN OCRD c ON c.CardCode = h.CardCode
        WHERE h.CANCELED = 'N' AND l.LineStatus = 'O'
          AND (@AllDates = 1 OR (h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To)))
          AND (@Whs IS NULL OR l.WhsCode = @Whs)
          AND (@Unit IS NULL OR l.LocCode = @Unit)
          AND (@Branch IS NULL OR h.BPLId = @Branch)
          AND (@Slp IS NULL OR (CASE WHEN l.SlpCode IS NULL OR l.SlpCode = -1 THEN h.SlpCode ELSE l.SlpCode END) = @Slp)
          AND (@Customer IS NULL OR h.CardCode = @Customer)
          AND (@CustGroup IS NULL OR c.GroupCode = @CustGroup)
          AND (@ItemLike IS NULL OR l.ItemCode LIKE @ItemLike OR l.Dscription LIKE @ItemLike)
          AND (@Cat IS NULL OR {ProductCategories.Expr("i")} = @Cat)";

    public async Task<OpenSalesOrderReportDto> GetOpenSalesOrderLinesAsync(DetailReportQuery q, CancellationToken ct = default)
    {
        var p = Params(q, out var from, out var to);
        using var db = _connectionFactory.CreateConnection();

        var totals = await db.QuerySingleAsync<OpenOrderTotalsDto>(new CommandDefinition($@"
            SELECT COUNT(*) AS OpenLines, COUNT(DISTINCT h.DocEntry) AS DistinctOrders,
                   ISNULL(SUM(l.Quantity), 0) AS OrderedQuantity, ISNULL(SUM(l.OpenCreQty), 0) AS OpenQuantity, ISNULL(SUM(l.LineTotal), 0) AS LineTotal
            {OpenSoFrom}", p, cancellationToken: ct));

        var rows = (await db.QueryAsync<OpenSalesOrderLineDto>(new CommandDefinition($@"
            SELECT h.DocEntry, h.DocNum, h.DocDate AS PostingDate, l.ShipDate AS DueDate, h.CardCode AS CustomerCode, h.CardName AS CustomerName,
                   l.ItemCode, l.Dscription AS ItemDescription, {ProductCategories.Expr("i")} AS ProductCategory,
                   l.WhsCode AS WarehouseCode, w.WhsName AS Warehouse, u.Location AS Unit, s.SlpName AS Salesperson,
                   l.Quantity AS OrderedQuantity, l.OpenCreQty AS OpenQuantity, l.Price AS UnitPrice, l.LineTotal,
                   h.DocStatus AS DocumentStatus, l.LineStatus
            {OpenSoFrom}
            ORDER BY h.DocDate DESC, h.DocNum DESC, l.LineNum
            OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY", p, cancellationToken: ct))).ToList();

        return new OpenSalesOrderReportDto { DateFrom = from, DateTo = to, Totals = totals, TotalCount = totals.OpenLines, Rows = rows };
    }

    // ------------------------------------------------------------------ Open Purchase Orders (client query)
    private const string OpenPoFrom = @"
        FROM OPOR h
        JOIN POR1 l ON l.DocEntry = h.DocEntry
        LEFT JOIN OWHS w ON w.WhsCode = l.WhsCode
        WHERE h.CANCELED = 'N' AND l.LineStatus = 'O'
          AND h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To)
          AND (@Whs IS NULL OR l.WhsCode = @Whs)
          AND (@Branch IS NULL OR h.BPLId = @Branch)
          AND (@Customer IS NULL OR h.CardCode = @Customer)
          AND (@ItemLike IS NULL OR l.ItemCode LIKE @ItemLike OR l.Dscription LIKE @ItemLike)";

    public async Task<OpenPurchaseOrderReportDto> GetOpenPurchaseOrderLinesAsync(DetailReportQuery q, CancellationToken ct = default)
    {
        var p = Params(q, out var from, out var to);
        using var db = _connectionFactory.CreateConnection();

        var totals = await db.QuerySingleAsync<OpenOrderTotalsDto>(new CommandDefinition($@"
            SELECT COUNT(*) AS OpenLines, COUNT(DISTINCT h.DocEntry) AS DistinctOrders,
                   ISNULL(SUM(l.Quantity), 0) AS OrderedQuantity, ISNULL(SUM(l.OpenCreQty), 0) AS OpenQuantity, ISNULL(SUM(l.LineTotal), 0) AS LineTotal
            {OpenPoFrom}", p, cancellationToken: ct));

        var rows = (await db.QueryAsync<OpenPurchaseOrderLineDto>(new CommandDefinition($@"
            SELECT h.DocEntry, h.DocNum, h.DocDate AS PostingDate, l.ShipDate AS DueDate, h.CardCode AS VendorCode, h.CardName AS VendorName,
                   l.ItemCode, l.Dscription AS ItemDescription, l.WhsCode AS WarehouseCode, w.WhsName AS Warehouse,
                   l.Quantity AS OrderedQuantity, l.OpenCreQty AS OpenQuantity, l.Price AS UnitPrice, l.LineTotal, h.DocStatus AS DocumentStatus
            {OpenPoFrom}
            ORDER BY h.DocDate DESC, h.DocNum DESC, l.LineNum
            OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY", p, cancellationToken: ct))).ToList();

        return new OpenPurchaseOrderReportDto { DateFrom = from, DateTo = to, Totals = totals, TotalCount = totals.OpenLines, Rows = rows };
    }

    // ------------------------------------------------------------------ Sales Register
    // A/R invoice lines positive, A/R credit-memo lines with the sign reversed; cancelled documents excluded; unit = line
    // location; salesperson = document header. NetSales is the reconciled "client basis" amount (line total less the
    // document's header discount spread over its lines, excl. tax) so the footer reconciles with Total Turnover.
    private const string RegisterCte = @"
        WITH reg AS (
            SELECT 1 AS Sgn, 'A/R Invoice' AS DocType, h.DocEntry, h.DocNum, h.DocDate, h.CardCode, h.CardName, h.SlpCode, h.BPLId, h.DiscSum,
                   l.LineNum, l.ItemCode, l.Dscription, l.WhsCode, l.LocCode, l.Quantity, l.Price, l.LineTotal, l.GTotal, l.VatSum AS LineTax,
                   SUM(l.LineTotal) OVER (PARTITION BY l.DocEntry) AS LineSum
            FROM OINV h JOIN INV1 l ON l.DocEntry = h.DocEntry
            WHERE h.CANCELED = 'N' AND h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To)
            UNION ALL
            SELECT -1, 'A/R Credit Memo', h.DocEntry, h.DocNum, h.DocDate, h.CardCode, h.CardName, h.SlpCode, h.BPLId, h.DiscSum,
                   l.LineNum, l.ItemCode, l.Dscription, l.WhsCode, l.LocCode, l.Quantity, l.Price, l.LineTotal, l.GTotal, l.VatSum,
                   SUM(l.LineTotal) OVER (PARTITION BY l.DocEntry)
            FROM ORIN h JOIN RIN1 l ON l.DocEntry = h.DocEntry
            WHERE h.CANCELED = 'N' AND h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To)
        ), x AS (
            SELECT r.Sgn, r.DocType, r.DocEntry, r.DocNum, r.DocDate AS PostingDate, r.CardCode AS CustomerCode, r.CardName AS CustomerName,
                   c.GroupCode AS CustGroupCode, g.GroupName AS CustomerGroup, r.SlpCode, s.SlpName AS Salesperson, r.BPLId, r.LocCode, r.WhsCode,
                   r.ItemCode, r.Dscription AS ItemDescription, ProdCat = " + "{CAT}" + @",
                   ISNULL(w.WhsName, r.WhsCode) AS Warehouse, u.Location AS Unit, r.LineNum,
                   r.Sgn * r.Quantity AS Quantity, r.Price AS Rate, r.Sgn * r.LineTotal AS BasicAmount,
                   r.Sgn * r.LineTotal * (CASE WHEN r.LineSum <> 0 THEN 1 - r.DiscSum / r.LineSum ELSE 1 END) AS NetSales,
                   r.Sgn * r.LineTax AS TaxAmount,
                   r.Sgn * r.GTotal * (CASE WHEN r.LineSum <> 0 THEN 1 - r.DiscSum / r.LineSum ELSE 1 END) AS NetSalesInclTax
            FROM reg r
            LEFT JOIN OCRD c ON c.CardCode = r.CardCode
            LEFT JOIN OCRG g ON g.GroupCode = c.GroupCode
            LEFT JOIN OSLP s ON s.SlpCode = r.SlpCode
            LEFT JOIN OITM i ON i.ItemCode = r.ItemCode
            LEFT JOIN OWHS w ON w.WhsCode = r.WhsCode
            LEFT JOIN OLCT u ON u.Code = r.LocCode
        )";

    private const string RegisterWhere = @"
        WHERE (@Whs IS NULL OR x.WhsCode = @Whs)
          AND (@Unit IS NULL OR x.LocCode = @Unit)
          AND (@HasLocs = 0 OR x.LocCode IN @Locs OR x.LocCode IS NULL)
          AND (@Branch IS NULL OR x.BPLId = @Branch)
          AND (@Slp IS NULL OR x.SlpCode = @Slp)
          AND (@Customer IS NULL OR x.CustomerCode = @Customer)
          AND (@CustGroup IS NULL OR x.CustGroupCode = @CustGroup)
          AND (@ItemLike IS NULL OR x.ItemCode LIKE @ItemLike OR x.ItemDescription LIKE @ItemLike)
          AND (@Cat IS NULL OR x.ProdCat = @Cat)
          AND (@Sgn IS NULL OR x.Sgn = @Sgn)";

    public async Task<SalesRegisterReportDto> GetSalesRegisterAsync(DetailReportQuery q, CancellationToken ct = default)
    {
        var p = Params(q, out var from, out var to);
        p.Add("Sgn", (q.DocType ?? "").Trim().ToLowerInvariant() switch { "invoice" => 1, "creditmemo" => -1, _ => q.NetOfCreditNotes ? (int?)null : 1 });
        var cte = RegisterCte.Replace("{CAT}", ProductCategories.Expr("i"));
        using var db = _connectionFactory.CreateConnection();

        var totals = await db.QuerySingleAsync<SalesRegisterTotalsDto>(new CommandDefinition($@"
            {cte}
            SELECT COUNT(*) AS Lines, ISNULL(SUM(x.Quantity), 0) AS Quantity, ISNULL(SUM(x.BasicAmount), 0) AS BasicAmount,
                   ISNULL(SUM(x.NetSales), 0) AS NetSales, ISNULL(SUM(x.TaxAmount), 0) AS TaxAmount, ISNULL(SUM(x.NetSalesInclTax), 0) AS NetSalesInclTax
            FROM x {RegisterWhere}", p, cancellationToken: ct));

        var rows = (await db.QueryAsync<SalesRegisterRowDto>(new CommandDefinition($@"
            {cte}
            SELECT x.DocType, x.DocEntry, x.DocNum, x.PostingDate, x.CustomerCode, x.CustomerName, x.CustomerGroup, x.Salesperson,
                   x.ItemCode, x.ItemDescription, x.ProdCat AS ProductCategory, x.Warehouse, x.Unit, x.Quantity, x.Rate,
                   x.BasicAmount, x.NetSales, x.TaxAmount, x.NetSalesInclTax
            FROM x {RegisterWhere}
            ORDER BY x.PostingDate DESC, x.DocType, x.DocNum DESC, x.LineNum
            OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY", p, cancellationToken: ct))).ToList();

        return new SalesRegisterReportDto { DateFrom = from, DateTo = to, Totals = totals, TotalCount = totals.Lines, Rows = rows };
    }

    // ------------------------------------------------------------------ Customer Group -> Customer sales (combined report)
    // Built on the Sales Register rows (same net-of-credit-notes lines, same filters), grouped once by customer group and
    // customer, so every figure reconciles with the register and Total Turnover. Each customer appears under exactly one group
    // (the customer's current group), so nothing is counted twice. "Invoices only" (netOfCreditNotes off) uses the invoice lines.
    public async Task<CustomerGroupSalesDto> GetCustomerGroupSalesAsync(DetailReportQuery q, CancellationToken ct = default)
    {
        var p = Params(q, out var from, out var to);
        p.Add("Sgn", q.NetOfCreditNotes ? (int?)null : 1);
        var cte = RegisterCte.Replace("{CAT}", ProductCategories.Expr("i"));
        var value = q.IncludeTax ? "x.NetSalesInclTax" : "x.NetSales";
        using var db = _connectionFactory.CreateConnection();

        var rows = (await db.QueryAsync<CustomerGroupSalesRowDto>(new CommandDefinition($@"
            {cte}
            SELECT TOP 50000 x.CustGroupCode AS GroupCode, ISNULL(x.CustomerGroup, '(No group)') AS CustomerGroup, x.CustomerCode, MAX(x.CustomerName) AS CustomerName,
                   SUM({value}) AS Value, COUNT(DISTINCT CAST(x.DocEntry AS varchar(20)) + '/' + x.DocType) AS Documents
            FROM x {RegisterWhere}
            GROUP BY x.CustGroupCode, x.CustomerGroup, x.CustomerCode
            HAVING SUM({value}) <> 0
            ORDER BY SUM({value}) DESC", p, cancellationToken: ct))).ToList();

        return new CustomerGroupSalesDto
        {
            DateFrom = from, DateTo = to, IncludeTax = q.IncludeTax, NetOfCreditNotes = q.NetOfCreditNotes,
            Total = rows.Sum(r => r.Value), Rows = rows
        };
    }

    // ------------------------------------------------------------------ Outstanding Customer Invoices = payment status
    // Unpaid A/R invoices (DocStatus Open, not cancelled): DocTotal - PaidToDate. This is about PAYMENT, not billing; the pending-
    // billing (open delivery) report is separate. The journal-based Total Outstanding is the client's ageing definition.
    private const string UnpaidFrom = @"
        FROM OINV h
        LEFT JOIN OCRD c ON c.CardCode = h.CardCode
        LEFT JOIN OSLP s ON s.SlpCode = h.SlpCode
        LEFT JOIN OBPL b ON b.BPLId = h.BPLId
        WHERE h.DocStatus = 'O' AND h.CANCELED = 'N'
          AND (@Customer IS NULL OR h.CardCode = @Customer)
          AND (@Slp IS NULL OR h.SlpCode = @Slp)
          AND (@Branch IS NULL OR h.BPLId = @Branch)
          AND (@CustGroup IS NULL OR c.GroupCode = @CustGroup)";

    public async Task<UnpaidInvoiceReportDto> GetUnpaidInvoicesAsync(DetailReportQuery q, CancellationToken ct = default)
    {
        var p = Params(q, out _, out _);
        using var db = _connectionFactory.CreateConnection();

        var totals = await db.QuerySingleAsync<UnpaidInvoiceTotalsDto>(new CommandDefinition($@"
            SELECT COUNT(*) AS Invoices, ISNULL(SUM(h.DocTotal), 0) AS DocTotal, ISNULL(SUM(h.PaidToDate), 0) AS PaidToDate,
                   ISNULL(SUM(h.DocTotal - h.PaidToDate), 0) AS Balance,
                   ISNULL(SUM(CASE WHEN h.DocDueDate < CAST(GETDATE() AS date) THEN h.DocTotal - h.PaidToDate ELSE 0 END), 0) AS Overdue
            {UnpaidFrom}", p, cancellationToken: ct));

        var rows = (await db.QueryAsync<UnpaidInvoiceRowDto>(new CommandDefinition($@"
            SELECT h.DocEntry, h.DocNum, h.DocDate AS PostingDate, h.DocDueDate AS DueDate, h.CardCode AS CustomerCode, h.CardName AS CustomerName,
                   s.SlpName AS Salesperson, b.BPLName AS Branch, h.DocTotal, h.PaidToDate, h.DocTotal - h.PaidToDate AS Balance,
                   DATEDIFF(DAY, h.DocDueDate, GETDATE()) AS DaysOverdue
            {UnpaidFrom}
            ORDER BY h.DocDueDate, h.DocNum
            OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY", p, cancellationToken: ct))).ToList();

        return new UnpaidInvoiceReportDto { Totals = totals, TotalCount = totals.Invoices, Rows = rows };
    }

    // ------------------------------------------------------------------ Lost Customer Analysis
    // Client definition: customers with transactions in the PREVIOUS financial year but no sales in the CURRENT financial year.
    // Financial year = 1 April - 31 March (the portal's Indian FY convention, as used everywhere else). "Has transactions" / "no sales"
    // are judged on A/R INVOICES (a credit memo alone is not a sale); the amounts shown are the Sales Register net-of-credit-notes
    // amounts. The current year is measured only up to the as-of date (the selected To Date, never beyond the FY end), and the
    // response says whether the current FY is complete, because a customer cannot be called lost before the year has run.
    public async Task<LostCustomerReportDto> GetLostCustomersAsync(LostCustomerQuery q, CancellationToken ct = default)
    {
        var today = DateTime.Today;
        var fyStartYear = ParseFyStartYear(q.FinancialYear) ?? FyStart(q.AsOf ?? today).Year;
        var curStart = new DateTime(fyStartYear, 4, 1);
        var curEnd = new DateTime(fyStartYear + 1, 3, 31);
        var prevStart = curStart.AddYears(-1);
        var prevEnd = curStart.AddDays(-1);
        var asOf = ((q.AsOf ?? today).Date);
        if (asOf > curEnd) asOf = curEnd;
        if (asOf < curStart) asOf = curStart;

        var pageSize = Math.Clamp(q.PageSize, 1, 5000);
        var p = new DynamicParameters();
        p.Add("From", prevStart);
        p.Add("To", asOf);
        p.Add("CurStart", curStart);
        p.Add("Unit", q.Unit);
        p.Add("CustGroup", q.CustomerGroup);
        p.Add("Slp", q.Salesperson);
        p.Add("MinPrev", q.MinPreviousSales);
        p.Add("SearchLike", Like(q.Search));
        p.Add("Skip", (Math.Max(1, q.Page) - 1) * pageSize);
        p.Add("Take", pageSize);

        var cte = $@"
            WITH alloc AS ({SalesAmount.NetOfCreditNotesRows(q.IncludeTax)}),
            agg AS (
                SELECT a.CardCode,
                       SUM(CASE WHEN a.DocDate < @CurStart THEN a.Amt ELSE 0 END) AS PrevSales,
                       SUM(CASE WHEN a.DocDate >= @CurStart THEN a.Amt ELSE 0 END) AS CurSales,
                       SUM(CASE WHEN a.DocDate < @CurStart AND a.Sgn = 1 THEN 1 ELSE 0 END) AS PrevInvoiceLines,
                       SUM(CASE WHEN a.DocDate >= @CurStart AND a.Sgn = 1 THEN 1 ELSE 0 END) AS CurInvoiceLines,
                       MAX(CASE WHEN a.Sgn = 1 THEN a.DocDate END) AS LastSalesDate
                FROM alloc a
                WHERE (@Unit IS NULL OR a.LocCode = @Unit)
                GROUP BY a.CardCode),
            cust AS (
                SELECT g.CardCode, c.CardName, c.GroupCode, gr.GroupName AS CustomerGroup, c.SlpCode, s.SlpName AS Salesperson,
                       CASE WHEN c.frozenFor = 'Y' THEN 1 ELSE 0 END AS Frozen,
                       g.PrevSales, g.CurSales, g.PrevInvoiceLines, g.CurInvoiceLines, g.LastSalesDate
                FROM agg g
                JOIN OCRD c ON c.CardCode = g.CardCode AND c.CardType = 'C'
                LEFT JOIN OCRG gr ON gr.GroupCode = c.GroupCode
                LEFT JOIN OSLP s ON s.SlpCode = c.SlpCode
                WHERE g.PrevInvoiceLines > 0
                  AND (@CustGroup IS NULL OR c.GroupCode = @CustGroup)
                  AND (@Slp IS NULL OR c.SlpCode = @Slp)
                  AND (@SearchLike IS NULL OR c.CardCode LIKE @SearchLike OR c.CardName LIKE @SearchLike)),
            lost AS (SELECT * FROM cust WHERE CurInvoiceLines = 0 AND (@MinPrev IS NULL OR PrevSales >= @MinPrev))";

        using var db = _connectionFactory.CreateConnection();
        var summary = await db.QuerySingleAsync<LostCustomerSummaryDto>(new CommandDefinition($@"
            {cte}
            SELECT (SELECT COUNT(*) FROM cust) AS PreviousYearCustomers,
                   (SELECT COUNT(*) FROM lost) AS LostCustomers,
                   (SELECT ISNULL(SUM(PrevSales), 0) FROM lost) AS LostPreviousSales,
                   (SELECT ISNULL(SUM(PrevSales), 0) FROM cust) AS PreviousYearSales", p, cancellationToken: ct));

        var rows = (await db.QueryAsync<LostCustomerRowDto>(new CommandDefinition($@"
            {cte}
            SELECT CardCode AS CustomerCode, CardName AS CustomerName, CustomerGroup, Salesperson, PrevSales AS PreviousYearSales,
                   CurSales AS CurrentYearSales, LastSalesDate, PrevInvoiceLines AS PreviousInvoiceLines, CAST(Frozen AS bit) AS Frozen
            FROM lost
            ORDER BY PrevSales DESC, CardCode
            OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY", p, cancellationToken: ct))).ToList();

        return new LostCustomerReportDto
        {
            FinancialYear = $"{fyStartYear}-{(fyStartYear + 1) % 100:00}",
            PreviousFrom = prevStart, PreviousTo = prevEnd, CurrentFrom = curStart, CurrentTo = asOf, CurrentFyEnd = curEnd,
            CurrentYearComplete = asOf >= curEnd,
            Summary = summary, TotalCount = summary.LostCustomers, Rows = rows
        };
    }

    private static int? ParseFyStartYear(string? fy)
    {
        if (string.IsNullOrWhiteSpace(fy)) return null;
        var m = Regex.Match(fy.Trim(), @"^(\d{4})-(\d{2})$");
        if (!m.Success) return null;
        var y = int.Parse(m.Groups[1].Value);
        return int.Parse(m.Groups[2].Value) == (y + 1) % 100 && y is >= 2000 and <= 2100 ? y : null;
    }

    // ------------------------------------------------------------------ Order Execution: days from sales order to invoice
    // Uses SAP's own document links, never a match on customer or item: an A/R invoice line belongs to an order line when it was created
    // from that order (INV1.BaseType 17 -> RDR1) OR from a delivery that was created from that order (INV1.BaseType 15 -> DLN1, whose
    // BaseType 17 -> RDR1). Links are rolled up per (order, invoice), so an order with several invoices (partial billing) appears once
    // per invoice with the quantity invoiced on that invoice, and the full ordered quantity is shown only on the order's first row.
    // Orders with no (non-cancelled) invoice appear once as "Not invoiced" with no invoice date or days. Days = DATEDIFF(DAY, order
    // date, invoice date) on the documents' posting dates (both are SQL date columns, no time part).
    private const string ExecCte = @"
        WITH ord AS (
            SELECT h.DocEntry, h.DocNum, h.DocDate, h.CardCode, h.CardName, h.SlpCode, h.BPLId
            FROM ORDR h
            WHERE h.CANCELED = 'N' AND h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To)
              AND (@Slp IS NULL OR h.SlpCode = @Slp)
              AND (@Customer IS NULL OR h.CardCode = @Customer)
              AND (@Branch IS NULL OR h.BPLId = @Branch)
              AND (@Unit IS NULL OR EXISTS (SELECT 1 FROM RDR1 ru WHERE ru.DocEntry = h.DocEntry AND ru.LocCode = @Unit))),
        oq AS (
            SELECT r.DocEntry, SUM(r.Quantity) AS OrdQty
            FROM RDR1 r JOIN ord o ON o.DocEntry = r.DocEntry
            WHERE (@Unit IS NULL OR r.LocCode = @Unit)
            GROUP BY r.DocEntry),
        lnk AS (
            SELECT r.DocEntry AS OrdEntry, i.DocEntry AS InvEntry, i.Quantity AS InvQty
            FROM RDR1 r JOIN ord o ON o.DocEntry = r.DocEntry
            JOIN INV1 i ON i.BaseType = 17 AND i.BaseEntry = r.DocEntry AND i.BaseLine = r.LineNum
            WHERE (@Unit IS NULL OR r.LocCode = @Unit)
            UNION ALL
            SELECT r.DocEntry, i.DocEntry, i.Quantity
            FROM RDR1 r JOIN ord o ON o.DocEntry = r.DocEntry
            JOIN DLN1 d ON d.BaseType = 17 AND d.BaseEntry = r.DocEntry AND d.BaseLine = r.LineNum
            JOIN INV1 i ON i.BaseType = 15 AND i.BaseEntry = d.DocEntry AND i.BaseLine = d.LineNum
            WHERE (@Unit IS NULL OR r.LocCode = @Unit)),
        pair AS (
            SELECT l.OrdEntry, l.InvEntry, SUM(l.InvQty) AS InvQty
            FROM lnk l JOIN OINV ih ON ih.DocEntry = l.InvEntry AND ih.CANCELED = 'N'
            GROUP BY l.OrdEntry, l.InvEntry),
        tot AS (SELECT OrdEntry, SUM(InvQty) AS TotInv FROM pair GROUP BY OrdEntry),
        x AS (
            SELECT o.DocEntry AS OrderEntry, o.DocNum AS OrderNo, o.DocDate AS OrderDate, o.CardCode, o.CardName, o.SlpCode, o.BPLId, oq.OrdQty,
                   p.InvEntry, ih.DocNum AS InvoiceNo, ih.DocDate AS InvoiceDate, p.InvQty, ISNULL(t.TotInv, 0) AS TotInv,
                   DATEDIFF(DAY, o.DocDate, ih.DocDate) AS Days,
                   ROW_NUMBER() OVER (PARTITION BY o.DocEntry ORDER BY ih.DocDate, p.InvEntry) AS Rn
            FROM ord o
            JOIN oq ON oq.DocEntry = o.DocEntry
            LEFT JOIN pair p ON p.OrdEntry = o.DocEntry
            LEFT JOIN OINV ih ON ih.DocEntry = p.InvEntry
            LEFT JOIN tot t ON t.OrdEntry = o.DocEntry)";

    private const string ExecWhere = @"
        WHERE (@Exec IS NULL OR (@Exec = 'invoiced' AND x.InvEntry IS NOT NULL) OR (@Exec = 'pending' AND x.InvEntry IS NULL))";

    private class ExecOrderRow { public DateTime OrderDate { get; set; } public DateTime? FirstInvoice { get; set; } }

    public async Task<OrderExecutionReportDto> GetOrderExecutionAsync(DetailReportQuery q, CancellationToken ct = default)
    {
        var p = Params(q, out var from, out var to);
        var exec = (q.DocType ?? "").Trim().ToLowerInvariant();
        p.Add("Exec", exec is "invoiced" or "pending" ? exec : null);
        using var db = _connectionFactory.CreateConnection();

        var count = await db.ExecuteScalarAsync<int>(new CommandDefinition($"{ExecCte} SELECT COUNT(*) FROM x {ExecWhere}", p, cancellationToken: ct));

        var rows = (await db.QueryAsync<OrderExecutionRowDto>(new CommandDefinition($@"
            {ExecCte}
            SELECT x.OrderEntry, x.OrderNo, x.OrderDate, x.CardCode AS CustomerCode, x.CardName AS CustomerName, s.SlpName AS Salesperson, b.BPLName AS Branch,
                   CASE WHEN x.Rn = 1 THEN x.OrdQty END AS OrderedQuantity,
                   x.InvoiceNo, x.InvoiceDate, x.InvQty AS InvoicedQuantity, x.Days AS DaysToInvoice,
                   CASE WHEN x.InvEntry IS NULL THEN 'Not invoiced' WHEN x.TotInv + 0.0005 >= x.OrdQty THEN 'Fully invoiced' ELSE 'Partly invoiced' END AS Status
            FROM x LEFT JOIN OSLP s ON s.SlpCode = x.SlpCode LEFT JOIN OBPL b ON b.BPLId = x.BPLId
            {ExecWhere}
            ORDER BY x.OrderDate DESC, x.OrderNo DESC, x.InvoiceDate
            OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY", p, cancellationToken: ct))).ToList();

        // Per-order view for the summary (first invoice per order), over ALL filtered orders, not just this page.
        var orders = (await db.QueryAsync<ExecOrderRow>(new CommandDefinition($@"
            {ExecCte}
            SELECT x.OrderDate, MIN(x.InvoiceDate) AS FirstInvoice FROM x GROUP BY x.OrderEntry, x.OrderDate", p, cancellationToken: ct))).ToList();

        var summary = new OrderExecutionSummaryDto { Orders = orders.Count };
        var days = orders.Where(o => o.FirstInvoice.HasValue).Select(o => (int)(o.FirstInvoice!.Value.Date - o.OrderDate.Date).TotalDays).OrderBy(d => d).ToList();
        summary.InvoicedOrders = days.Count;
        summary.AwaitingInvoice = orders.Count - days.Count;
        if (days.Count > 0)
        {
            summary.AverageDays = Math.Round((decimal)days.Average(), 1);
            summary.MedianDays = days.Count % 2 == 1 ? days[days.Count / 2] : Math.Round((days[days.Count / 2 - 1] + days[days.Count / 2]) / 2m, 1);
            summary.LongestDays = days.Max();
            summary.ShortestDays = days.Min();
        }
        (string Label, Func<int, bool> In)[] buckets =
        {
            ("Same day / earlier", d => d <= 0), ("1–7 days", d => d is >= 1 and <= 7), ("8–15 days", d => d is >= 8 and <= 15),
            ("16–30 days", d => d is >= 16 and <= 30), ("31–60 days", d => d is >= 31 and <= 60), ("Over 60 days", d => d > 60)
        };
        summary.Buckets = buckets.Select(b => new OrderExecutionBucketDto { Label = b.Label, Orders = days.Count(b.In) }).ToList();

        return new OrderExecutionReportDto { DateFrom = from, DateTo = to, Summary = summary, TotalCount = count, Rows = rows };
    }

    // ------------------------------------------------------------------ Customers (the "Total Customers" tile)
    // Tile rule: customer accounts (CardType C) that are not frozen. With "new this quarter" the list switches to the tile's
    // hint definition (customers created since the financial-year quarter started, frozen or not).
    private const string CustomersFrom = @"
        FROM OCRD c
        LEFT JOIN OCRG g ON g.GroupCode = c.GroupCode
        LEFT JOIN OSLP s ON s.SlpCode = c.SlpCode
        LEFT JOIN CRD1 a ON a.CardCode = c.CardCode AND a.AdresType = 'B' AND a.Address = c.BillToDef
        WHERE c.CardType = 'C'
          AND ((@NewOnly = 0 AND c.frozenFor = 'N') OR (@NewOnly = 1 AND c.CreateDate >= @QStart))
          AND (@CustGroup IS NULL OR c.GroupCode = @CustGroup)
          AND (@Slp IS NULL OR c.SlpCode = @Slp)
          AND (@SearchLike IS NULL OR c.CardCode LIKE @SearchLike OR c.CardName LIKE @SearchLike)
          AND (@Unit IS NULL OR EXISTS (
                SELECT 1 FROM OINV ih JOIN INV1 il ON il.DocEntry = ih.DocEntry
                WHERE ih.CardCode = c.CardCode AND ih.CANCELED = 'N' AND il.LocCode = @Unit
                  AND ih.DocDate >= @From AND ih.DocDate < DATEADD(DAY, 1, @To)))";

    public async Task<CustomerReportDto> GetCustomersAsync(DetailReportQuery q, CancellationToken ct = default)
    {
        var p = Params(q, out _, out _);
        var today = DateTime.Today;
        var fyStart = FyStart(today);
        var monthsIntoFy = (today.Year * 12 + today.Month - 1) - (fyStart.Year * 12 + fyStart.Month - 1);
        var quarterStart = fyStart.AddMonths(monthsIntoFy / 3 * 3);
        p.Add("QStart", quarterStart);
        p.Add("NewOnly", q.NewThisQuarter ? 1 : 0);
        p.Add("SearchLike", Like(q.Search));
        using var db = _connectionFactory.CreateConnection();

        var count = await db.ExecuteScalarAsync<int>(new CommandDefinition($"SELECT COUNT(*) {CustomersFrom}", p, cancellationToken: ct));
        // The dashboard tile's own "new this quarter" count (all customers created since the quarter began).
        var newCount = await db.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT COUNT(*) FROM OCRD WHERE CardType = 'C' AND CreateDate >= @QStart", new { QStart = quarterStart }, cancellationToken: ct));

        var rows = (await db.QueryAsync<CustomerRowDto>(new CommandDefinition($@"
            SELECT c.CardCode AS CustomerCode, c.CardName AS CustomerName, g.GroupName AS CustomerGroup, s.SlpName AS Salesperson,
                   a.City, c.CreateDate AS CreatedDate, ISNULL(c.Balance, 0) AS Balance
            {CustomersFrom}
            ORDER BY c.CardName, c.CardCode
            OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY", p, cancellationToken: ct))).ToList();

        return new CustomerReportDto
        {
            Totals = new CustomerTotalsDto { Customers = count, NewThisQuarter = newCount, QuarterStart = quarterStart },
            TotalCount = count, Rows = rows
        };
    }

    // ------------------------------------------------------------------ Pending Invoices = open deliveries not yet invoiced
    // Tile rule: deliveries with DocStatus Open and not cancelled; count and DocTotal. This is pending BILLING, not payment.
    private const string PendingFrom = @"
        FROM ODLN h
        LEFT JOIN OSLP s ON s.SlpCode = h.SlpCode
        LEFT JOIN OBPL b ON b.BPLId = h.BPLId
        WHERE h.DocStatus = 'O' AND h.CANCELED = 'N'
          AND (@Customer IS NULL OR h.CardCode = @Customer)
          AND (@Slp IS NULL OR h.SlpCode = @Slp)
          AND (@Branch IS NULL OR h.BPLId = @Branch)";

    public async Task<PendingDeliveryReportDto> GetPendingDeliveriesAsync(DetailReportQuery q, CancellationToken ct = default)
    {
        var p = Params(q, out _, out _);
        using var db = _connectionFactory.CreateConnection();

        var totals = await db.QuerySingleAsync<PendingDeliveryTotalsDto>(new CommandDefinition($@"
            SELECT COUNT(*) AS Deliveries, ISNULL(SUM(h.DocTotal), 0) AS DocTotal {PendingFrom}", p, cancellationToken: ct));

        var rows = (await db.QueryAsync<PendingDeliveryRowDto>(new CommandDefinition($@"
            SELECT h.DocEntry, h.DocNum, h.DocDate AS PostingDate, h.DocDueDate AS DueDate, h.CardCode AS CustomerCode, h.CardName AS CustomerName,
                   s.SlpName AS Salesperson, b.BPLName AS Branch,
                   (SELECT COUNT(*) FROM DLN1 l WHERE l.DocEntry = h.DocEntry) AS Lines,
                   DATEDIFF(DAY, h.DocDate, GETDATE()) AS DaysOpen, h.DocTotal
            {PendingFrom}
            ORDER BY h.DocDate DESC, h.DocNum DESC
            OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY", p, cancellationToken: ct))).ToList();

        return new PendingDeliveryReportDto { Totals = totals, TotalCount = totals.Deliveries, Rows = rows };
    }

    // ------------------------------------------------------------------ Sales analysis (the dashboard charts, in full)
    // Same definitions as the Sales Overview charts: A/R invoices, cancelled excluded; month / salesperson / customer use the
    // invoice header amount (DocTotal, or DocTotal - VatSum without tax); item uses the invoice LINE amount (GTotal / LineTotal).
    // The dashboard charts show the top N; this report lists everything, so its total can be larger than a chart's total.
    public static readonly string[] AnalysisModes = { "month", "salesperson", "customer", "item" };

    public async Task<SalesAnalysisReportDto> GetSalesAnalysisAsync(DetailReportQuery q, CancellationToken ct = default)
    {
        var mode = (q.By ?? "").Trim().ToLowerInvariant();
        if (!AnalysisModes.Contains(mode)) throw new ArgumentException("Unknown analysis grouping.");
        var p = Params(q, out var from, out var to);
        p.Add("SearchLike", Like(q.Search));
        var amt = SalesAmount.Header(q.IncludeTax, "h");
        var lineAmt = SalesAmount.Line(q.IncludeTax, "l");
        const string where = "h.CANCELED = 'N' AND h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To)";

        string g;
        if (mode == "item")
        {
            g = $@"g AS (
                SELECT l.ItemCode AS K, MAX(l.Dscription) AS N, COUNT(DISTINCT h.DocEntry) AS Invoices, SUM(l.Quantity) AS Qty, SUM({lineAmt}) AS Value
                FROM INV1 l JOIN OINV h ON h.DocEntry = l.DocEntry
                WHERE {where} AND l.ItemCode IS NOT NULL
                GROUP BY l.ItemCode)";
        }
        else
        {
            var (key, name, join) = mode switch
            {
                "month" => ("CONVERT(varchar(7), h.DocDate, 120)", "CONVERT(varchar(7), h.DocDate, 120)", ""),
                "salesperson" => ("CAST(h.SlpCode AS varchar(20))", "ISNULL(MAX(s.SlpName), '(No sales employee)')", "LEFT JOIN OSLP s ON s.SlpCode = h.SlpCode"),
                _ => ("h.CardCode", "MAX(h.CardName)", "")
            };
            // Header amounts and line quantities come from separate aggregates so a header total is never multiplied by its line count.
            g = $@"hd AS (
                SELECT {key} AS K, {name} AS N, COUNT(*) AS Invoices, SUM({amt}) AS Value
                FROM OINV h {join} WHERE {where} GROUP BY {key}),
            qt AS (
                SELECT {key} AS K, SUM(l.Quantity) AS Qty
                FROM OINV h JOIN INV1 l ON l.DocEntry = h.DocEntry {join} WHERE {where} GROUP BY {key}),
            g AS (
                SELECT hd.K, hd.N, hd.Invoices, ISNULL(qt.Qty, 0) AS Qty, hd.Value FROM hd LEFT JOIN qt ON qt.K = hd.K)";
        }
        var filter = "WHERE (@SearchLike IS NULL OR g.K LIKE @SearchLike OR g.N LIKE @SearchLike)";
        var order = mode == "month" ? "g.K ASC" : "g.Value DESC, g.K";

        using var db = _connectionFactory.CreateConnection();
        var totals = await db.QuerySingleAsync<SalesAnalysisTotalsDto>(new CommandDefinition($@"
            WITH {g}
            SELECT COUNT(*) AS Rows, ISNULL(SUM(g.Invoices), 0) AS Invoices, ISNULL(SUM(g.Qty), 0) AS Quantity, ISNULL(SUM(g.Value), 0) AS Value
            FROM g {filter}", p, cancellationToken: ct));

        var rows = (await db.QueryAsync<SalesAnalysisRowDto>(new CommandDefinition($@"
            WITH {g}
            SELECT g.K AS [Key], g.N AS Name, g.Invoices, g.Qty AS Quantity, g.Value
            FROM g {filter}
            ORDER BY {order}
            OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY", p, cancellationToken: ct))).ToList();

        foreach (var r in rows)
        {
            if (mode == "month" && DateTime.TryParseExact(r.Key + "-01", "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var m))
                r.Name = m.ToString("MMM yyyy", System.Globalization.CultureInfo.InvariantCulture);
            r.Percentage = totals.Value != 0 ? Math.Round(r.Value / totals.Value * 100, 2) : 0;
        }
        return new SalesAnalysisReportDto { DateFrom = from, DateTo = to, By = mode, IncludeTax = q.IncludeTax, Totals = totals, TotalCount = totals.Rows, Rows = rows };
    }

    // ------------------------------------------------------------------ Total Outstanding (client ageing report)
    // Ported from the client's journal-based customer ageing query. Its three parts (C = credit-side rows reconciled after the
    // as-of date, D = debit-side rows reconciled after it, R = rows still unreconciled) rebuild each journal line's open
    // balance AS OF @Ref using the reconciliation history (ITR1/OITR), so a historical date gives the historical balance —
    // today's JDT1.BalDue* are never summed on their own. The client's presentation joins are kept (customer master and the
    // default bill-to address) because they are part of the figure the client sees; B1_JournalTransSourceView is joined exactly
    // as in the client SQL. Unlike the client's report, no customer is dropped for lacking a default bill-to address (the client's
    // inner join to CRD1 would); that balance is reported separately as NoBillToBalance. Result sign follows the client's report
    // (customer owes us = positive).
    private const string OutstandingCte = @"
        WITH oi AS (
            SELECT T0.TransId, T0.Line_ID, T0.BPLId, MAX(T0.ShortName) AS ShortName, T0.RefDate AS PostingDate, T0.DueDate,
                   MAX(T0.TransType) AS TransType, MAX(T0.BaseRef) AS BaseRef, MAX(T0.Ref1) AS Ref1,
                   (MAX(T0.BalDueCred) + SUM(T1.ReconSum)) AS Bal
            FROM JDT1 T0
            INNER JOIN ITR1 T1 ON T1.TransId = T0.TransId AND T1.TransRowId = T0.Line_ID
            INNER JOIN OITR T2 ON T2.ReconNum = T1.ReconNum
            INNER JOIN OJDT T3 ON T3.TransId = T0.TransId
            INNER JOIN OCRD T4 ON T4.CardCode = T0.ShortName
            LEFT OUTER JOIN B1_JournalTransSourceView T5 ON T5.ObjType = T0.TransType AND T5.DocEntry = T0.CreatedBy
                AND (T5.TransType <> 'I' OR (T5.TransType = 'I' AND T5.InstlmntID = T0.SourceLine))
            WHERE T0.RefDate <= @Ref AND T4.CardType = 'C' AND (@Customer IS NULL OR T4.CardCode = @Customer)
              AND T2.ReconDate > @Ref AND T1.IsCredit = 'C'
            GROUP BY T0.TransId, T0.Line_ID, T0.BPLId, T0.RefDate, T0.DueDate
            HAVING MAX(T0.BalFcCred) <> -SUM(T1.ReconSumFC) OR MAX(T0.BalDueCred) <> -SUM(T1.ReconSum)

            UNION ALL

            SELECT T0.TransId, T0.Line_ID, T0.BPLId, MAX(T0.ShortName), T0.RefDate, T0.DueDate,
                   MAX(T0.TransType), MAX(T0.BaseRef), MAX(T0.Ref1),
                   (- MAX(T0.BalDueDeb) - SUM(T1.ReconSum))
            FROM JDT1 T0
            INNER JOIN ITR1 T1 ON T1.TransId = T0.TransId AND T1.TransRowId = T0.Line_ID
            INNER JOIN OITR T2 ON T2.ReconNum = T1.ReconNum
            INNER JOIN OJDT T3 ON T3.TransId = T0.TransId
            INNER JOIN OCRD T4 ON T4.CardCode = T0.ShortName
            LEFT OUTER JOIN B1_JournalTransSourceView T5 ON T5.ObjType = T0.TransType AND T5.DocEntry = T0.CreatedBy
                AND (T5.TransType <> 'I' OR (T5.TransType = 'I' AND T5.InstlmntID = T0.SourceLine))
            WHERE T0.RefDate <= @Ref AND T4.CardType = 'C' AND (@Customer IS NULL OR T4.CardCode = @Customer)
              AND T2.ReconDate > @Ref AND T1.IsCredit = 'D'
            GROUP BY T0.TransId, T0.Line_ID, T0.BPLId, T0.RefDate, T0.DueDate
            HAVING MAX(T0.BalFcDeb) <> -SUM(T1.ReconSumFC) OR MAX(T0.BalDueDeb) <> -SUM(T1.ReconSum)

            UNION ALL

            SELECT T0.TransId, T0.Line_ID, T0.BPLId, MAX(T0.ShortName), T0.RefDate, T0.DueDate,
                   MAX(T0.TransType), MAX(T0.BaseRef), MAX(T0.Ref1),
                   (MAX(T0.BalDueCred) - MAX(T0.BalDueDeb))
            FROM JDT1 T0
            INNER JOIN OJDT T1 ON T1.TransId = T0.TransId
            INNER JOIN OCRD T2 ON T2.CardCode = T0.ShortName
            LEFT OUTER JOIN B1_JournalTransSourceView T3 ON T3.ObjType = T0.TransType AND T3.DocEntry = T0.CreatedBy
                AND (T3.TransType <> 'I' OR (T3.TransType = 'I' AND T3.InstlmntID = T0.SourceLine))
            WHERE T0.RefDate <= @Ref AND T2.CardType = 'C' AND (@Customer IS NULL OR T2.CardCode = @Customer)
              AND (T0.BalDueCred <> T0.BalDueDeb OR T0.BalFcCred <> T0.BalFcDeb)
              AND NOT EXISTS (
                  SELECT U0.TransId, U0.TransRowId FROM ITR1 U0 INNER JOIN OITR U1 ON U1.ReconNum = U0.ReconNum
                  WHERE T0.TransId = U0.TransId AND T0.Line_ID = U0.TransRowId AND U1.ReconDate > @Ref
                  GROUP BY U0.TransId, U0.TransRowId)
            GROUP BY T0.TransId, T0.Line_ID, T0.BPLId, T0.RefDate, T0.DueDate
        ), x AS (
            SELECT oi.TransId, oi.BPLId, oi.ShortName AS CardCode, c.CardName, c.SlpCode, oi.PostingDate, oi.DueDate, oi.TransType, oi.BaseRef, oi.Ref1,
                   DATEDIFF(DAY, oi.PostingDate, @Ref) AS Days, -oi.Bal AS Balance,
                   CASE WHEN b.Address IS NULL THEN 0 ELSE 1 END AS HasBillTo
            FROM oi
            INNER JOIN OCRD c ON c.CardCode = oi.ShortName
            LEFT JOIN CRD1 b ON b.CardCode = c.CardCode AND b.AdresType = 'B' AND c.BillToDef = b.Address
            WHERE (@Branch IS NULL OR oi.BPLId = @Branch)
        )";

    private static string DocTypeLabel(int transType) => transType switch
    {
        13 => "A/R Invoice", 14 => "A/R Credit Memo", 24 => "Incoming Payment", 30 => "Journal Entry", 203 => "A/R Down Payment",
        321 => "Internal Reconciliation", 46 => "Outgoing Payment", _ => $"Document type {transType}"
    };

    private static DynamicParameters OutstandingParams(LedgerOutstandingQuery q, out DateTime asOf)
    {
        asOf = (q.AsOf ?? DateTime.Today).Date;
        var pageSize = Math.Clamp(q.PageSize, 1, 5000);
        var p = new DynamicParameters();
        p.Add("Ref", asOf);
        p.Add("Customer", Clean(q.Customer));
        p.Add("Branch", q.Branch);
        p.Add("Skip", (Math.Max(1, q.Page) - 1) * pageSize);
        p.Add("Take", pageSize);
        return p;
    }

    public async Task<OutstandingLedgerDto> GetLedgerOutstandingAsync(LedgerOutstandingQuery q, CancellationToken ct = default)
    {
        var p = OutstandingParams(q, out var asOf);
        using var db = _connectionFactory.CreateConnection();
        var dto = new OutstandingLedgerDto { AsOf = asOf };

        dto.UnpaidInvoicesToday = await db.ExecuteScalarAsync<decimal>(new CommandDefinition(
            "SELECT ISNULL(SUM(DocTotal - PaidToDate), 0) FROM OINV WHERE DocStatus = 'O' AND CANCELED = 'N'", cancellationToken: ct));

        // The journal CTE is the expensive part, so it is evaluated ONCE into a temp table and both result sets read from it.
        // Customers whose balance nets to zero are not listed, as in the client report.
        using var multi = await db.QueryMultipleAsync(new CommandDefinition($@"
            {OutstandingCte}
            SELECT * INTO #x FROM x;

            SELECT x.CardCode AS CustomerCode, MAX(x.CardName) AS CustomerName, MAX(s.SlpName) AS SalesPerson, SUM(x.Balance) AS Balance,
                   SUM(CASE WHEN x.Days <= 30 THEN x.Balance ELSE 0 END) AS Days0To30,
                   SUM(CASE WHEN x.Days BETWEEN 31 AND 60 THEN x.Balance ELSE 0 END) AS Days31To60,
                   SUM(CASE WHEN x.Days BETWEEN 61 AND 90 THEN x.Balance ELSE 0 END) AS Days61To90,
                   SUM(CASE WHEN x.Days BETWEEN 91 AND 120 THEN x.Balance ELSE 0 END) AS Days91To120,
                   SUM(CASE WHEN x.Days BETWEEN 121 AND 150 THEN x.Balance ELSE 0 END) AS Days121To150,
                   SUM(CASE WHEN x.Days BETWEEN 151 AND 180 THEN x.Balance ELSE 0 END) AS Days151To180,
                   SUM(CASE WHEN x.Days BETWEEN 181 AND 210 THEN x.Balance ELSE 0 END) AS Days181To210,
                   SUM(CASE WHEN x.Days > 210 THEN x.Balance ELSE 0 END) AS Days211Plus
            FROM #x x LEFT JOIN OSLP s ON s.SlpCode = x.SlpCode
            GROUP BY x.CardCode
            HAVING SUM(x.Balance) <> 0;

            SELECT x.BPLId AS BranchCode, ISNULL(b.BPLName, '(No branch)') AS Branch, SUM(x.Balance) AS Amount
            FROM #x x LEFT JOIN OBPL b ON b.BPLId = x.BPLId
            GROUP BY x.BPLId, b.BPLName HAVING SUM(x.Balance) <> 0
            ORDER BY SUM(x.Balance) DESC;

            SELECT ISNULL(SUM(x.Balance), 0) AS Amount, COUNT(DISTINCT x.CardCode) AS Customers FROM #x x WHERE x.HasBillTo = 0;", p, cancellationToken: ct));
        var customers = (await multi.ReadAsync<OutstandingCustomerDto>()).ToList();
        var byBranch = (await multi.ReadAsync<OutstandingBranchDto>()).ToList();
        var noBill = await multi.ReadSingleAsync<(decimal Amount, int Customers)>();
        dto.NoBillToBalance = noBill.Amount;
        dto.NoBillToCustomers = noBill.Customers;

        dto.TotalOutstanding = customers.Sum(c => c.Balance);
        dto.CustomerCount = customers.Count;
        dto.ByBranch = byBranch;
        dto.Ageing = new List<OutstandingBucketDto>
        {
            new() { Label = "0–30", Amount = customers.Sum(c => c.Days0To30) },
            new() { Label = "31–60", Amount = customers.Sum(c => c.Days31To60) },
            new() { Label = "61–90", Amount = customers.Sum(c => c.Days61To90) },
            new() { Label = "91–120", Amount = customers.Sum(c => c.Days91To120) },
            new() { Label = "121–150", Amount = customers.Sum(c => c.Days121To150) },
            new() { Label = "151–180", Amount = customers.Sum(c => c.Days151To180) },
            new() { Label = "181–210", Amount = customers.Sum(c => c.Days181To210) },
            new() { Label = "211+", Amount = customers.Sum(c => c.Days211Plus) }
        };
        var size = Math.Clamp(q.PageSize, 1, 5000);
        dto.TotalCount = customers.Count;
        dto.Customers = customers.OrderByDescending(c => Math.Abs(c.Balance)).Skip((Math.Max(1, q.Page) - 1) * size).Take(size).ToList();
        return dto;
    }

    public async Task<OutstandingLinesReportDto> GetLedgerOutstandingLinesAsync(LedgerOutstandingQuery q, CancellationToken ct = default)
    {
        var p = OutstandingParams(q, out var asOf);
        using var db = _connectionFactory.CreateConnection();

        var all = (await db.QueryAsync<OutstandingLineDto>(new CommandDefinition($@"
            {OutstandingCte}
            SELECT x.TransId, x.CardCode AS CustomerCode, MAX(x.CardName) AS CustomerName, MAX(b.BPLName) AS Branch, x.PostingDate, x.DueDate,
                   MAX(x.TransType) AS TransType, MAX(x.BaseRef) AS BaseRef, MAX(x.Ref1) AS Ref1, MAX(x.Days) AS DaysOutstanding, SUM(x.Balance) AS Balance
            FROM x LEFT JOIN OBPL b ON b.BPLId = x.BPLId
            GROUP BY x.TransId, x.CardCode, x.PostingDate, x.DueDate, x.BPLId
            HAVING SUM(x.Balance) <> 0
            ORDER BY x.CardCode, x.PostingDate, x.TransId", p, cancellationToken: ct))).ToList();
        foreach (var r in all) r.DocumentType = DocTypeLabel(r.TransType);

        var size = Math.Clamp(q.PageSize, 1, 5000);
        return new OutstandingLinesReportDto
        {
            AsOf = asOf, Total = all.Sum(r => r.Balance), TotalCount = all.Count,
            Rows = all.Skip((Math.Max(1, q.Page) - 1) * size).Take(size).ToList()
        };
    }
}
