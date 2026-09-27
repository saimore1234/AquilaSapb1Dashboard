using System.Data;
using Dapper;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Finance;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Services;

/// <summary>
/// Read-only SQL implementation of SAP B1 Finance/Accounting data, using the
/// same pattern as SqlSapB1Service/SqlPurchaseService/SqlSalesService/
/// SqlProductionService: direct, parameterized Dapper queries against
/// whichever company ICompanyConnectionFactory resolves for the current
/// request. Deliberately READ-ONLY.
///
/// TABLES USED (verified against this project's actual STEST company
/// database via INFORMATION_SCHEMA.COLUMNS before writing any query here):
///
///   OACT   Chart of Accounts (AcctCode, AcctName, FatherNum, Levels, ActType,
///          Postable, Frozen, ActCurr, CurrTotal)
///   OJDT   Journal Entry header, one row per transaction (TransId, RefDate,
///          DueDate, TaxDate, Memo, Ref1/Ref2, TransType, Number)
///   JDT1   Journal Entry / General Ledger lines, many rows per TransId
///          (Account, Debit, Credit, ShortName = business-partner code,
///          ContraAct, LineMemo, DocType/DocNum/DocEntry = source document)
///   OVTG   Tax (VAT/GST) group master — EMPTY in every company configured in
///          this environment at verification time, so tax code name/rate are
///          only shown when a real OVTG row exists; otherwise the raw
///          TaxCode string already used elsewhere in this codebase (Sales/
///          Purchase INV1.TaxCode etc.) is shown as-is.
///   OINV/INV1, OPCH/PCH1, ORCT, OVPM, OCRD, OITW — the exact same tables and
///          column names already verified and relied on by SqlSapB1Service/
///          SqlSalesService/SqlPurchaseService; reused here rather than
///          re-verified from scratch, since column names don't change between
///          modules within the same database.
///
/// ACCOUNT CLASSIFICATION — the single hardest "don't assume" problem in this
/// module. OACT.ActType only has 3 real values in this installation (E/I/N —
/// far too sparse and inconsistently applied to classify all 481 accounts:
/// only 31 of them have ActType set at all), and OACT.CashBox is blank on
/// every single account (never used by this company). What IS reliable,
/// verified identical across every company database checked in this
/// environment (STEST and CoffersMettalicsLIVE both have the exact same 10
/// codes/names), is that every SAP B1 chart of accounts has exactly 10 root
/// "drawer" accounts with FatherNum IS NULL — a genuine SAP B1 structural
/// feature created by the COA setup wizard, not something this company chose
/// — named "Asset" / "Liability" / "Equity" / "Revenue" / "Expenditure" /
/// "#6".."#10" (unused placeholders here). Every real account nests under one
/// of these via FatherNum, however many levels deep. So account
/// classification here walks FatherNum up to that root and reads the root's
/// own name — never a hardcoded account number, and confirmed portable
/// across this environment's companies.
///
/// For Profit &amp; Loss, this company's own bookkeeping additionally nests
/// accounts under recognisably-named sub-groups ("Direct Income" / "Indirect
/// Income" / "Direct Expenses" / "Indirect Expenses" — the standard
/// Indian/Tally-style trading-account convention), which this service uses,
/// with the coarse Revenue/Expenditure root as a fallback for any account not
/// nested that way. Bank vs Cash and the Balance Sheet's finer buckets use
/// the same kind of name-based heuristic on top of the verified Assets-root
/// classification (documented, with fallbacks, never silently wrong) since
/// SAP B1 has no dedicated "this is a bank account" flag that this company
/// actually populated.
/// </summary>
public class SqlFinanceService : IFinanceService
{
    private sealed class AccountRow
    {
        public string AcctCode = string.Empty;
        public string AcctName = string.Empty;
        public string? FatherNum;
        public string? ActType;
        public bool Postable;
        public bool Active;
        public string? Currency;
        public decimal Balance;
    }

    private readonly ICompanyConnectionFactory _connectionFactory;
    private readonly ILogger<SqlFinanceService> _logger;

    public SqlFinanceService(ICompanyConnectionFactory connectionFactory, ILogger<SqlFinanceService> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    // ---------------------------------------------------------------
    // Chart-of-accounts hierarchy helpers — loaded once per request that
    // needs classification (bounded master data, a few hundred rows).
    // ---------------------------------------------------------------
    private async Task<Dictionary<string, AccountRow>> LoadAccountsAsync(IDbConnection db, CancellationToken ct)
    {
        const string sql = "SELECT AcctCode, AcctName, FatherNum, ActType, Postable, Frozen, ActCurr, CurrTotal FROM OACT";
        var rows = await db.QueryAsync(new CommandDefinition(sql, cancellationToken: ct));
        var map = new Dictionary<string, AccountRow>(StringComparer.OrdinalIgnoreCase);
        foreach (var r in rows)
        {
            string code = r.AcctCode;
            map[code] = new AccountRow
            {
                AcctCode = code,
                AcctName = r.AcctName ?? code,
                FatherNum = r.FatherNum,
                ActType = r.ActType,
                Postable = r.Postable == "Y",
                Active = r.Frozen != "Y",
                Currency = r.ActCurr,
                Balance = r.CurrTotal
            };
        }
        return map;
    }

    /// <summary>Root-first list of an account's own name and every ancestor's name, walking FatherNum.</summary>
    private static List<string> GetAncestorChain(string code, Dictionary<string, AccountRow> accounts)
    {
        var chain = new List<string>();
        accounts.TryGetValue(code, out var current);
        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var guard = 0;
        while (current is not null && guard++ < 25)
        {
            chain.Add(current.AcctName);
            if (string.IsNullOrEmpty(current.FatherNum) || !visited.Add(current.FatherNum)) break;
            accounts.TryGetValue(current.FatherNum, out current);
        }
        chain.Reverse();
        return chain;
    }

    private static string ClassifyTopLevel(string code, Dictionary<string, AccountRow> accounts)
    {
        var chain = GetAncestorChain(code, accounts);
        var root = (chain.Count > 0 ? chain[0] : string.Empty).ToLowerInvariant();
        if (root.Contains("asset")) return "Assets";
        if (root.Contains("liabilit")) return "Liabilities";
        if (root.Contains("equity")) return "Equity";
        if (root.Contains("revenue") || root.Contains("income")) return "Revenue";
        if (root.Contains("expend") || root.Contains("expense")) return "Expenses";
        return "Other";
    }

    /// <summary>"Revenue" | "CostOfGoodsSold" | "OperatingExpenses" | "OtherIncome" | "None" (not a P&amp;L account).</summary>
    private static string ClassifyPLBucket(string code, Dictionary<string, AccountRow> accounts)
    {
        foreach (var name in GetAncestorChain(code, accounts))
        {
            var l = name.ToLowerInvariant();
            if (l.Contains("indirect income")) return "OtherIncome";
            if (l.Contains("direct income") || l.Contains("sales account")) return "Revenue";
            if (l.Contains("indirect expense")) return "OperatingExpenses";
            if (l.Contains("direct expense")) return "CostOfGoodsSold";
        }
        var top = ClassifyTopLevel(code, accounts);
        return top switch { "Revenue" => "Revenue", "Expenses" => "OperatingExpenses", _ => "None" };
    }

    private static string? ClassifyBankCash(AccountRow acct, Dictionary<string, AccountRow> accounts)
    {
        if (!acct.Postable || acct.ActType is "E" or "I") return null;
        if (ClassifyTopLevel(acct.AcctCode, accounts) != "Assets") return null;
        var n = acct.AcctName.ToLowerInvariant();
        if (n.Contains("cash")) return "Cash";
        if (n.Contains("bank")) return "Bank";
        return null;
    }

    // ---------------------------------------------------------------
    // CHART OF ACCOUNTS
    // ---------------------------------------------------------------
    public async Task<PagedResult<AccountDto>> GetChartOfAccountsAsync(ChartOfAccountsQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var accounts = await LoadAccountsAsync(db, ct);

        const string levelsSql = "SELECT AcctCode, Levels FROM OACT";
        var levelsRows = (await db.QueryAsync(new CommandDefinition(levelsSql, cancellationToken: ct))).ToList();
        var levels = levelsRows.ToDictionary(r => (string)r.AcctCode, r => (int)r.Levels, StringComparer.OrdinalIgnoreCase);

        IEnumerable<AccountRow> filtered = accounts.Values;
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var s = query.Search.Trim();
            filtered = filtered.Where(a => a.AcctCode.Contains(s, StringComparison.OrdinalIgnoreCase) || a.AcctName.Contains(s, StringComparison.OrdinalIgnoreCase));
        }
        if (query.Active.HasValue)
        {
            filtered = filtered.Where(a => a.Active == query.Active.Value);
        }

        var ordered = filtered.OrderBy(a => a.AcctCode, StringComparer.OrdinalIgnoreCase).ToList();
        var total = ordered.Count;
        var page = ordered.Skip(query.Skip).Take(query.PageSize).Select(a => new AccountDto
        {
            AcctCode = a.AcctCode,
            AcctName = a.AcctName,
            Classification = ClassifyTopLevel(a.AcctCode, accounts),
            GroupName = a.FatherNum is not null && accounts.TryGetValue(a.FatherNum, out var father) ? father.AcctName : null,
            ParentCode = a.FatherNum,
            Level = levels.TryGetValue(a.AcctCode, out var lvl) ? lvl : 0,
            Postable = a.Postable,
            Active = a.Active,
            Currency = a.Currency == "##" ? null : a.Currency,
            Balance = a.Balance
        }).ToList();

        return new PagedResult<AccountDto> { Items = page, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }

    // ---------------------------------------------------------------
    // GENERAL LEDGER (JDT1 / OJDT)
    // ---------------------------------------------------------------
    public async Task<PagedResult<LedgerEntryDto>> GetLedgerAsync(LedgerQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        var debitCredit = query.DebitCredit?.Trim().ToLowerInvariant();

        const string filterSql = @"
            WHERE (@DateFrom IS NULL OR o.RefDate >= @DateFrom)
              AND (@DateTo IS NULL OR o.RefDate <= @DateTo)
              AND (@Account IS NULL OR l.Account = @Account)
              AND (@BusinessPartner IS NULL OR l.ShortName = @BusinessPartner)
              AND (@DocumentType IS NULL OR l.DocType = @DocumentType)
              AND (@DebitOnly = 0 OR l.Debit > 0)
              AND (@CreditOnly = 0 OR l.Credit > 0)
              AND (@Search IS NULL OR CAST(l.TransId AS NVARCHAR(20)) LIKE @SearchLike
                   OR l.Account LIKE @SearchLike OR o.Ref1 LIKE @SearchLike OR o.Ref2 LIKE @SearchLike
                   OR o.Memo LIKE @SearchLike OR l.LineMemo LIKE @SearchLike)";

        var p = new DynamicParameters();
        p.Add("DateFrom", query.DateFrom);
        p.Add("DateTo", query.DateTo);
        p.Add("Account", query.Account);
        p.Add("BusinessPartner", query.BusinessPartner);
        p.Add("DocumentType", query.DocumentType);
        p.Add("DebitOnly", debitCredit == "debit" ? 1 : 0);
        p.Add("CreditOnly", debitCredit == "credit" ? 1 : 0);
        p.Add("Search", query.Search);
        p.Add("SearchLike", query.Search is null ? null : $"%{query.Search}%");
        p.Add("Skip", query.Skip);
        p.Add("PageSize", query.PageSize);

        var countSql = $"SELECT COUNT(*) FROM JDT1 l INNER JOIN OJDT o ON o.TransId = l.TransId {filterSql}";
        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, p, cancellationToken: ct));

