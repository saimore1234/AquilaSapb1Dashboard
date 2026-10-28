using Dapper;
using SAPB1.Api.DTOs.Sales;

namespace SAPB1.Api.Services;

public partial class SqlSalesPerformanceService
{
    // Dimension predicate for a document header `h` with line table `ln` (QUT1/RDR1/DLN1/INV1): unit = a line at that location,
    // salesperson = the document's salesperson, customer group = the customer's group, category = a line whose item is in it.
    private static string DocDims(string ln) => $@"
              AND (@Unit IS NULL OR EXISTS (SELECT 1 FROM {ln} x WHERE x.DocEntry = h.DocEntry AND x.LocCode = @Unit))
              AND (@Slp IS NULL OR h.SlpCode = @Slp)
              AND (@Group IS NULL OR EXISTS (SELECT 1 FROM OCRD c WHERE c.CardCode = h.CardCode AND c.GroupCode = @Group))
              AND (@Cat IS NULL OR EXISTS (SELECT 1 FROM {ln} x JOIN OITM i ON i.ItemCode = x.ItemCode WHERE x.DocEntry = h.DocEntry AND {ProductCategories.Expr("i")} = @Cat))";

    private const string InPeriod = "h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To)";

    public async Task<SalesActivityDto> GetActivityAsync(ActivityQuery q, CancellationToken ct = default)
    {
        var today = DateTime.Today;
        var from = (q.DateFrom ?? FyStart(today)).Date;
        var to = (q.DateTo ?? today).Date;
        var cat = ProductCategories.Canonical(q.ProductCategory);
        // "This month / this year" are measured up to the To Date, but never beyond today: when the selection runs into the future (e.g. a whole
        // financial year) the month that is actually running now is used, so the tiles don't show an empty future month.
        var asOf = to > today ? today : to;
        if (asOf < from) asOf = to;
        var monthFrom = new DateTime(asOf.Year, asOf.Month, 1);
        var yearFrom = FyStart(asOf);

        var p = new DynamicParameters();
        p.Add("From", from); p.Add("To", to); p.Add("Unit", q.Unit); p.Add("Slp", q.Salesperson); p.Add("Group", q.CustomerGroup); p.Add("Cat", cat);
        p.Add("MonthFrom", monthFrom); p.Add("YearFrom", yearFrom); p.Add("AsOf", asOf); p.Add("Today", today);

        using var db = _sap.CreateConnection();
        var d = DocDims("QUT1"); var o = DocDims("RDR1"); var dl = DocDims("DLN1"); var iv = DocDims("INV1");
        var counts = await db.QuerySingleAsync<SalesActivityDto>(new CommandDefinition($@"
            SELECT
              (SELECT COUNT(*) FROM OQUT h WHERE h.CANCELED = 'N' AND {InPeriod} {d}) AS TotalQuotations,
              (SELECT COUNT(*) FROM OQUT h WHERE h.CANCELED = 'N' AND h.DocStatus = 'O' {d}) AS OpenQuotations,
              (SELECT COUNT(*) FROM ORDR h WHERE h.CANCELED = 'N' AND {InPeriod} {o}) AS TotalSalesOrders,
              (SELECT COUNT(*) FROM ORDR h WHERE h.CANCELED = 'N' AND h.DocStatus = 'O' {o}) AS OpenSalesOrders,
              (SELECT ISNULL(SUM(h.DocTotal), 0) FROM ORDR h WHERE h.CANCELED = 'N' AND h.DocStatus = 'O' {o}) AS OpenSalesOrderValue,
              (SELECT COUNT(*) FROM ORDR h WHERE h.CANCELED = 'N' AND h.DocDate >= @MonthFrom AND h.DocDate < DATEADD(DAY, 1, @AsOf) {o}) AS SalesOrdersThisMonth,
              (SELECT COUNT(*) FROM ORDR h WHERE h.CANCELED = 'N' AND h.DocDate >= @YearFrom AND h.DocDate < DATEADD(DAY, 1, @AsOf) {o}) AS SalesOrdersThisYear,
              (SELECT COUNT(*) FROM ODLN h WHERE h.CANCELED = 'N' AND {InPeriod} {dl}) AS TotalDeliveries,
              (SELECT COUNT(*) FROM ODLN h WHERE h.CANCELED = 'N' AND h.DocStatus = 'O' AND {DeliveryRules.ExcludeIntercompany("h")} {dl}) AS PendingDeliveries,
              (SELECT COUNT(*) FROM OINV h WHERE h.CANCELED = 'N' AND {InPeriod} {iv}) AS TotalArInvoices,
              (SELECT COUNT(*) FROM OINV h WHERE h.CANCELED = 'N' AND h.DocStatus = 'O' {iv}) AS OpenArInvoices,
              (SELECT COUNT(*) FROM OINV h WHERE h.CANCELED = 'N' AND h.DocStatus = 'O' AND h.DocDueDate < @Today {iv}) AS OverdueArInvoices,
              CAST(0 AS decimal(19,2)) AS OutstandingReceivables", p, cancellationToken: ct));

        // Unpaid invoice balance TODAY (current position, never filtered by document date): invoice header, so no join can multiply it. DocTotal and
        // PaidToDate are in local currency (INR) even for foreign-currency invoices. Unit = the invoice's BRANCH via the verified unit->branch mapping;
        // a unit without a mapped branch, or a product-category selection (a balance has no categories), is "not available" rather than a wrong number.
        int? recvBranch = null;
        if (cat is not null) counts.OutstandingReceivablesNote = "An unpaid balance is not split by product category.";
        else if (q.Unit is int ru)
        {
            var map = await UnitBranchMap.ResolveAsync(db, _config, _company.CompanyCode, ru, ct);
            if (map.BranchId is null) counts.OutstandingReceivablesNote = map.Note;
            else { recvBranch = map.BranchId; counts.OutstandingReceivablesNote = $"Branch {map.BranchName} (mapped to {map.Label})"; }
        }
        if (cat is null && (q.Unit is null || recvBranch is not null))
        {
            var rp = new DynamicParameters(p);
            rp.Add("Branch", recvBranch);
            counts.OutstandingReceivables = await db.ExecuteScalarAsync<decimal>(new CommandDefinition(@"
                SELECT ISNULL(SUM(h.DocTotal - h.PaidToDate), 0) FROM OINV h
                WHERE h.CANCELED = 'N' AND h.DocStatus = 'O' AND (@Branch IS NULL OR h.BPLId = @Branch) AND (@Slp IS NULL OR h.SlpCode = @Slp)
                  AND (@Group IS NULL OR EXISTS (SELECT 1 FROM OCRD c WHERE c.CardCode = h.CardCode AND c.GroupCode = @Group))", rp, cancellationToken: ct));
        }
        else counts.OutstandingReceivables = null;

        counts.DateFrom = from; counts.DateTo = to; counts.MonthFrom = monthFrom; counts.YearFrom = yearFrom; counts.AsOf = asOf;

        // Sales values use the same turnover rule as the headline (net of credit notes when on; default-excluded locations out for All units).
        var locs = (await db.QueryAsync<LocRow>(new CommandDefinition("SELECT Code, Location AS Name FROM OLCT", cancellationToken: ct))).ToList();
        var excludedNames = (_config.GetSection($"SalesTurnover:DefaultExcludedLocations:{_company.CompanyCode}").Get<string[]>() ?? Array.Empty<string>()).Select(Norm).ToHashSet();
        var excluded = locs.Where(l => excludedNames.Contains(Norm(l.Name))).Select(l => l.Code).ToHashSet();
        async Task<decimal> TurnoverAsync(DateTime f, DateTime t)
        {
            var rows = await ActualByLocAsync(db, f, t, q.IncludeTax, q.NetOfCreditNotes, q.CustomerGroup, q.Salesperson, cat, ct);
            return q.Unit is int u ? rows.Where(r => r.LocCode == u).Sum(r => r.Amt) : rows.Where(r => r.LocCode is null || !excluded.Contains(r.LocCode.Value)).Sum(r => r.Amt);
        }
        counts.MonthlySalesValue = await TurnoverAsync(monthFrom, asOf);
        counts.YearlySalesValue = await TurnoverAsync(yearFrom, asOf);

        // Receipts carry no unit, salesperson or item: only a customer-group selection can be honoured.
        if (q.Unit is not null || q.Salesperson is not null || cat is not null)
        {
            counts.IncomingPaymentsThisMonth = null;
            counts.IncomingPaymentsNote = "Incoming payments are not recorded by unit, salesperson or product category.";
        }
        else
        {
            counts.IncomingPaymentsThisMonth = await db.ExecuteScalarAsync<decimal>(new CommandDefinition(@"
                SELECT ISNULL(SUM(r.DocTotal), 0) FROM ORCT r
                WHERE r.Canceled = 'N' AND r.DocDate >= @MonthFrom AND r.DocDate < DATEADD(DAY, 1, @AsOf)
                  AND (@Group IS NULL OR EXISTS (SELECT 1 FROM OCRD c WHERE c.CardCode = r.CardCode AND c.GroupCode = @Group))", p, cancellationToken: ct));
        }
        return counts;
    }

    /// <summary>Actual turnover by line location for [from, to] under the shared dimensions (the Sales Register rule).</summary>
    private async Task<List<AmtRow>> ActualByLocAsync(System.Data.IDbConnection db, DateTime from, DateTime to, bool includeTax, bool netOfCreditNotes, int? group, int? slp, string? category, CancellationToken ct)
    {
        var p = new DynamicParameters();
        p.Add("From", from); p.Add("To", to); p.Add("Group", group); p.Add("Slp", slp); p.Add("Cat", category);
        var rowsSql = netOfCreditNotes
            ? SalesAmount.NetOfCreditNotesRows(includeTax)
            : $@"SELECT h.BPLId, c.GroupCode, l.LocCode, h.SlpCode, h.DocDate, l.ItemCode, l.Quantity AS Qty, {SalesAmount.AllocatedToLine(includeTax)} AS Amt
                 FROM OINV h JOIN INV1 l ON l.DocEntry = h.DocEntry LEFT JOIN OCRD c ON c.CardCode = h.CardCode
                 WHERE h.CANCELED = 'N' AND h.DocDate >= @From AND h.DocDate <= @To";
        return (await db.QueryAsync<AmtRow>(new CommandDefinition($@"
            WITH alloc AS ({rowsSql})
            SELECT a.LocCode, SUM(a.Amt) AS Amt, 0 AS N
            FROM alloc a LEFT JOIN OITM it ON it.ItemCode = a.ItemCode
            WHERE (@Group IS NULL OR a.GroupCode = @Group) AND (@Slp IS NULL OR a.SlpCode = @Slp)
              AND (@Cat IS NULL OR {ProductCategories.Expr("it")} = @Cat)
            GROUP BY a.LocCode", p, cancellationToken: ct))).ToList();
    }
}
