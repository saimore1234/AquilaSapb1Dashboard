using Dapper;
using SAPB1.Api.DTOs.Sales;

namespace SAPB1.Api.Services;

/// <summary>Dashboard KPI drill-downs and the Payment Due Register. Same read-only, parameterised approach as the other detail reports.</summary>
public partial class SqlSalesDetailReportsService
{
    public static readonly HashSet<string> KpiKinds = new() { "open-quotations", "open-orders", "pending-deliveries", "open-invoices", "incoming-payments" };
    public static readonly HashSet<string> PaymentDueStatuses = new() { "unpaid", "partial", "overdue", "duetoday", "notdue" };

    // ------------------------------------------------------------------ Documents behind a KPI card
    // The predicates are the ones the dashboard counts use (SqlSalesActivity): cancelled excluded, open = DocStatus 'O', and the same unit /
    // salesperson / customer-group / category rules (DocDims), so the list's count reconciles with the card. Open-position cards ignore the dates;
    // incoming payments use the date range (the card's month) and can only be narrowed by customer group.
    public async Task<KpiDocumentReportDto> GetKpiDocumentsAsync(DetailReportQuery q, CancellationToken ct = default)
    {
        var kind = q.By ?? "";
        var (from, to) = Range(q.DateFrom, q.DateTo);
        var cat = ProductCategories.Canonical(q.ProductCategory);
        var pageSize = Math.Clamp(q.PageSize, 1, 5000);
        var p = new DynamicParameters();
        p.Add("From", from); p.Add("To", to);
        p.Add("Unit", q.Unit); p.Add("Slp", q.Salesperson); p.Add("Group", q.CustomerGroup); p.Add("Cat", cat);
        p.Add("Branch", q.Branch);
        p.Add("Skip", (Math.Max(1, q.Page) - 1) * pageSize); p.Add("Take", pageSize);

        string table, lines, openCond, balance, dueCol = "h.DocDueDate";
        switch (kind)
        {
            case "open-quotations": table = "OQUT"; lines = "QUT1"; openCond = "h.DocStatus = 'O'"; balance = "h.DocTotal"; break;
            case "open-orders": table = "ORDR"; lines = "RDR1"; openCond = "h.DocStatus = 'O'"; balance = "h.DocTotal"; break;
            case "pending-deliveries": table = "ODLN"; lines = "DLN1"; openCond = $"h.DocStatus = 'O' AND {DeliveryRules.ExcludeIntercompany("h")}"; balance = "h.DocTotal"; break;
            case "open-invoices": table = "OINV"; lines = "INV1"; openCond = "h.DocStatus = 'O'"; balance = "h.DocTotal - h.PaidToDate"; break;
            default: table = "ORCT"; lines = ""; openCond = "h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To)"; balance = "h.DocTotal"; dueCol = "CAST(NULL AS datetime)"; break;
        }

        string? note = null;
        string dims;
        if (kind == "incoming-payments")
        {
            // Receipts carry no unit, salesperson or item; only the customer group can be honoured (same rule as the card).
            dims = "AND (@Group IS NULL OR cu.GroupCode = @Group) AND (@Branch IS NULL OR h.BPLId = @Branch)";
            if (q.Unit is not null || q.Salesperson is not null || cat is not null)
            {
                note = "Incoming payments are not recorded by unit, salesperson or product category, so this list is empty for such a selection.";
                dims += " AND 1 = 0";
            }
        }
        else
        {
            dims = SqlSalesPerformanceService.DocDims(lines) + " AND (@Branch IS NULL OR h.BPLId = @Branch)";
        }

        var fromSql = $@"
            FROM {table} h
            LEFT JOIN OCRD cu ON cu.CardCode = h.CardCode
            LEFT JOIN OSLP s ON s.SlpCode = {(kind == "incoming-payments" ? "cu.SlpCode" : "h.SlpCode")}
            LEFT JOIN OBPL b ON b.BPLId = h.BPLId
            WHERE h.CANCELED = 'N' AND {openCond} {dims}{SalesScopeSql.CustomerPredicate(_scope.Current, "cu")}";

        using var db = _connectionFactory.CreateConnection();
        var totals = await db.QuerySingleAsync<KpiDocumentTotalsDto>(new CommandDefinition($@"
            SELECT COUNT(*) AS Documents, ISNULL(SUM(h.DocTotal), 0) AS DocTotal, ISNULL(SUM({balance}), 0) AS OpenAmount {fromSql}", p, cancellationToken: ct));
        var rows = (await db.QueryAsync<KpiDocumentRowDto>(new CommandDefinition($@"
            SELECT h.DocEntry, h.DocNum, h.DocDate AS PostingDate, {dueCol} AS DueDate, h.CardCode AS CustomerCode, ISNULL(cu.CardName, h.CardName) AS CustomerName,
                   s.SlpName AS Salesperson, b.BPLName AS Branch, h.DocTotal, {balance} AS OpenAmount
            {fromSql}
            ORDER BY h.DocDate DESC, h.DocEntry DESC
            OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY", p, cancellationToken: ct))).ToList();
        return new KpiDocumentReportDto { Kind = kind, Note = note, Totals = totals, TotalCount = totals.Documents, Rows = rows };
    }

    // ------------------------------------------------------------------ Payment Due Register
    // One row per open (not fully paid), non-cancelled A/R invoice, using the invoice's own SAP due date (OINV.DocDueDate, which SAP derived from
    // the payment terms) and terms (OCTG). Paid = OINV.PaidToDate, which SAP maintains for incoming payments (RCT2) AND for credit memos /
    // reconciliations applied to the invoice, so a payment or credit is never counted twice. Outstanding = DocTotal - PaidToDate, the same
    // figure as the "Outstanding Customer Invoices" report and card. Unapplied credit memos and payments on account sit on the customer account, not
    // on an invoice, so they are not netted here; the journal-based Total Outstanding (the client's ageing definition) nets them.
    public async Task<PaymentDueReportDto> GetPaymentDueAsync(PaymentDueQuery q, CancellationToken ct = default)
    {
        var today = DateTime.Today;
        var pageSize = Math.Clamp(q.PageSize, 1, 5000);
        var p = new DynamicParameters();
        p.Add("Today", today);
        p.Add("Search", Like(q.Customer));
        p.Add("InvNo", q.InvoiceNo); p.Add("Terms", q.PaymentTerms); p.Add("Slp", q.Salesperson); p.Add("Branch", q.Branch);
        p.Add("DueFrom", q.DueFrom?.Date); p.Add("DueTo", q.DueTo?.Date);
        p.Add("Status", string.IsNullOrWhiteSpace(q.Status) ? null : q.Status.Trim().ToLowerInvariant());
        p.Add("MinOver", q.MinDaysOverdue);
        p.Add("Skip", (Math.Max(1, q.Page) - 1) * pageSize); p.Add("Take", pageSize);

        var cte = $@"
            WITH x AS (
                SELECT h.DocEntry, h.DocNum, h.CardCode, ISNULL(cu.CardName, h.CardName) AS CardName, h.DocDate, h.DocDueDate, h.GroupNum, t.PymntGroup,
                       h.DocTotal, h.PaidToDate, h.DocTotal - h.PaidToDate AS Bal, h.SlpCode, s.SlpName, h.BPLId, b.BPLName,
                       DATEDIFF(DAY, h.DocDueDate, @Today) AS Dd
                FROM OINV h
                LEFT JOIN OCRD cu ON cu.CardCode = h.CardCode
                LEFT JOIN OCTG t ON t.GroupNum = h.GroupNum
                LEFT JOIN OSLP s ON s.SlpCode = h.SlpCode
                LEFT JOIN OBPL b ON b.BPLId = h.BPLId
                WHERE h.CANCELED = 'N' AND h.DocStatus = 'O'{SalesScopeSql.CustomerPredicate(_scope.Current, "cu")}
            )";
        const string where = @"
            WHERE (@Search IS NULL OR x.CardCode LIKE @Search OR x.CardName LIKE @Search)
              AND (@InvNo IS NULL OR x.DocNum = @InvNo)
              AND (@Terms IS NULL OR x.GroupNum = @Terms)
              AND (@Slp IS NULL OR x.SlpCode = @Slp)
              AND (@Branch IS NULL OR x.BPLId = @Branch)
              AND (@DueFrom IS NULL OR x.DocDueDate >= @DueFrom)
              AND (@DueTo IS NULL OR x.DocDueDate < DATEADD(DAY, 1, @DueTo))
              AND (@MinOver IS NULL OR x.Dd >= @MinOver)
              AND (@Status IS NULL
                   OR (@Status = 'unpaid' AND x.PaidToDate <= 0.005)
                   OR (@Status = 'partial' AND x.PaidToDate > 0.005)
                   OR (@Status = 'overdue' AND x.Dd > 0)
                   OR (@Status = 'duetoday' AND x.Dd = 0)
                   OR (@Status = 'notdue' AND x.Dd < 0))";

        using var db = _connectionFactory.CreateConnection();
        var totals = await db.QuerySingleAsync<PaymentDueTotalsDto>(new CommandDefinition($@"
            {cte}
            SELECT COUNT(*) AS Invoices, ISNULL(SUM(x.DocTotal), 0) AS InvoiceAmount, ISNULL(SUM(x.PaidToDate), 0) AS PaidAmount, ISNULL(SUM(x.Bal), 0) AS Outstanding,
                   ISNULL(SUM(CASE WHEN x.Dd > 0 THEN x.Bal ELSE 0 END), 0) AS Overdue,
                   ISNULL(SUM(CASE WHEN x.Dd > 0 THEN 1 ELSE 0 END), 0) AS OverdueInvoices,
                   ISNULL(SUM(CASE WHEN x.Dd = 0 THEN x.Bal ELSE 0 END), 0) AS DueToday,
                   ISNULL(SUM(CASE WHEN x.Dd <= 0 AND x.Dd >= -7 THEN x.Bal ELSE 0 END), 0) AS DueWithin7,
                   ISNULL(SUM(CASE WHEN x.Dd <= 0 AND x.Dd >= -15 THEN x.Bal ELSE 0 END), 0) AS DueWithin15,
                   ISNULL(SUM(CASE WHEN x.Dd <= 0 AND x.Dd >= -30 THEN x.Bal ELSE 0 END), 0) AS DueWithin30
            FROM x {where}", p, cancellationToken: ct));
        totals.CustomerAccountBalance = await db.ExecuteScalarAsync<decimal>(new CommandDefinition($@"
            {cte}
            SELECT ISNULL(SUM(c.Balance), 0) FROM OCRD c WHERE c.CardCode IN (SELECT x.CardCode FROM x {where})", p, cancellationToken: ct));

        var byCustomer = (await db.QueryAsync<PaymentDueBreakdownDto>(new CommandDefinition($@"
            {cte}
            SELECT TOP 100 x.CardCode AS [Key], MAX(x.CardName) AS Name, COUNT(*) AS Invoices, SUM(x.Bal) AS Outstanding,
                   SUM(CASE WHEN x.Dd > 0 THEN x.Bal ELSE 0 END) AS Overdue
            FROM x {where} GROUP BY x.CardCode ORDER BY SUM(x.Bal) DESC", p, cancellationToken: ct))).ToList();

        var byTerms = (await db.QueryAsync<PaymentDueBreakdownDto>(new CommandDefinition($@"
            {cte}
            SELECT CAST(x.GroupNum AS varchar(20)) AS [Key], MAX(ISNULL(x.PymntGroup, '(No terms)')) AS Name, COUNT(*) AS Invoices, SUM(x.Bal) AS Outstanding,
                   SUM(CASE WHEN x.Dd > 0 THEN x.Bal ELSE 0 END) AS Overdue
            FROM x {where} GROUP BY x.GroupNum ORDER BY SUM(x.Bal) DESC", p, cancellationToken: ct))).ToList();

        var rows = (await db.QueryAsync<PaymentDueRowDto>(new CommandDefinition($@"
            {cte}
            SELECT x.DocEntry, x.DocNum, x.CardCode AS CustomerCode, x.CardName AS CustomerName, x.DocDate AS PostingDate, x.DocDueDate AS DueDate,
                   x.PymntGroup AS PaymentTerms, x.DocTotal AS InvoiceAmount, x.PaidToDate AS PaidAmount, x.Bal AS OutstandingAmount, x.Dd AS DaysOverdue,
                   CASE WHEN x.PaidToDate > 0.005 THEN 'Partially paid' ELSE 'Unpaid' END AS PaymentStatus, x.SlpName AS Salesperson, x.BPLName AS Branch
            FROM x {where}
            ORDER BY x.DocDueDate, x.DocNum
            OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY", p, cancellationToken: ct))).ToList();

        return new PaymentDueReportDto { AsOf = today, Totals = totals, ByCustomer = byCustomer, ByTerms = byTerms, TotalCount = totals.Invoices, Rows = rows };
    }
}