        // "Balance" is a running total per account (window function), computed
        // over the rows actually returned by the filters above — i.e. within
        // the currently displayed view, not the account's unfiltered lifetime
        // history. Clear date/account filters to see the true running balance.
        var listSql = $@"
            SELECT l.TransId, l.Line_ID AS LineId, o.RefDate AS PostingDate, l.DueDate, l.TaxDate,
                   l.Account AS AccountCode, a.AcctName AS AccountName, l.Debit, l.Credit,
                   SUM(l.Debit - l.Credit) OVER (PARTITION BY l.Account ORDER BY o.RefDate, l.TransId, l.Line_ID ROWS UNBOUNDED PRECEDING) AS Balance,
                   o.Ref1 AS Reference, o.Memo, l.DocType AS DocumentType, l.DocNum AS DocumentNumber,
                   l.ShortName AS BusinessPartnerCode, cust.CardName AS BusinessPartnerName
            FROM JDT1 l
            INNER JOIN OJDT o ON o.TransId = l.TransId
            LEFT JOIN OACT a ON a.AcctCode = l.Account
            LEFT JOIN OCRD cust ON cust.CardCode = l.ShortName
            {filterSql}
            ORDER BY o.RefDate DESC, l.TransId DESC, l.Line_ID DESC
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var items = (await db.QueryAsync<LedgerEntryDto>(new CommandDefinition(listSql, p, cancellationToken: ct))).ToList();

        return new PagedResult<LedgerEntryDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }

    // ---------------------------------------------------------------
    // JOURNAL ENTRIES (OJDT header, JDT1 lines on demand)
    // ---------------------------------------------------------------
    public async Task<PagedResult<JournalEntryDto>> GetJournalEntriesAsync(JournalEntryQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string whereSql = @"
            WHERE (@DateFrom IS NULL OR o.RefDate >= @DateFrom)
              AND (@DateTo IS NULL OR o.RefDate <= @DateTo)
              AND (@Search IS NULL OR CAST(o.TransId AS NVARCHAR(20)) LIKE @SearchLike
                   OR o.Ref1 LIKE @SearchLike OR o.Ref2 LIKE @SearchLike OR o.Memo LIKE @SearchLike
                   OR CAST(o.Number AS NVARCHAR(20)) LIKE @SearchLike)";

        var p = new DynamicParameters();
        p.Add("DateFrom", query.DateFrom);
        p.Add("DateTo", query.DateTo);
        p.Add("Search", query.Search);
        p.Add("SearchLike", query.Search is null ? null : $"%{query.Search}%");
        p.Add("Skip", query.Skip);
        p.Add("PageSize", query.PageSize);

        var countSql = $"SELECT COUNT(*) FROM OJDT o {whereSql}";
        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, p, cancellationToken: ct));

        var listSql = $@"
            SELECT o.TransId, o.RefDate AS PostingDate, o.Ref1 AS Reference, o.Memo, o.TransType AS Origin, o.Number AS DocumentNumber,
                   ISNULL((SELECT SUM(Debit) FROM JDT1 WHERE TransId = o.TransId), 0) AS TotalDebit,
                   ISNULL((SELECT SUM(Credit) FROM JDT1 WHERE TransId = o.TransId), 0) AS TotalCredit
            FROM OJDT o
            {whereSql}
            ORDER BY o.RefDate DESC, o.TransId DESC
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var items = (await db.QueryAsync<JournalEntryDto>(new CommandDefinition(listSql, p, cancellationToken: ct))).ToList();

        return new PagedResult<JournalEntryDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }

    public async Task<JournalEntryDetailDto?> GetJournalEntryByTransIdAsync(int transId, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string headerSql = @"
            SELECT TransId, RefDate AS PostingDate, DueDate, TaxDate, Ref1 AS Reference, Ref2 AS Reference2, Memo, TransType AS Origin, Number AS DocumentNumber
            FROM OJDT WHERE TransId = @TransId";
        var header = await db.QuerySingleOrDefaultAsync(new CommandDefinition(headerSql, new { TransId = transId }, cancellationToken: ct));
        if (header is null) return null;

        const string linesSql = @"
            SELECT l.Line_ID AS LineId, l.Account AS AccountCode, a.AcctName AS AccountName, l.Debit, l.Credit,
                   l.ShortName AS BusinessPartnerCode, cust.CardName AS BusinessPartnerName,
                   l.LineMemo, l.ContraAct AS ContraAccount, l.Project AS CostCenter
            FROM JDT1 l
            LEFT JOIN OACT a ON a.AcctCode = l.Account
            LEFT JOIN OCRD cust ON cust.CardCode = l.ShortName
            WHERE l.TransId = @TransId
            ORDER BY l.Line_ID";
        var lines = (await db.QueryAsync<JournalEntryLineDto>(new CommandDefinition(linesSql, new { TransId = transId }, cancellationToken: ct))).ToList();

        var totalDebit = lines.Sum(l => l.Debit);
        var totalCredit = lines.Sum(l => l.Credit);

        return new JournalEntryDetailDto
        {
            TransId = header.TransId, PostingDate = header.PostingDate, DueDate = header.DueDate, TaxDate = header.TaxDate,
            Reference = header.Reference, Reference2 = header.Reference2, Memo = header.Memo, Origin = header.Origin,
            DocumentNumber = header.DocumentNumber, Lines = lines,
            TotalDebit = totalDebit, TotalCredit = totalCredit, BalanceDifference = totalDebit - totalCredit
        };
    }

    // ---------------------------------------------------------------
    // BUSINESS PARTNER LEDGER
    // ---------------------------------------------------------------
    public async Task<PagedResult<BpLedgerDto>> GetBpLedgerAsync(BpLedgerQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        var cardType = query.PartnerType?.Trim().ToLowerInvariant() switch
        {
            "customer" => "C",
            "vendor" => "S",
            _ => (string?)null
        };

        const string filterSql = @"
            WHERE bp.CardCode IS NOT NULL
              AND (@PartnerType IS NULL OR bp.CardType = @PartnerType)
              AND (@BusinessPartner IS NULL OR bp.CardCode = @BusinessPartner)";

        var p = new DynamicParameters();
        p.Add("DateFrom", query.DateFrom);
        p.Add("PartnerType", cardType);
        p.Add("BusinessPartner", query.BusinessPartner);
        p.Add("Skip", query.Skip);
        p.Add("PageSize", query.PageSize);

        var countSql = $@"
            SELECT COUNT(*) FROM (
                SELECT DISTINCT bp.CardCode
                FROM OCRD bp
                INNER JOIN JDT1 l ON l.ShortName = bp.CardCode
                {(query.DateTo.HasValue ? "INNER JOIN OJDT o ON o.TransId = l.TransId AND o.RefDate <= @DateTo" : "")}
                {filterSql}
            ) x";
        p.Add("DateTo", query.DateTo);
        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, p, cancellationToken: ct));

        var listSql = $@"
            SELECT bp.CardCode AS BpCode, bp.CardName AS BpName,
                   CASE WHEN bp.CardType = 'C' THEN 'Customer' ELSE 'Vendor' END AS Type,
                   ISNULL(SUM(CASE WHEN @DateFrom IS NOT NULL AND o.RefDate < @DateFrom THEN l.Debit - l.Credit ELSE 0 END), 0) AS OpeningBalance,
                   ISNULL(SUM(CASE WHEN @DateFrom IS NULL OR o.RefDate >= @DateFrom THEN l.Debit ELSE 0 END), 0) AS Debit,
                   ISNULL(SUM(CASE WHEN @DateFrom IS NULL OR o.RefDate >= @DateFrom THEN l.Credit ELSE 0 END), 0) AS Credit
            FROM OCRD bp
            INNER JOIN JDT1 l ON l.ShortName = bp.CardCode
            INNER JOIN OJDT o ON o.TransId = l.TransId
            {filterSql}
              AND (@DateTo IS NULL OR o.RefDate <= @DateTo)
            GROUP BY bp.CardCode, bp.CardName, bp.CardType
            ORDER BY bp.CardCode
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var rows = (await db.QueryAsync(new CommandDefinition(listSql, p, cancellationToken: ct))).ToList();
        var items = rows.Select(r => new BpLedgerDto
        {
            BpCode = r.BpCode, BpName = r.BpName, Type = r.Type,
            OpeningBalance = r.OpeningBalance, Debit = r.Debit, Credit = r.Credit,
            Balance = (decimal)r.OpeningBalance + (decimal)r.Debit - (decimal)r.Credit
        }).ToList();

        return new PagedResult<BpLedgerDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }

    // ---------------------------------------------------------------
    // ACCOUNTS RECEIVABLE / PAYABLE AGEING (OINV / OPCH — same verified
    // columns already used by SqlSalesService/SqlPurchaseService)
    // ---------------------------------------------------------------
    private static (string Bucket, int DaysOverdue) ClassifyAgeing(DateTime? dueDate, DateTime reportingDate)
    {
        if (dueDate is null || dueDate.Value.Date >= reportingDate.Date) return ("Current", 0);
        var days = (reportingDate.Date - dueDate.Value.Date).Days;
        var bucket = days switch
        {
            <= 30 => "1-30",
            <= 60 => "31-60",
            <= 90 => "61-90",
            <= 120 => "91-120",
            _ => "120+"
        };
        return (bucket, days);
    }

    public async Task<PagedResult<ReceivableDto>> GetReceivablesAsync(AgeingQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var reportingDate = DateTime.Today;

        var (whereSql, p) = BuildAgeingFilters(query, "c", "cust");
        var countSql = $"SELECT COUNT(*) FROM OINV c LEFT JOIN OCRD cust ON cust.CardCode = c.CardCode {whereSql}";
        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, p, cancellationToken: ct));

        var listSql = $@"
            SELECT c.CardCode AS CustomerCode, cust.CardName AS CustomerName, c.DocEntry, c.DocNum,
                   c.DocDate AS InvoiceDate, c.DocDueDate AS DueDate, c.DocTotal AS InvoiceTotal, c.PaidToDate AS Paid,
                   c.DocCur AS Currency
            FROM OINV c
            LEFT JOIN OCRD cust ON cust.CardCode = c.CardCode
            {whereSql}
            ORDER BY c.DocDueDate ASC, c.DocEntry DESC
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var rows = (await db.QueryAsync(new CommandDefinition(listSql, p, cancellationToken: ct))).ToList();
        var items = rows.Select(r =>
        {
            DateTime? dueDate = r.DueDate;
            var (bucket, days) = ClassifyAgeing(dueDate, reportingDate);
            decimal balance = r.InvoiceTotal - r.Paid;
            return new ReceivableDto
            {
                CustomerCode = r.CustomerCode, CustomerName = r.CustomerName, DocEntry = r.DocEntry, DocNum = r.DocNum,
                InvoiceDate = r.InvoiceDate, DueDate = dueDate, InvoiceTotal = r.InvoiceTotal, Paid = r.Paid, Balance = balance,
                DaysOverdue = days, Status = balance <= 0 ? "Paid" : days > 0 ? "Overdue" : "Open",
                Currency = r.Currency, AgeingBucket = bucket
            };
        }).Where(r => query.AgeingBucket is null || r.AgeingBucket == query.AgeingBucket).ToList();

        return new PagedResult<ReceivableDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }

    public async Task<AgeingSummaryDto> GetReceivablesSummaryAsync(CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        const string sql = "SELECT DocDueDate, DocTotal - PaidToDate AS Balance FROM OINV WHERE DocStatus = 'O'";
        var rows = (await db.QueryAsync(new CommandDefinition(sql, cancellationToken: ct))).ToList();
        return BuildAgeingSummary(rows.Select(r => ((DateTime?)r.DocDueDate, (decimal)r.Balance)));
    }

    public async Task<PagedResult<PayableDto>> GetPayablesAsync(AgeingQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var reportingDate = DateTime.Today;

        var (whereSql, p) = BuildAgeingFilters(query, "c", "vend");
        var countSql = $"SELECT COUNT(*) FROM OPCH c LEFT JOIN OCRD vend ON vend.CardCode = c.CardCode {whereSql}";
        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, p, cancellationToken: ct));

        var listSql = $@"
            SELECT c.CardCode AS VendorCode, vend.CardName AS VendorName, c.DocEntry, c.DocNum,
                   c.DocDate AS InvoiceDate, c.DocDueDate AS DueDate, c.DocTotal AS InvoiceTotal, c.PaidToDate AS Paid,
                   c.DocCur AS Currency
            FROM OPCH c
            LEFT JOIN OCRD vend ON vend.CardCode = c.CardCode
            {whereSql}
            ORDER BY c.DocDueDate ASC, c.DocEntry DESC
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var rows = (await db.QueryAsync(new CommandDefinition(listSql, p, cancellationToken: ct))).ToList();
        var items = rows.Select(r =>
        {
            DateTime? dueDate = r.DueDate;
            var (bucket, days) = ClassifyAgeing(dueDate, reportingDate);
            decimal balance = r.InvoiceTotal - r.Paid;
            return new PayableDto
            {
                VendorCode = r.VendorCode, VendorName = r.VendorName, DocEntry = r.DocEntry, DocNum = r.DocNum,
                InvoiceDate = r.InvoiceDate, DueDate = dueDate, InvoiceTotal = r.InvoiceTotal, Paid = r.Paid, Balance = balance,
                DaysOverdue = days, Status = balance <= 0 ? "Paid" : days > 0 ? "Overdue" : "Open",
                Currency = r.Currency, AgeingBucket = bucket
            };
        }).Where(r => query.AgeingBucket is null || r.AgeingBucket == query.AgeingBucket).ToList();

        return new PagedResult<PayableDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }

    public async Task<AgeingSummaryDto> GetPayablesSummaryAsync(CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        const string sql = "SELECT DocDueDate, DocTotal - PaidToDate AS Balance FROM OPCH WHERE DocStatus = 'O'";
        var rows = (await db.QueryAsync(new CommandDefinition(sql, cancellationToken: ct))).ToList();
        return BuildAgeingSummary(rows.Select(r => ((DateTime?)r.DocDueDate, (decimal)r.Balance)));
    }

    private static (string WhereSql, DynamicParameters Parameters) BuildAgeingFilters(AgeingQuery query, string alias, string bpAlias)
    {
        var sql = $@"
            WHERE {alias}.DocStatus = 'O'
              AND (@Search IS NULL OR CAST({alias}.DocNum AS NVARCHAR(20)) LIKE @SearchLike OR {alias}.CardCode LIKE @SearchLike OR {bpAlias}.CardName LIKE @SearchLike)
              AND (@DateFrom IS NULL OR {alias}.DocDate >= @DateFrom)
              AND (@DateTo IS NULL OR {alias}.DocDate <= @DateTo)
              AND (@BusinessPartner IS NULL OR {alias}.CardCode = @BusinessPartner)";

        var p = new DynamicParameters();
        p.Add("Search", query.Search);
        p.Add("SearchLike", query.Search is null ? null : $"%{query.Search}%");
        p.Add("DateFrom", query.DateFrom);
        p.Add("DateTo", query.DateTo);
        p.Add("BusinessPartner", query.BusinessPartner);
        p.Add("Skip", query.Skip);
        p.Add("PageSize", query.PageSize);
        return (sql, p);
    }

    private static AgeingSummaryDto BuildAgeingSummary(IEnumerable<(DateTime? DueDate, decimal Balance)> rows)
    {
        var reportingDate = DateTime.Today;
        var summary = new AgeingSummaryDto { ReportingDate = reportingDate };
        foreach (var (dueDate, balance) in rows)
        {
            summary.Total += balance;
            var (bucket, _) = ClassifyAgeing(dueDate, reportingDate);
            switch (bucket)
            {
                case "Current": summary.Current += balance; break;
                case "1-30": summary.Days1To30 += balance; summary.Overdue += balance; break;
                case "31-60": summary.Days31To60 += balance; summary.Overdue += balance; break;
                case "61-90": summary.Days61To90 += balance; summary.Overdue += balance; break;
                case "91-120": summary.Days91To120 += balance; summary.Overdue += balance; break;
                default: summary.Days120Plus += balance; summary.Overdue += balance; break;
            }
        }
        summary.OverduePercent = summary.Total > 0 ? (double)(summary.Overdue / summary.Total * 100) : 0;
        return summary;
    }

    // ---------------------------------------------------------------
    // INCOMING / OUTGOING PAYMENTS (ORCT / OVPM — Finance-specific field set)
    // ---------------------------------------------------------------
    public async Task<PagedResult<FinanceIncomingPaymentDto>> GetIncomingPaymentsAsync(LedgerQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string filterSql = @"
            WHERE (@Search IS NULL OR CAST(c.DocNum AS NVARCHAR(20)) LIKE @SearchLike OR c.CardCode LIKE @SearchLike OR cust.CardName LIKE @SearchLike OR c.Ref1 LIKE @SearchLike)
              AND (@DateFrom IS NULL OR c.DocDate >= @DateFrom)
              AND (@DateTo IS NULL OR c.DocDate <= @DateTo)
              AND (@BusinessPartner IS NULL OR c.CardCode = @BusinessPartner)";

        var p = new DynamicParameters();
        p.Add("Search", query.Search);
        p.Add("SearchLike", query.Search is null ? null : $"%{query.Search}%");
        p.Add("DateFrom", query.DateFrom);
        p.Add("DateTo", query.DateTo);
        p.Add("BusinessPartner", query.BusinessPartner);
        p.Add("Skip", query.Skip);
        p.Add("PageSize", query.PageSize);

        var countSql = $"SELECT COUNT(*) FROM ORCT c LEFT JOIN OCRD cust ON cust.CardCode = c.CardCode {filterSql}";
        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, p, cancellationToken: ct));

        var listSql = $@"
            SELECT c.DocEntry, c.DocNum, c.CardCode AS CustomerCode, cust.CardName AS CustomerName, c.DocDate AS PostingDate,
                   c.DocCurr AS Currency, c.DocTotal AS Amount, c.Ref1 AS Reference,
                   CASE WHEN c.CashSum > 0 THEN 1 ELSE 0 END AS HasCash,
                   CASE WHEN c.CheckSum > 0 THEN 1 ELSE 0 END AS HasCheck,
                   CASE WHEN c.TrsfrSum > 0 THEN 1 ELSE 0 END AS HasTransfer,
                   c.CashAcct, c.CheckAcct, c.TrsfrAcct,
                   (SELECT COUNT(*) FROM RCT2 p2 WHERE p2.DocEntry = c.DocEntry AND p2.InvoiceId IS NOT NULL AND p2.InvoiceId > 0) AS AppliedInvoiceCount
            FROM ORCT c
            LEFT JOIN OCRD cust ON cust.CardCode = c.CardCode
            {filterSql}
            ORDER BY c.DocDate DESC, c.DocEntry DESC
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var rows = (await db.QueryAsync(new CommandDefinition(listSql, p, cancellationToken: ct))).ToList();
        var items = rows.Select(r => new FinanceIncomingPaymentDto
        {
            DocEntry = r.DocEntry, DocNum = r.DocNum, CustomerCode = r.CustomerCode, CustomerName = r.CustomerName,
            PostingDate = r.PostingDate, Currency = r.Currency, Amount = r.Amount, Reference = r.Reference,
            PaymentMethod = DescribePaymentType((bool)(r.HasCash == 1), (bool)(r.HasCheck == 1), (bool)(r.HasTransfer == 1)),
            BankOrCash = (string?)r.TrsfrAcct ?? (string?)r.CheckAcct ?? (string?)r.CashAcct,
            AppliedInvoiceCount = (int)r.AppliedInvoiceCount
        }).ToList();

        return new PagedResult<FinanceIncomingPaymentDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }

    public async Task<FinanceIncomingPaymentDetailDto?> GetIncomingPaymentByEntryAsync(int docEntry, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string headerSql = @"
            SELECT c.DocEntry, c.DocNum, c.CardCode AS CustomerCode, cust.CardName AS CustomerName, c.DocDate AS PostingDate,
                   c.DocCurr AS Currency, c.DocTotal AS Amount, c.CashSum, c.CheckSum, c.TrsfrSum
            FROM ORCT c
            LEFT JOIN OCRD cust ON cust.CardCode = c.CardCode
            WHERE c.DocEntry = @DocEntry";
        var header = await db.QuerySingleOrDefaultAsync(new CommandDefinition(headerSql, new { DocEntry = docEntry }, cancellationToken: ct));
        if (header is null) return null;

        const string appliedSql = @"
            SELECT p.InvoiceId AS InvoiceDocEntry, i.DocNum AS InvoiceDocNum, p.SumApplied AS AmountApplied
            FROM RCT2 p LEFT JOIN OINV i ON i.DocEntry = p.InvoiceId
            WHERE p.DocEntry = @DocEntry AND p.InvoiceId IS NOT NULL AND p.InvoiceId > 0";
        var applied = (await db.QueryAsync<FinanceInvoiceApplicationDto>(new CommandDefinition(appliedSql, new { DocEntry = docEntry }, cancellationToken: ct))).ToList();

        return new FinanceIncomingPaymentDetailDto
        {
            DocEntry = header.DocEntry, DocNum = header.DocNum, CustomerCode = header.CustomerCode, CustomerName = header.CustomerName,
            PostingDate = header.PostingDate, Currency = header.Currency, Amount = header.Amount,
            CashAmount = header.CashSum, BankAmount = header.CheckSum, TransferAmount = header.TrsfrSum,
            AppliedInvoices = applied
        };
    }

    public async Task<PagedResult<FinanceOutgoingPaymentDto>> GetOutgoingPaymentsAsync(LedgerQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string filterSql = @"
            WHERE c.DocType = 'S'
              AND (@Search IS NULL OR CAST(c.DocNum AS NVARCHAR(20)) LIKE @SearchLike OR c.CardCode LIKE @SearchLike OR vend.CardName LIKE @SearchLike OR c.Ref1 LIKE @SearchLike)
              AND (@DateFrom IS NULL OR c.DocDate >= @DateFrom)
              AND (@DateTo IS NULL OR c.DocDate <= @DateTo)
              AND (@BusinessPartner IS NULL OR c.CardCode = @BusinessPartner)";

        var p = new DynamicParameters();
        p.Add("Search", query.Search);
        p.Add("SearchLike", query.Search is null ? null : $"%{query.Search}%");
        p.Add("DateFrom", query.DateFrom);
        p.Add("DateTo", query.DateTo);
        p.Add("BusinessPartner", query.BusinessPartner);
        p.Add("Skip", query.Skip);
        p.Add("PageSize", query.PageSize);

        var countSql = $"SELECT COUNT(*) FROM OVPM c LEFT JOIN OCRD vend ON vend.CardCode = c.CardCode {filterSql}";
        var total = await db.ExecuteScalarAsync<int>(new CommandDefinition(countSql, p, cancellationToken: ct));

        var listSql = $@"
            SELECT c.DocEntry, c.DocNum, c.CardCode AS VendorCode, vend.CardName AS VendorName, c.DocDate AS PostingDate,
                   c.DocCurr AS Currency, c.DocTotal AS Amount, c.Ref1 AS Reference,
                   CASE WHEN c.CashSum > 0 THEN 1 ELSE 0 END AS HasCash,
                   CASE WHEN c.CheckSum > 0 THEN 1 ELSE 0 END AS HasCheck,
                   CASE WHEN c.TrsfrSum > 0 THEN 1 ELSE 0 END AS HasTransfer,
                   c.CashAcct, c.CheckAcct, c.TrsfrAcct,
                   (SELECT COUNT(*) FROM VPM2 p2 WHERE p2.DocEntry = c.DocEntry AND p2.InvoiceId IS NOT NULL AND p2.InvoiceId > 0) AS AppliedInvoiceCount
            FROM OVPM c
            LEFT JOIN OCRD vend ON vend.CardCode = c.CardCode
            {filterSql}
            ORDER BY c.DocDate DESC, c.DocEntry DESC
            OFFSET @Skip ROWS FETCH NEXT @PageSize ROWS ONLY";

        var rows = (await db.QueryAsync(new CommandDefinition(listSql, p, cancellationToken: ct))).ToList();
        var items = rows.Select(r => new FinanceOutgoingPaymentDto
        {
            DocEntry = r.DocEntry, DocNum = r.DocNum, VendorCode = r.VendorCode, VendorName = r.VendorName,
            PostingDate = r.PostingDate, Currency = r.Currency, Amount = r.Amount, Reference = r.Reference,
            PaymentMethod = DescribePaymentType((bool)(r.HasCash == 1), (bool)(r.HasCheck == 1), (bool)(r.HasTransfer == 1)),
            BankOrCash = (string?)r.TrsfrAcct ?? (string?)r.CheckAcct ?? (string?)r.CashAcct,
            AppliedInvoiceCount = (int)r.AppliedInvoiceCount
        }).ToList();

        return new PagedResult<FinanceOutgoingPaymentDto> { Items = items, Page = query.Page, PageSize = query.PageSize, TotalCount = total };
    }

    public async Task<FinanceOutgoingPaymentDetailDto?> GetOutgoingPaymentByEntryAsync(int docEntry, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string headerSql = @"
            SELECT c.DocEntry, c.DocNum, c.CardCode AS VendorCode, vend.CardName AS VendorName, c.DocDate AS PostingDate,
                   c.DocCurr AS Currency, c.DocTotal AS Amount, c.CashSum, c.CheckSum, c.TrsfrSum
            FROM OVPM c
            LEFT JOIN OCRD vend ON vend.CardCode = c.CardCode
            WHERE c.DocEntry = @DocEntry AND c.DocType = 'S'";
        var header = await db.QuerySingleOrDefaultAsync(new CommandDefinition(headerSql, new { DocEntry = docEntry }, cancellationToken: ct));
        if (header is null) return null;

        const string appliedSql = @"
            SELECT p.InvoiceId AS InvoiceDocEntry, i.DocNum AS InvoiceDocNum, p.SumApplied AS AmountApplied
            FROM VPM2 p LEFT JOIN OPCH i ON i.DocEntry = p.InvoiceId
            WHERE p.DocEntry = @DocEntry AND p.InvoiceId IS NOT NULL AND p.InvoiceId > 0";
        var applied = (await db.QueryAsync<FinanceInvoiceApplicationDto>(new CommandDefinition(appliedSql, new { DocEntry = docEntry }, cancellationToken: ct))).ToList();

        return new FinanceOutgoingPaymentDetailDto
        {
            DocEntry = header.DocEntry, DocNum = header.DocNum, VendorCode = header.VendorCode, VendorName = header.VendorName,
            PostingDate = header.PostingDate, Currency = header.Currency, Amount = header.Amount,
            CashAmount = header.CashSum, BankAmount = header.CheckSum, TransferAmount = header.TrsfrSum,
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
    // BANK / CASH
    // ---------------------------------------------------------------
    private async Task<List<(AccountRow Account, string Kind)>> GetBankCashAccountsAsync(IDbConnection db, Dictionary<string, AccountRow> accounts, CancellationToken ct)
    {
        var result = new List<(AccountRow, string)>();
        foreach (var acct in accounts.Values)
        {
            var kind = ClassifyBankCash(acct, accounts);
            if (kind is not null) result.Add((acct, kind));
        }
        return await Task.FromResult(result);
    }

    public async Task<BankCashSummaryDto> GetBankCashAsync(CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var accounts = await LoadAccountsAsync(db, ct);
        var bankCash = await GetBankCashAccountsAsync(db, accounts, ct);

        var result = new BankCashSummaryDto();
        foreach (var (acct, kind) in bankCash.OrderBy(x => x.Item1.AcctCode))
        {
            var dto = new BankCashAccountDto
            {
                AcctCode = acct.AcctCode, AcctName = acct.AcctName, Kind = kind,
                Currency = acct.Currency == "##" ? null : acct.Currency,
                OpeningBalance = 0, Debit = 0, Credit = 0, ClosingBalance = acct.Balance
            };
            result.Accounts.Add(dto);
            if (kind == "Cash") result.CashBalance += acct.Balance; else result.BankBalance += acct.Balance;
        }
        return result;
    }

    // ---------------------------------------------------------------
    // TRIAL BALANCE
    // ---------------------------------------------------------------
    public async Task<TrialBalanceDto> GetTrialBalanceAsync(ReportPeriodQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        var dateFrom = query.DateFrom ?? new DateTime(DateTime.Today.Year, 1, 1);
        var dateTo = query.DateTo ?? DateTime.Today;

        const string sql = @"
            SELECT a.AcctCode, a.AcctName,
                   ISNULL(SUM(CASE WHEN o.RefDate < @DateFrom THEN l.Debit - l.Credit ELSE 0 END), 0) AS OpeningNet,
                   ISNULL(SUM(CASE WHEN o.RefDate >= @DateFrom AND o.RefDate <= @DateTo THEN l.Debit ELSE 0 END), 0) AS PeriodDebit,
                   ISNULL(SUM(CASE WHEN o.RefDate >= @DateFrom AND o.RefDate <= @DateTo THEN l.Credit ELSE 0 END), 0) AS PeriodCredit,
                   ISNULL(SUM(CASE WHEN o.RefDate <= @DateTo THEN l.Debit - l.Credit ELSE 0 END), 0) AS ClosingNet
            FROM OACT a
            INNER JOIN JDT1 l ON l.Account = a.AcctCode
            INNER JOIN OJDT o ON o.TransId = l.TransId
            WHERE a.Postable = 'Y'
              AND (@Account IS NULL OR a.AcctCode = @Account)
            GROUP BY a.AcctCode, a.AcctName
            HAVING SUM(CASE WHEN o.RefDate <= @DateTo THEN l.Debit - l.Credit ELSE 0 END) <> 0
                OR SUM(CASE WHEN o.RefDate >= @DateFrom AND o.RefDate <= @DateTo THEN l.Debit + l.Credit ELSE 0 END) <> 0
            ORDER BY a.AcctCode";

        var rows = (await db.QueryAsync(new CommandDefinition(sql, new { DateFrom = dateFrom, DateTo = dateTo, Account = query.Account }, cancellationToken: ct))).ToList();

        var result = new TrialBalanceDto { DateFrom = dateFrom, DateTo = dateTo };
        foreach (var r in rows)
        {
            decimal openingNet = r.OpeningNet, closingNet = r.ClosingNet;
            var row = new TrialBalanceRowDto
            {
                AcctCode = r.AcctCode, AcctName = r.AcctName,
                OpeningDebit = Math.Max(openingNet, 0), OpeningCredit = Math.Max(-openingNet, 0),
                PeriodDebit = r.PeriodDebit, PeriodCredit = r.PeriodCredit,
                ClosingDebit = Math.Max(closingNet, 0), ClosingCredit = Math.Max(-closingNet, 0)
            };
            result.Rows.Add(row);
            result.TotalOpeningDebit += row.OpeningDebit;
            result.TotalOpeningCredit += row.OpeningCredit;
            result.TotalPeriodDebit += row.PeriodDebit;
            result.TotalPeriodCredit += row.PeriodCredit;
            result.TotalClosingDebit += row.ClosingDebit;
            result.TotalClosingCredit += row.ClosingCredit;
        }
        result.IsBalanced = Math.Round(result.TotalClosingDebit - result.TotalClosingCredit, 2) == 0;
        return result;
    }

    // ---------------------------------------------------------------
    // PROFIT & LOSS
    // ---------------------------------------------------------------
    private async Task<(Dictionary<string, decimal> ByAccount, Dictionary<string, AccountRow> Accounts)> GetAccountActivityAsync(
        IDbConnection db, DateTime dateFrom, DateTime dateTo, CancellationToken ct)
    {
        var accounts = await LoadAccountsAsync(db, ct);
        const string sql = @"
            SELECT l.Account, SUM(l.Credit - l.Debit) AS NetCredit
            FROM JDT1 l
            INNER JOIN OJDT o ON o.TransId = l.TransId
            WHERE o.RefDate >= @DateFrom AND o.RefDate <= @DateTo
            GROUP BY l.Account";
        var rows = (await db.QueryAsync(new CommandDefinition(sql, new { DateFrom = dateFrom, DateTo = dateTo }, cancellationToken: ct))).ToList();
        var byAccount = rows.ToDictionary(r => (string)r.Account, r => (decimal)r.NetCredit, StringComparer.OrdinalIgnoreCase);
        return (byAccount, accounts);
    }

    public async Task<ProfitLossDto> GetProfitLossAsync(ReportPeriodQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var dateFrom = query.DateFrom ?? new DateTime(DateTime.Today.Year, 1, 1);
        var dateTo = query.DateTo ?? DateTime.Today;

        var (byAccount, accounts) = await GetAccountActivityAsync(db, dateFrom, dateTo, ct);

        var result = new ProfitLossDto { DateFrom = dateFrom, DateTo = dateTo };
        foreach (var (code, netCredit) in byAccount)
        {
            if (netCredit == 0 || !accounts.TryGetValue(code, out var acct)) continue;
            var bucket = ClassifyPLBucket(code, accounts);
            var line = new ProfitLossAccountDto { AcctCode = code, AcctName = acct.AcctName, Amount = Math.Abs(netCredit) };
            switch (bucket)
            {
                case "Revenue": result.Revenue.Add(line); result.TotalRevenue += netCredit; break;
                case "CostOfGoodsSold": result.CostOfGoodsSold.Add(line); result.TotalCostOfGoodsSold += -netCredit; break;
                case "OperatingExpenses": result.OperatingExpenses.Add(line); result.TotalOperatingExpenses += -netCredit; break;
                case "OtherIncome": result.OtherIncome.Add(line); result.TotalOtherIncome += netCredit; break;
            }
        }

        result.GrossProfit = result.TotalRevenue - result.TotalCostOfGoodsSold;
        result.GrossMarginPercent = result.TotalRevenue != 0 ? (double)(result.GrossProfit / result.TotalRevenue * 100) : 0;
        result.OperatingProfit = result.GrossProfit - result.TotalOperatingExpenses;
        result.NetProfit = result.OperatingProfit + result.TotalOtherIncome - result.TotalOtherExpenses;
        result.NetMarginPercent = result.TotalRevenue != 0 ? (double)(result.NetProfit / result.TotalRevenue * 100) : 0;

        result.Revenue = result.Revenue.OrderByDescending(x => x.Amount).ToList();
        result.CostOfGoodsSold = result.CostOfGoodsSold.OrderByDescending(x => x.Amount).ToList();
        result.OperatingExpenses = result.OperatingExpenses.OrderByDescending(x => x.Amount).ToList();
        result.OtherIncome = result.OtherIncome.OrderByDescending(x => x.Amount).ToList();

        return result;
    }

    // ---------------------------------------------------------------
    // BALANCE SHEET
    // ---------------------------------------------------------------
    public async Task<BalanceSheetDto> GetBalanceSheetAsync(DateTime? asOfDate, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var asOf = asOfDate ?? DateTime.Today;
        var accounts = await LoadAccountsAsync(db, ct);

        const string sql = @"
            SELECT l.Account, SUM(l.Debit - l.Credit) AS NetDebit
            FROM JDT1 l
            INNER JOIN OJDT o ON o.TransId = l.TransId
            WHERE o.RefDate <= @AsOf
            GROUP BY l.Account";
        var rows = (await db.QueryAsync(new CommandDefinition(sql, new { AsOf = asOf }, cancellationToken: ct))).ToList();
        var byAccount = rows.ToDictionary(r => (string)r.Account, r => (decimal)r.NetDebit, StringComparer.OrdinalIgnoreCase);

        var result = new BalanceSheetDto { AsOfDate = asOf };
        // All-time (through AsOf, no lower bound) net Revenue/Expense activity,
        // computed from the SAME byAccount totals as Assets/Liabilities/Equity
        // below — not a separate calendar-year-bounded query. This is what
        // guarantees Assets == Liabilities + Equity: the whole JDT1 ledger
        // nets to zero across every account, so folding every account's
        // balance into exactly one of Assets/Liabilities/Equity/this P&L
        // total makes the identity hold by construction, with or without
        // formal SAP B1 year-end closing entries ever having been posted.
        decimal plNet = 0;

        foreach (var (code, netDebit) in byAccount)
        {
            if (netDebit == 0 || !accounts.TryGetValue(code, out var acct)) continue;
            var top = ClassifyTopLevel(code, accounts);

            if (top is "Revenue" or "Expenses" or "Other")
            {
                // "Other" covers the unused #6-#10 root drawers this SAP B1
                // installation never renamed — folding them in too (instead of
                // silently dropping them) keeps the balance guarantee
                // unconditional even if a real account ever appears there.
                plNet += -netDebit;
                continue;
            }

            var nameLower = acct.AcctName.ToLowerInvariant();
            var chain = string.Join(" | ", GetAncestorChain(code, accounts)).ToLowerInvariant();
            var line = new BalanceSheetAccountDto { AcctCode = code, AcctName = acct.AcctName, Amount = netDebit };

            if (top == "Assets")
            {
                var kind = ClassifyBankCash(acct, accounts);
                if (kind == "Cash") { result.Cash.Add(line); result.TotalAssets += netDebit; }
                else if (kind == "Bank") { result.Bank.Add(line); result.TotalAssets += netDebit; }
                else if (chain.Contains("fixed asset") || chain.Contains("capital work in progress") || chain.Contains("(wip)") || chain.Contains("land") || chain.Contains("intangible"))
                {
                    result.NonCurrentAssets.Add(line); result.TotalAssets += netDebit;
                }
                else { result.OtherCurrentAssets.Add(line); result.TotalAssets += netDebit; }
            }
            else if (top == "Liabilities")
            {
                var amount = -netDebit; // liabilities are natural-credit; report as positive
                if (nameLower.Contains("tax") || nameLower.Contains("gst") || nameLower.Contains("tds"))
                {
                    result.TaxLiabilities += amount;
                    result.TotalLiabilities += amount;
                }
                else if (chain.Contains("loan"))
                {
                    result.NonCurrentLiabilities.Add(new BalanceSheetAccountDto { AcctCode = code, AcctName = acct.AcctName, Amount = amount });
                    result.TotalLiabilities += amount;
                }
                else
                {
                    result.OtherCurrentLiabilities.Add(new BalanceSheetAccountDto { AcctCode = code, AcctName = acct.AcctName, Amount = amount });
                    result.TotalLiabilities += amount;
                }
            }
            else if (top == "Equity")
            {
                var amount = -netDebit;
                if (nameLower.Contains("retain") || nameLower.Contains("profit & loss") || nameLower.Contains("accumulated"))
                {
                    result.RetainedEarnings += amount;
                }
                else
                {
                    result.Capital.Add(new BalanceSheetAccountDto { AcctCode = code, AcctName = acct.AcctName, Amount = amount });
                }
                result.TotalEquity += amount;
            }
        }

        // Accounts Receivable / Payable / Inventory are shown as informational
        // context from the actual open-invoice ledgers and perpetual stock
        // valuation (OINV/OPCH/OITW) — the same real figures used elsewhere in
        // this portal. They are deliberately NOT added into TotalAssets/
        // TotalLiabilities below: those systems are independent of this
        // company's G/L (OINV/OPCH are empty here — this company posts stock
        // and debtor/creditor balances via direct journal entries instead), so
        // adding them on top of the G/L-derived totals would double up or
        // introduce amounts with no offsetting entry, breaking the balance
        // identity the G/L walk above already satisfies by construction.
        const string arSql = "SELECT ISNULL(SUM(DocTotal - PaidToDate), 0) FROM OINV WHERE DocStatus = 'O'";
        const string apSql = "SELECT ISNULL(SUM(DocTotal - PaidToDate), 0) FROM OPCH WHERE DocStatus = 'O'";
        const string invSql = "SELECT ISNULL(SUM(OnHand * AvgPrice), 0) FROM OITW";
        result.AccountsReceivable = await db.ExecuteScalarAsync<decimal>(new CommandDefinition(arSql, cancellationToken: ct));
        result.AccountsPayable = await db.ExecuteScalarAsync<decimal>(new CommandDefinition(apSql, cancellationToken: ct));
        result.Inventory = await db.ExecuteScalarAsync<decimal>(new CommandDefinition(invSql, cancellationToken: ct));

        // See the plNet computation above — folding it into Equity here is what
        // guarantees Assets == Liabilities + Equity below, whether or not this
        // company has ever posted a formal year-end closing entry in SAP B1.
        result.CurrentYearResult = plNet;
        result.TotalEquity += plNet;

        result.TotalLiabilitiesAndEquity = result.TotalLiabilities + result.TotalEquity;
        result.IsBalanced = Math.Round(result.TotalAssets - result.TotalLiabilitiesAndEquity, 2) == 0;

        result.Cash = result.Cash.OrderByDescending(x => x.Amount).ToList();
        result.Bank = result.Bank.OrderByDescending(x => x.Amount).ToList();
        result.OtherCurrentAssets = result.OtherCurrentAssets.OrderByDescending(x => x.Amount).ToList();
        result.NonCurrentAssets = result.NonCurrentAssets.OrderByDescending(x => x.Amount).ToList();
        result.OtherCurrentLiabilities = result.OtherCurrentLiabilities.OrderByDescending(x => x.Amount).ToList();
        result.NonCurrentLiabilities = result.NonCurrentLiabilities.OrderByDescending(x => x.Amount).ToList();
        result.Capital = result.Capital.OrderByDescending(x => x.Amount).ToList();

        return result;
    }

    // ---------------------------------------------------------------
    // TAX / GST — derived from the same INV1/PCH1 tax fields already relied
    // on elsewhere in this codebase; OVTG (tax group master) is empty in
    // every configured company here, so code name/rate are only populated
    // when a real OVTG row matches.
    // ---------------------------------------------------------------
    public async Task<TaxSummaryDto> GetTaxAsync(ReportPeriodQuery query, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var dateFrom = query.DateFrom ?? new DateTime(DateTime.Today.Year, 1, 1);
        var dateTo = query.DateTo ?? DateTime.Today;

        const string salesSql = @"
            SELECT l.TaxCode, v.Name AS TaxCodeName, v.Rate AS TaxRate,
                   SUM(l.LineTotal) AS TaxableAmount, SUM(l.VatSum) AS TaxAmount
            FROM INV1 l
            INNER JOIN OINV o ON o.DocEntry = l.DocEntry
            LEFT JOIN OVTG v ON v.Code = l.TaxCode
            WHERE o.DocDate >= @DateFrom AND o.DocDate <= @DateTo AND l.TaxCode IS NOT NULL
            GROUP BY l.TaxCode, v.Name, v.Rate";
        var salesRows = (await db.QueryAsync<TaxByCodeDto>(new CommandDefinition(salesSql, new { DateFrom = dateFrom, DateTo = dateTo }, cancellationToken: ct))).ToList();

        const string purchaseSql = @"
            SELECT l.TaxCode, v.Name AS TaxCodeName, v.Rate AS TaxRate,
                   SUM(l.LineTotal) AS TaxableAmount, SUM(l.VatSum) AS TaxAmount
            FROM PCH1 l
            INNER JOIN OPCH o ON o.DocEntry = l.DocEntry
            LEFT JOIN OVTG v ON v.Code = l.TaxCode
            WHERE o.DocDate >= @DateFrom AND o.DocDate <= @DateTo AND l.TaxCode IS NOT NULL
            GROUP BY l.TaxCode, v.Name, v.Rate";
        var purchaseRows = (await db.QueryAsync<TaxByCodeDto>(new CommandDefinition(purchaseSql, new { DateFrom = dateFrom, DateTo = dateTo }, cancellationToken: ct))).ToList();

        const string byMonthSql = @"
            SELECT CONVERT(varchar(7), o.DocDate, 120) AS Period, SUM(l.VatSum) AS Amount, 'sales' AS Src
            FROM INV1 l INNER JOIN OINV o ON o.DocEntry = l.DocEntry
            WHERE o.DocDate >= DATEADD(MONTH, -11, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
            GROUP BY CONVERT(varchar(7), o.DocDate, 120)
            UNION ALL
            SELECT CONVERT(varchar(7), o.DocDate, 120) AS Period, SUM(l.VatSum) AS Amount, 'purchase' AS Src
            FROM PCH1 l INNER JOIN OPCH o ON o.DocEntry = l.DocEntry
            WHERE o.DocDate >= DATEADD(MONTH, -11, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
            GROUP BY CONVERT(varchar(7), o.DocDate, 120)";
        var byMonthRows = (await db.QueryAsync(new CommandDefinition(byMonthSql, cancellationToken: ct))).ToList();
        var byMonth = byMonthRows
            .GroupBy(r => (string)r.Period)
            .Select(g => new TaxByPeriodDto
            {
                Period = g.Key,
                OutputTax = g.Where(x => x.Src == "sales").Sum(x => (decimal)x.Amount),
                InputTax = g.Where(x => x.Src == "purchase").Sum(x => (decimal)x.Amount)
            })
            .OrderBy(x => x.Period)
            .ToList();

        var taxableSales = salesRows.Sum(r => r.TaxableAmount);
        var outputTax = salesRows.Sum(r => r.TaxAmount);
        var taxablePurchases = purchaseRows.Sum(r => r.TaxableAmount);
        var inputTax = purchaseRows.Sum(r => r.TaxAmount);

        return new TaxSummaryDto
        {
            DateFrom = dateFrom, DateTo = dateTo,
            TaxableSales = taxableSales, OutputTax = outputTax,
            TaxablePurchases = taxablePurchases, InputTax = inputTax,
            NetTax = outputTax - inputTax,
            SalesTaxByCode = salesRows, PurchaseTaxByCode = purchaseRows, TaxByMonth = byMonth
        };
    }

    // ---------------------------------------------------------------
    // DASHBOARD
    // ---------------------------------------------------------------
    public async Task<FinanceDashboardDto> GetDashboardAsync(CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT
                (SELECT ISNULL(SUM(DocTotal - PaidToDate), 0) FROM OINV WHERE DocStatus = 'O') AS Receivables,
                (SELECT ISNULL(SUM(DocTotal - PaidToDate), 0) FROM OPCH WHERE DocStatus = 'O') AS Payables,
                (SELECT ISNULL(SUM(DocTotal), 0) FROM OINV WHERE YEAR(DocDate) = YEAR(GETDATE()) AND MONTH(DocDate) = MONTH(GETDATE())) AS SalesThisMonth,
                (SELECT ISNULL(SUM(DocTotal), 0) FROM OPCH WHERE YEAR(DocDate) = YEAR(GETDATE()) AND MONTH(DocDate) = MONTH(GETDATE())) AS PurchasesThisMonth,
                (SELECT COUNT(*) FROM OJDT WHERE YEAR(RefDate) = YEAR(GETDATE()) AND MONTH(RefDate) = MONTH(GETDATE())) AS JournalEntriesThisMonth,
                (SELECT ISNULL(SUM(DocTotal), 0) FROM ORCT WHERE YEAR(DocDate) = YEAR(GETDATE()) AND MONTH(DocDate) = MONTH(GETDATE()) AND Canceled = 'N') AS IncomingPaymentsThisMonth,
                (SELECT ISNULL(SUM(DocTotal), 0) FROM OVPM WHERE DocType = 'S' AND YEAR(DocDate) = YEAR(GETDATE()) AND MONTH(DocDate) = MONTH(GETDATE()) AND Canceled = 'N') AS OutgoingPaymentsThisMonth,
                (SELECT ISNULL(SUM(l.VatSum), 0) FROM INV1 l INNER JOIN OINV o ON o.DocEntry = l.DocEntry WHERE YEAR(o.DocDate) = YEAR(GETDATE()) AND MONTH(o.DocDate) = MONTH(GETDATE())) AS OutputTaxThisMonth,
                (SELECT ISNULL(SUM(l.VatSum), 0) FROM PCH1 l INNER JOIN OPCH o ON o.DocEntry = l.DocEntry WHERE YEAR(o.DocDate) = YEAR(GETDATE()) AND MONTH(o.DocDate) = MONTH(GETDATE())) AS InputTaxThisMonth";

        var row = await db.QuerySingleAsync(new CommandDefinition(sql, cancellationToken: ct));

        var accounts = await LoadAccountsAsync(db, ct);
        var bankCash = await GetBankCashAccountsAsync(db, accounts, ct);
        decimal cashBalance = bankCash.Where(x => x.Item2 == "Cash").Sum(x => x.Item1.Balance);
        decimal bankBalance = bankCash.Where(x => x.Item2 == "Bank").Sum(x => x.Item1.Balance);

        var monthStart = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1);
        var pl = await GetProfitLossAsync(new ReportPeriodQuery { DateFrom = monthStart, DateTo = DateTime.Today }, ct);

        decimal receivables = row.Receivables;
        decimal payables = row.Payables;

        return new FinanceDashboardDto
        {
            TotalReceivables = receivables,
            TotalPayables = payables,
            CashBalance = cashBalance,
            BankBalance = bankBalance,
            OutstandingAr = receivables,
            OutstandingAp = payables,
            SalesThisMonth = row.SalesThisMonth,
            PurchasesThisMonth = row.PurchasesThisMonth,
            NetProfitThisMonth = pl.NetProfit,
            TaxPayable = (decimal)row.OutputTaxThisMonth - (decimal)row.InputTaxThisMonth,
            JournalEntriesThisMonth = row.JournalEntriesThisMonth,
            IncomingPaymentsThisMonth = row.IncomingPaymentsThisMonth,
            OutgoingPaymentsThisMonth = row.OutgoingPaymentsThisMonth
        };
    }

    // ---------------------------------------------------------------
    // ANALYTICS
    // ---------------------------------------------------------------
    public async Task<FinanceAnalyticsDto> GetAnalyticsAsync(CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var accounts = await LoadAccountsAsync(db, ct);

        const string revenueSql = @"
            SELECT CONVERT(varchar(7), DocDate, 120) AS Period, SUM(DocTotal) AS Value
            FROM OINV WHERE DocDate >= DATEADD(MONTH, -11, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
            GROUP BY CONVERT(varchar(7), DocDate, 120) ORDER BY Period";
        var revenueTrend = (await db.QueryAsync<FinanceByPeriodDto>(new CommandDefinition(revenueSql, cancellationToken: ct))).ToList();

        const string purchaseSql = @"
            SELECT CONVERT(varchar(7), DocDate, 120) AS Period, SUM(DocTotal) AS Value
            FROM OPCH WHERE DocDate >= DATEADD(MONTH, -11, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1))
            GROUP BY CONVERT(varchar(7), DocDate, 120) ORDER BY Period";
        var purchaseTrend = (await db.QueryAsync<FinanceByPeriodDto>(new CommandDefinition(purchaseSql, cancellationToken: ct))).ToList();

        const string receivablesTrendSql = @"
            SELECT CONVERT(varchar(7), DocDueDate, 120) AS Period, SUM(DocTotal - PaidToDate) AS Value
            FROM OINV WHERE DocStatus = 'O' AND DocDueDate IS NOT NULL
            GROUP BY CONVERT(varchar(7), DocDueDate, 120) ORDER BY Period";
        var receivablesTrend = (await db.QueryAsync<FinanceByPeriodDto>(new CommandDefinition(receivablesTrendSql, cancellationToken: ct))).ToList();

        const string payablesTrendSql = @"
            SELECT CONVERT(varchar(7), DocDueDate, 120) AS Period, SUM(DocTotal - PaidToDate) AS Value
            FROM OPCH WHERE DocStatus = 'O' AND DocDueDate IS NOT NULL
            GROUP BY CONVERT(varchar(7), DocDueDate, 120) ORDER BY Period";
        var payablesTrend = (await db.QueryAsync<FinanceByPeriodDto>(new CommandDefinition(payablesTrendSql, cancellationToken: ct))).ToList();

        const string cashFlowSql = @"
            SELECT Period, SUM(InAmt) - SUM(OutAmt) AS Value FROM (
                SELECT CONVERT(varchar(7), DocDate, 120) AS Period, DocTotal AS InAmt, 0 AS OutAmt FROM ORCT WHERE Canceled = 'N'
                UNION ALL
                SELECT CONVERT(varchar(7), DocDate, 120) AS Period, 0 AS InAmt, DocTotal AS OutAmt FROM OVPM WHERE DocType = 'S' AND Canceled = 'N'
            ) x
            WHERE Period >= CONVERT(varchar(7), DATEADD(MONTH, -11, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)), 120)
            GROUP BY Period ORDER BY Period";
        var cashFlow = (await db.QueryAsync<FinanceByPeriodDto>(new CommandDefinition(cashFlowSql, cancellationToken: ct))).ToList();

        const string taxTrendSql = @"
            SELECT Period, SUM(Val) AS Value FROM (
                SELECT CONVERT(varchar(7), o.DocDate, 120) AS Period, l.VatSum AS Val FROM INV1 l INNER JOIN OINV o ON o.DocEntry = l.DocEntry
                UNION ALL
                SELECT CONVERT(varchar(7), o.DocDate, 120) AS Period, l.VatSum AS Val FROM PCH1 l INNER JOIN OPCH o ON o.DocEntry = l.DocEntry
            ) x
            WHERE Period >= CONVERT(varchar(7), DATEADD(MONTH, -11, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)), 120)
            GROUP BY Period ORDER BY Period";
        var taxTrend = (await db.QueryAsync<FinanceByPeriodDto>(new CommandDefinition(taxTrendSql, cancellationToken: ct))).ToList();

        const string topCustomersSql = @"
            SELECT TOP 10 c.CardCode AS Code, cust.CardName AS Name, SUM(c.DocTotal) AS Value
            FROM OINV c LEFT JOIN OCRD cust ON cust.CardCode = c.CardCode
            GROUP BY c.CardCode, cust.CardName ORDER BY SUM(c.DocTotal) DESC";
        var topCustomers = (await db.QueryAsync<FinanceByPartnerDto>(new CommandDefinition(topCustomersSql, cancellationToken: ct))).ToList();

        const string topVendorsSql = @"
            SELECT TOP 10 c.CardCode AS Code, vend.CardName AS Name, SUM(c.DocTotal) AS Value
            FROM OPCH c LEFT JOIN OCRD vend ON vend.CardCode = c.CardCode
            GROUP BY c.CardCode, vend.CardName ORDER BY SUM(c.DocTotal) DESC";
        var topVendors = (await db.QueryAsync<FinanceByPartnerDto>(new CommandDefinition(topVendorsSql, cancellationToken: ct))).ToList();

        // Gross Profit / Net Profit / Expense trends and Top Expense Accounts
        // need the account hierarchy, so they're computed per-month in code
        // rather than in one SQL aggregate.
        var grossProfitTrend = new List<FinanceByPeriodDto>();
        var netProfitTrend = new List<FinanceByPeriodDto>();
        var expenseTrend = new List<FinanceByPeriodDto>();
        var expenseByAccount = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);

        var monthCursor = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1).AddMonths(-11);
        for (var i = 0; i < 12; i++)
        {
            var monthStart = monthCursor.AddMonths(i);
            var monthEnd = monthStart.AddMonths(1).AddDays(-1);
            var (byAccount, _) = await GetAccountActivityAsync(db, monthStart, monthEnd, ct);

            decimal revenue = 0, cogs = 0, opex = 0, otherIncome = 0;
            foreach (var (code, netCredit) in byAccount)
            {
                if (netCredit == 0 || !accounts.ContainsKey(code)) continue;
                var bucket = ClassifyPLBucket(code, accounts);
                switch (bucket)
                {
                    case "Revenue": revenue += netCredit; break;
                    case "CostOfGoodsSold": cogs += -netCredit; break;
                    case "OperatingExpenses":
                        opex += -netCredit;
                        if (-netCredit > 0) expenseByAccount[code] = expenseByAccount.GetValueOrDefault(code) + -netCredit;
                        break;
                    case "OtherIncome": otherIncome += netCredit; break;
                }
            }

            var period = monthStart.ToString("yyyy-MM");
            var gross = revenue - cogs;
            grossProfitTrend.Add(new FinanceByPeriodDto { Period = period, Value = gross });
            netProfitTrend.Add(new FinanceByPeriodDto { Period = period, Value = gross - opex + otherIncome });
            expenseTrend.Add(new FinanceByPeriodDto { Period = period, Value = opex + cogs });
        }

        var topExpenseAccounts = expenseByAccount
            .OrderByDescending(kv => kv.Value)
            .Take(10)
            .Select(kv => new FinanceByAccountDto { AcctCode = kv.Key, AcctName = accounts.TryGetValue(kv.Key, out var a) ? a.AcctName : kv.Key, Value = kv.Value })
            .ToList();

        return new FinanceAnalyticsDto
        {
            RevenueTrend = revenueTrend,
            PurchaseTrend = purchaseTrend,
            GrossProfitTrend = grossProfitTrend,
            NetProfitTrend = netProfitTrend,
            ReceivablesTrend = receivablesTrend,
            PayablesTrend = payablesTrend,
            CashFlow = cashFlow,
            ExpenseTrend = expenseTrend,
            TaxTrend = taxTrend,
            TopCustomersByRevenue = topCustomers,
            TopVendorsByPurchase = topVendors,
            TopExpenseAccounts = topExpenseAccounts
        };
    }
}
