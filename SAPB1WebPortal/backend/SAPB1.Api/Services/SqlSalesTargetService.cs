using System.Data;
using System.Text.RegularExpressions;
using Dapper;
using Microsoft.Data.SqlClient;
using SAPB1.Api.DTOs.Sales;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Services;

/// <summary>
/// Salesperson targets, optionally item-wise. Plans are stored in the portal database (dbo.SalespersonTargets header +
/// dbo.SalespersonTargetLines rows), never in SAP; salespersons, items, units and actual sales are read from the
/// company's SAP B1 database, so nothing is hardcoded or copied. All SQL is parameterised; the company always comes from
/// ICompanyContext (the JWT), never from the request.
///
/// Workflow: Draft -> Submitted -> Approved | Rejected. Only Draft/Rejected targets are editable; an Approved target is
/// changed only by "Revise", which creates a new Draft (lines copied); the approved target stays live until that revision
/// is approved, at which point the old one becomes Superseded. State changes are guarded in SQL (UPDATE ... WHERE Status =
/// expected) so double clicks and concurrent users cannot apply a transition twice. Header + lines are always written in
/// ONE transaction, so a failing line never leaves a half-saved target.
///
/// Rules: an item may not be assigned to the same salesperson twice for overlapping dates (and overlapping units, where
/// "all units" overlaps everything) across live targets. For item-wise targets the header amount is the sum of the line
/// amounts.
///
/// Actual sales = SalesAmount.NetOfCreditNotesRows (A/R invoice lines minus A/R credit-memo lines, header discount deducted,
/// no freight/rounding, excl. tax unless IncludeTax) — the same rule as the Sales Overview "Net of credit notes" basis.
/// Attribution: the salesperson on the invoice / credit-memo header (OINV.SlpCode / ORIN.SlpCode); unit = the line's
/// location; UnitCode -1 = all units. Item-wise targets compare only the sales of their own items.
/// </summary>
public class SqlSalesTargetService : ISalesTargetService
{
    private const int AllUnits = -1;
    private const int MaxLines = 200;
    private static readonly string[] Scopes = { "Company", "Unit", "Salesperson" };
    private static string ScopeOf(string? scope) => Scopes.FirstOrDefault(x => x.Equals(scope?.Trim(), StringComparison.OrdinalIgnoreCase)) ?? "Salesperson";

    // The Scope column is added by db/007 (applied at start-up when the login may alter tables). Until it exists the service behaves exactly as
    // before for salesperson targets and refuses Company/Unit targets with a clear message instead of failing on a missing column.
    private static bool _scopeColumn;
    private async Task<bool> HasScopeColumnAsync(CancellationToken ct)
    {
        if (_scopeColumn) return true;
        using var db = _portal.CreateConnection();
        _scopeColumn = await db.ExecuteScalarAsync<int>(new CommandDefinition("SELECT CASE WHEN COL_LENGTH('dbo.SalespersonTargets', 'Scope') IS NULL THEN 0 ELSE 1 END", cancellationToken: ct)) == 1;
        return _scopeColumn;
    }
    private const string ScopeMissing = "Company and unit targets need the targets database upgrade: run db/007_AddTargetScope.sql once (or restart the API with a login that may alter tables).";
    private static readonly Regex FyPattern = new(@"^(\d{4})-(\d{2})$", RegexOptions.Compiled);
    private static readonly string[] PeriodTypes = { "Monthly", "Quarterly", "Annual", "Custom" };
    private static readonly string[] Statuses = { "Draft", "Submitted", "Approved", "Rejected", "Superseded" };

    private readonly IPortalConnectionFactory _portal;
    private readonly ICompanyConnectionFactory _sap;
    private readonly ICompanyContext _company;
    private readonly IConfiguration _config;
    private readonly ISalesScope _scope;

    public SqlSalesTargetService(IPortalConnectionFactory portal, ICompanyConnectionFactory sap, ICompanyContext company, IConfiguration config, ISalesScope scope)
    {
        _portal = portal;
        _sap = sap;
        _company = company;
        _config = config;
        _scope = scope;
    }

    // ------------------------------------------------------------------
    // SAP lookups
    // ------------------------------------------------------------------
    public async Task<SalesTargetOptionsDto> GetOptionsAsync(CancellationToken ct = default)
    {
        using var db = _sap.CreateConnection();
        var dto = new SalesTargetOptionsDto();
        // OSLP.SlpCode -1 is SAP's built-in "no sales employee"; Active is 'Y'/'N'.
        dto.Salespersons = (await db.QueryAsync<SalespersonOptionDto>(new CommandDefinition(
            "SELECT SlpCode AS Code, SlpName AS Name, CASE WHEN Active = 'Y' THEN 1 ELSE 0 END AS Active FROM OSLP WHERE SlpCode > 0" + SalesScopeSql.CustomerPredicate(_scope.Current) + " ORDER BY SlpName",
            cancellationToken: ct))).ToList();
        dto.Units = (await db.QueryAsync<TurnoverOptionDto>(new CommandDefinition(
            "SELECT Code, Location AS Name FROM OLCT ORDER BY Location", cancellationToken: ct))).ToList();

        var labels = UnitLabels();
        foreach (var u in dto.Units) u.Label = labels.GetValueOrDefault(Norm(u.Name));

        var fyStart = FyStartYear(DateTime.Today);
        dto.FinancialYears = Enumerable.Range(fyStart - 2, 5).Select(FyLabel).ToList();
        return dto;
    }

    /// <summary>Server-side, paged item search over the SAP Item Master: sellable (or all items when includeNonSales), never frozen. Code prefix matches rank first.</summary>
    public async Task<List<SalesTargetItemOptionDto>> SearchItemsAsync(string? search, int limit, int offset, bool includeNonSales, CancellationToken ct = default)
    {
        var term = string.IsNullOrWhiteSpace(search) ? null : search.Trim();
        if (term is { Length: > 100 }) term = term[..100];
        // Escape LIKE wildcards so user input is matched literally.
        var escaped = term is null ? null : Regex.Replace(term, @"[\[%_]", "[$0]");

        using var db = _sap.CreateConnection();
        var aroma = ItemUdf.Aroma(await ItemUdf.HasAromaAsync(db, ct));
        return (await db.QueryAsync<SalesTargetItemOptionDto>(new CommandDefinition($@"
            SELECT i.ItemCode AS Code, {aroma} AS AromaCode, i.ItemName AS Name, g.ItmsGrpNam AS [Group], i.InvntryUom AS Uom
            FROM OITM i LEFT JOIN OITB g ON g.ItmsGrpCod = i.ItmsGrpCod
            WHERE i.frozenFor = 'N' AND (@All = 1 OR i.SellItem = 'Y')
              AND (@Like IS NULL OR i.ItemCode LIKE @Like OR i.ItemName LIKE @Like OR {aroma} LIKE @Like)
            ORDER BY CASE WHEN i.ItemCode = @Term THEN 0 WHEN i.ItemCode LIKE @Prefix THEN 1 ELSE 2 END, i.ItemCode
            OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY", new
        {
            Limit = Math.Clamp(limit, 1, 100),
            Offset = Math.Max(0, offset),
            All = includeNonSales ? 1 : 0,
            Term = term,
            Like = escaped is null ? null : $"%{escaped}%",
            Prefix = escaped is null ? null : $"{escaped}%"
        }, cancellationToken: ct))).ToList();
    }

    private Dictionary<string, string> UnitLabels() =>
        (_config.GetSection($"SalesTurnover:UnitLabels:{_company.CompanyCode}").Get<Dictionary<string, string>>() ?? new())
            .GroupBy(kv => Norm(kv.Key)).ToDictionary(g => g.Key, g => g.First().Value);

    private static string Norm(string? v) => new string((v ?? "").Where(c => !char.IsWhiteSpace(c)).ToArray()).ToLowerInvariant();
    private static int FyStartYear(DateTime d) => d.Month >= 4 ? d.Year : d.Year - 1;
    private static string FyLabel(int startYear) => $"{startYear}-{(startYear + 1) % 100:00}";

    private async Task<(string Name, bool Active)?> FindSalespersonAsync(int code, CancellationToken ct)
    {
        using var db = _sap.CreateConnection();
        var row = await db.QuerySingleOrDefaultAsync<(string Name, string Active)?>(new CommandDefinition(
            "SELECT SlpName, Active FROM OSLP WHERE SlpCode = @Code AND SlpCode > 0", new { Code = code }, cancellationToken: ct));
        return row is null ? null : (row.Value.Name, row.Value.Active == "Y");
    }

    private async Task<string?> FindUnitNameAsync(int code, CancellationToken ct)
    {
        using var db = _sap.CreateConnection();
        return await db.QuerySingleOrDefaultAsync<string?>(new CommandDefinition(
            "SELECT Location FROM OLCT WHERE Code = @Code", new { Code = code }, cancellationToken: ct));
    }

    private class SapItem { public string ItemCode { get; set; } = ""; public string? ItemName { get; set; } public string? ItemGroup { get; set; } public string? Uom { get; set; } public string? FrozenFor { get; set; } }

    /// <summary>Reads each line's item from SAP (the client never supplies name/group/UOM). Returns an error message or null.</summary>
    private async Task<(string? Error, List<(SaveSalesTargetLineRequest Line, SapItem Item)> Rows)> ResolveItemsAsync(
        List<SaveSalesTargetLineRequest> lines, ISet<string> alreadyOnTarget, CancellationToken ct)
    {
        var codes = lines.Select(l => l.ItemCode.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        using var db = _sap.CreateConnection();
        var items = (await db.QueryAsync<SapItem>(new CommandDefinition(@"
            SELECT i.ItemCode, i.ItemName, g.ItmsGrpNam AS ItemGroup, i.InvntryUom AS Uom, i.frozenFor AS FrozenFor
            FROM OITM i LEFT JOIN OITB g ON g.ItmsGrpCod = i.ItmsGrpCod WHERE i.ItemCode IN @Codes", new { Codes = codes }, cancellationToken: ct)))
            .ToDictionary(i => i.ItemCode, StringComparer.OrdinalIgnoreCase);

        var rows = new List<(SaveSalesTargetLineRequest, SapItem)>();
        foreach (var l in lines)
        {
            if (!items.TryGetValue(l.ItemCode.Trim(), out var item)) return ($"Item '{l.ItemCode.Trim()}' does not exist in SAP.", rows);
            if (item.FrozenFor == "Y" && !alreadyOnTarget.Contains(item.ItemCode)) return ($"Item '{item.ItemCode}' is frozen in SAP and can't be added to a target.", rows);
            rows.Add((l, item));
        }
        return (null, rows);
    }

    // ------------------------------------------------------------------
    // Validation / period maths
    // ------------------------------------------------------------------
    /// <summary>Validates the request and derives the period dates + financial year. Returns an error message or null.</summary>
    private static string? ValidateShape(SaveSalesTargetRequest r, out DateTime start, out DateTime end, out string fy)
    {
        start = end = default;
        fy = r.FinancialYear ?? "";
        if (!PeriodTypes.Contains(r.PeriodType)) return "Period type must be Monthly, Quarterly, Annual or Custom.";

        if (r.PeriodType == "Custom")
        {
            if (r.FromDate is null || r.ToDate is null) return "Select both From Date and To Date.";
            start = r.FromDate.Value.Date; end = r.ToDate.Value.Date;
            if (start > end) return "From Date must be on or before To Date.";
            if (start.Year < 2000 || end.Year > 2100) return "Dates are out of range.";
            if ((end - start).TotalDays > 1100) return "A target period can't be longer than about 3 years.";
            fy = FyLabel(FyStartYear(start));
        }
        else
        {
            var m = FyPattern.Match(fy);
            if (!m.Success) return "Financial year must look like 2026-27.";
            var y1 = int.Parse(m.Groups[1].Value);
            if (int.Parse(m.Groups[2].Value) != (y1 + 1) % 100 || y1 < 2000 || y1 > 2100) return "Financial year must be consecutive, e.g. 2026-27.";
            var (count, step) = r.PeriodType switch { "Monthly" => (12, 1), "Quarterly" => (4, 3), _ => (1, 12) };
            if (r.PeriodIndex < 1 || r.PeriodIndex > count) return $"Period must be between 1 and {count} for a {r.PeriodType.ToLowerInvariant()} target.";
            start = new DateTime(y1, 4, 1).AddMonths((r.PeriodIndex - 1) * step);
            end = start.AddMonths(step).AddDays(-1);
        }

        var scope = ScopeOf(r.Scope);
        if (!string.IsNullOrWhiteSpace(r.Scope) && !Scopes.Any(x => x.Equals(r.Scope.Trim(), StringComparison.OrdinalIgnoreCase))) return "Scope must be Company, Unit or Salesperson.";
        if (scope == "Salesperson" && r.SapSlpCode <= 0) return "Select a salesperson.";
        if (scope == "Unit" && r.UnitCode < 0) return "Select a unit.";
        if (scope != "Salesperson" && r.Lines is { Count: > 0 }) return "Item rows are only available on salesperson targets.";
        if (r.UnitCode != AllUnits && r.UnitCode < 0) return "Select a valid unit.";
        if (!string.IsNullOrWhiteSpace(r.CurrencyCode) && !r.CurrencyCode.Equals("INR", StringComparison.OrdinalIgnoreCase)) return "Only INR targets are supported.";
        if (r.Remarks is { Length: > 500 }) return "Remarks are limited to 500 characters.";

        if (r.Lines is { Count: > 0 })
        {
            if (r.Lines.Count > MaxLines) return $"A target can have at most {MaxLines} item rows.";
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var n = 0;
            foreach (var l in r.Lines)
            {
                n++;
                if (string.IsNullOrWhiteSpace(l.ItemCode) || l.ItemCode.Trim().Length > 50) return $"Row {n}: select an item.";
                if (!seen.Add(l.ItemCode.Trim())) return $"Row {n}: item '{l.ItemCode.Trim()}' appears more than once.";
                if (l.TargetQuantity < 0 || l.TargetAmount < 0) return $"Row {n}: quantity and amount can't be negative.";
                if (l.TargetQuantity == 0 && l.TargetAmount == 0) return $"Row {n}: enter a target quantity or amount.";
                if (l.TargetAmount != decimal.Truncate(l.TargetAmount)) return $"Row {n}: the amount must be a whole number of rupees.";
                if (l.TargetAmount > 99_999_999_999_999m || l.TargetQuantity > 999_999_999_999m) return $"Row {n}: the value is too large.";
                if (l.Remarks is { Length: > 300 }) return $"Row {n}: remarks are limited to 300 characters.";
            }
        }
        else
        {
            if (r.TargetAmount <= 0) return "Target amount must be greater than zero.";
            if (r.TargetAmount != decimal.Truncate(r.TargetAmount)) return "Target amount must be a whole number of rupees.";
            if (r.TargetAmount > 99_999_999_999_999m) return "Target amount is too large.";
        }
        return null;
    }

    private static bool IsDuplicate(SqlException ex) => ex.Number is 2601 or 2627;

    /// <summary>An item may not be assigned to the same salesperson twice for overlapping dates and units across live targets.</summary>
    private async Task<string?> FindItemOverlapAsync(IDbConnection db, IDbTransaction tx, int? selfId, int? revisionOfId, SaveSalesTargetRequest r,
        DateTime start, DateTime end, IEnumerable<string> itemCodes, CancellationToken ct)
    {
        var hit = await db.QueryFirstOrDefaultAsync<(int Id, string ItemCode)?>(new CommandDefinition(@"
            SELECT TOP 1 t.Id, l.ItemCode
            FROM dbo.SalespersonTargets t JOIN dbo.SalespersonTargetLines l ON l.TargetId = t.Id
            WHERE t.CompanyCode = @Company AND t.SapSlpCode = @Slp AND t.Status IN ('Draft','Submitted','Approved')
              AND (@Self IS NULL OR t.Id <> @Self) AND (@Rev IS NULL OR t.Id <> @Rev)
              AND (t.UnitCode = @Unit OR t.UnitCode = -1 OR @Unit = -1)
              AND t.PeriodStartDate <= @End AND t.PeriodEndDate >= @Start
              AND l.ItemCode IN @Codes
            ORDER BY t.Id", new
        {
            Company = _company.CompanyCode, Slp = r.SapSlpCode, Self = selfId, Rev = revisionOfId, Unit = r.UnitCode,
            Start = start, End = end, Codes = itemCodes.ToArray()
        }, transaction: tx, cancellationToken: ct));
        return hit is null ? null : $"Item '{hit.Value.ItemCode}' is already assigned to this salesperson in target #{hit.Value.Id} for overlapping dates and units.";
    }

    // ------------------------------------------------------------------
    // Reads
    // ------------------------------------------------------------------
    private string TargetColumns => (_scopeColumn ? "t.Scope, " : "'Salesperson' AS Scope, ") + @"
        t.Id, t.SapSlpCode, t.SalespersonName, t.UnitCode, t.UnitName, t.FinancialYear, t.TargetPeriodType AS PeriodType,
        t.PeriodStartDate AS PeriodStart, t.PeriodEndDate AS PeriodEnd, t.TargetAmount, t.CurrencyCode, t.HasItems, t.Remarks, t.Status,
        t.RevisionOfId, t.ReviewRemarks, t.CreatedBy, t.CreatedAt, t.UpdatedBy, t.UpdatedAt, t.SubmittedBy, t.SubmittedAt,
        t.ReviewedBy, t.ReviewedAt, t.ApprovedBy, t.ApprovedAt,
        (SELECT COUNT(*) FROM dbo.SalespersonTargetLines x WHERE x.TargetId = t.Id) AS ItemCount,
        (SELECT ISNULL(SUM(x.TargetQuantity), 0) FROM dbo.SalespersonTargetLines x WHERE x.TargetId = t.Id) AS TotalTargetQuantity";

    public async Task<SalesTargetListDto> ListAsync(SalesTargetQuery q, CancellationToken ct = default)
    {
        var status = Statuses.FirstOrDefault(s => s.Equals(q.Status, StringComparison.OrdinalIgnoreCase));
        var periodType = PeriodTypes.FirstOrDefault(s => s.Equals(q.PeriodType, StringComparison.OrdinalIgnoreCase));
        var scopeFilter = ScopeOf(q.Scope);
        var hasScope = await HasScopeColumnAsync(ct);
        if (!hasScope && scopeFilter != "Salesperson") return new SalesTargetListDto { IncludeTax = q.IncludeTax };
        var search = string.IsNullOrWhiteSpace(q.Search) ? null : q.Search.Trim();
        var item = string.IsNullOrWhiteSpace(q.Item) ? null : q.Item.Trim();

        // Target lines keep only the item code and name, so an Aroma Code search is resolved to item codes in SAP first (empty = no match).
        var aromaItems = new[] { "" };
        if (search is not null)
        {
            using var sap = _sap.CreateConnection();
            if (await ItemUdf.HasAromaAsync(sap, ct))
            {
                var found = (await sap.QueryAsync<string>(new CommandDefinition("SELECT TOP 500 ItemCode FROM OITM WHERE U_AromaCode LIKE @Like", new { Like = $"%{search}%" }, cancellationToken: ct))).ToArray();
                if (found.Length > 0) aromaItems = found;
            }
        }

        var (hasSlps, slpList) = SalesScopeSql.Resolve(_scope.Current);
        List<SalesTargetDto> all;
        using (var db = _portal.CreateConnection())
        {
            // Status is applied afterwards so the "pending approval" card reflects the other filters only.
            all = (await db.QueryAsync<SalesTargetDto>(new CommandDefinition($@"
                SELECT TOP 5000 {TargetColumns}
                FROM dbo.SalespersonTargets t
                WHERE t.CompanyCode = @Company{(hasScope ? " AND t.Scope = @Scope" : "")}
                  AND (@FY IS NULL OR t.FinancialYear = @FY)
                  AND (@PT IS NULL OR t.TargetPeriodType = @PT)
                  AND (@Unit IS NULL OR t.UnitCode = @Unit)
                  AND (@Slp IS NULL OR t.SapSlpCode = @Slp)
                  AND (@HasSlps = 0 OR t.SapSlpCode IN @Slps)
                  AND (@FromDate IS NULL OR t.PeriodEndDate >= @FromDate)
                  AND (@ToDate IS NULL OR t.PeriodStartDate <= @ToDate)
                  AND (@Item IS NULL OR EXISTS (SELECT 1 FROM dbo.SalespersonTargetLines x WHERE x.TargetId = t.Id AND x.ItemCode = @Item))
                  AND (@Search IS NULL OR t.SalespersonName LIKE @Like OR CAST(t.Id AS NVARCHAR(20)) = @Search OR CAST(t.SapSlpCode AS NVARCHAR(20)) = @Search
                       OR EXISTS (SELECT 1 FROM dbo.SalespersonTargetLines x WHERE x.TargetId = t.Id AND (x.ItemCode LIKE @Like OR x.ItemName LIKE @Like OR x.ItemCode IN @AromaItems)))
                ORDER BY t.PeriodStartDate DESC, t.SalespersonName, t.Id DESC", new
            {
                Company = _company.CompanyCode,
                Scope = scopeFilter,
                FY = string.IsNullOrWhiteSpace(q.FinancialYear) ? null : q.FinancialYear.Trim(),
                PT = periodType,
                Unit = q.Unit,
                Slp = q.Salesperson,
                FromDate = q.FromDate?.Date,
                ToDate = q.ToDate?.Date,
                Item = item,
                Search = search,
                AromaItems = aromaItems,
                HasSlps = hasSlps,
                Slps = slpList,
                Like = search is null ? null : $"%{search}%"
            }, cancellationToken: ct))).ToList();
        }

        FillUnitNames(all);
        await FillActualsAsync(all, q.IncludeTax, ct);

        // Superseded rows are history: hidden unless asked for.
        var visible = all.Where(t => status is null ? t.Status != "Superseded" : t.Status == status).ToList();
        var approved = all.Where(t => t.Status == "Approved").ToList();

        var result = new SalesTargetListDto { IncludeTax = q.IncludeTax, TotalCount = visible.Count };
        result.Summary.TotalTarget = approved.Sum(t => t.TargetAmount);
        result.Summary.TotalActual = approved.Sum(t => t.ActualSales);
        result.Summary.OverallAchievementPct = result.Summary.TotalTarget > 0
            ? Math.Round(result.Summary.TotalActual / result.Summary.TotalTarget * 100, 2) : null;
        result.Summary.SalespersonsWithTargets = approved.Select(t => t.SapSlpCode).Distinct().Count();
        result.Summary.PendingApproval = all.Count(t => t.Status == "Submitted");
        result.ByPerson = approved.GroupBy(t => t.SapSlpCode)
            .Select(g => new SalesTargetChartPointDto
            {
                SapSlpCode = g.Key, Salesperson = g.First().SalespersonName, Target = g.Sum(x => x.TargetAmount), Actual = g.Sum(x => x.ActualSales)
            })
            .OrderByDescending(p => p.Target).ToList();

        var page = Math.Max(1, q.Page);
        var size = Math.Clamp(q.PageSize, 1, 100);
        result.Rows = visible.Skip((page - 1) * size).Take(size).ToList();
        return result;
    }

    public async Task<SalesTargetDetailDto?> GetAsync(int id, bool includeTax, CancellationToken ct = default)
    {
        await HasScopeColumnAsync(ct);
        using var db = _portal.CreateConnection();
        var target = await db.QuerySingleOrDefaultAsync<SalesTargetDto>(new CommandDefinition(
            $"SELECT {TargetColumns} FROM dbo.SalespersonTargets t WHERE t.Id = @Id AND t.CompanyCode = @Company",
            new { Id = id, Company = _company.CompanyCode }, cancellationToken: ct));
        if (target is null) return null;
        if (_scope.Current.Restricted && !(target.Scope == "Salesperson" && _scope.Current.SlpCodes.Contains(target.SapSlpCode))) return null; // not theirs: same as not found

        var history = (await db.QueryAsync<SalesTargetAuditDto>(new CommandDefinition(
            "SELECT Id, Action, PerformedBy, PerformedAt, Detail FROM dbo.SalespersonTargetAudit WHERE TargetId = @Id AND CompanyCode = @Company ORDER BY PerformedAt, Id",
            new { Id = id, Company = _company.CompanyCode }, cancellationToken: ct))).ToList();

        var list = new List<SalesTargetDto> { target };
        FillUnitNames(list);
        var lines = await FillActualsAsync(list, includeTax, ct);
        return new SalesTargetDetailDto { Target = target, Lines = lines.GetValueOrDefault(id) ?? new(), History = history };
    }

    private void FillUnitNames(List<SalesTargetDto> rows)
    {
        foreach (var r in rows.Where(r => r.UnitCode == AllUnits)) r.UnitName = "All units";
        if (rows.All(r => r.UnitCode == AllUnits)) return;
        var labels = UnitLabels();
        foreach (var r in rows.Where(r => r.UnitCode != AllUnits))
            r.UnitName = labels.GetValueOrDefault(Norm(r.UnitName)) ?? r.UnitName; // stored name -> report label
    }

    // ------------------------------------------------------------------
    // Actual sales from SAP
    // ------------------------------------------------------------------
    private class DayAmount { public int SlpCode { get; set; } public int? LocCode { get; set; } public DateTime D { get; set; } public decimal Amt { get; set; } }
    private class DayItem { public int SlpCode { get; set; } public int? LocCode { get; set; } public string ItemCode { get; set; } = ""; public DateTime D { get; set; } public decimal Amt { get; set; } public decimal Qty { get; set; } }
    private class DayCount { public int SlpCode { get; set; } public int? LocCode { get; set; } public DateTime D { get; set; } public int N { get; set; } }

    private async Task<Dictionary<int, List<SalesTargetLineDto>>> LoadLinesAsync(IEnumerable<int> targetIds, CancellationToken ct)
    {
        var ids = targetIds.ToArray();
        if (ids.Length == 0) return new();
        using var db = _portal.CreateConnection();
        var rows = await db.QueryAsync<(int TargetId, int Id, string ItemCode, string? ItemName, string? ItemGroup, string? Uom, decimal TargetQuantity, decimal TargetAmount, string? Remarks)>(new CommandDefinition(@"
            SELECT TargetId, Id, ItemCode, ItemName, ItemGroup, Uom, TargetQuantity, TargetAmount, Remarks
            FROM dbo.SalespersonTargetLines WHERE TargetId IN @Ids ORDER BY TargetId, Id", new { Ids = ids }, cancellationToken: ct));
        return rows.GroupBy(r => r.TargetId).ToDictionary(g => g.Key, g => g.Select(r => new SalesTargetLineDto
        {
            Id = r.Id, ItemCode = r.ItemCode, ItemName = r.ItemName, ItemGroup = r.ItemGroup, Uom = r.Uom,
            TargetQuantity = r.TargetQuantity, TargetAmount = r.TargetAmount, Remarks = r.Remarks
        }).ToList());
    }

    /// <summary>Fills actuals on the headers (and returns each item-wise target's lines with their own actuals).</summary>
    private async Task<Dictionary<int, List<SalesTargetLineDto>>> FillActualsAsync(List<SalesTargetDto> rows, bool includeTax, CancellationToken ct)
    {
        if (rows.Count == 0) return new();
        var itemRows = rows.Where(r => r.HasItems).ToList();
        var plainRows = rows.Where(r => !r.HasItems).ToList();
        var lines = await LoadLinesAsync(itemRows.Select(r => r.Id), ct);

        var from = rows.Min(r => r.PeriodStart).Date;
        var to = rows.Max(r => r.PeriodEnd).Date;
        var p = new DynamicParameters();
        p.Add("From", from);
        p.Add("To", to);
        p.Add("Codes", rows.Select(r => r.SapSlpCode).Distinct().ToArray());

        using var db = _sap.CreateConnection();
        var cte = $"WITH alloc AS ({SalesAmount.NetOfCreditNotesRows(includeTax)})";

        // Whole-salesperson amounts, only needed for amount-only targets.
        var amounts = plainRows.Count == 0 ? new List<DayAmount>() : (await db.QueryAsync<DayAmount>(new CommandDefinition($@"
            {cte}
            SELECT a.SlpCode, a.LocCode, CAST(a.DocDate AS date) AS D, SUM(a.Amt) AS Amt
            FROM alloc a WHERE a.SlpCode IN @Codes
            GROUP BY a.SlpCode, a.LocCode, CAST(a.DocDate AS date)", p, cancellationToken: ct))).ToList();

        // Item-level amounts + quantities, only for the items that appear on item-wise targets.
        var itemActuals = new List<DayItem>();
        if (itemRows.Count > 0)
        {
            var ip = new DynamicParameters(p);
            ip.Add("Codes", itemRows.Select(r => r.SapSlpCode).Distinct().ToArray());
            ip.Add("Items", lines.Values.SelectMany(l => l).Select(l => l.ItemCode).Distinct(StringComparer.OrdinalIgnoreCase).ToArray());
            itemActuals = (await db.QueryAsync<DayItem>(new CommandDefinition($@"
                {cte}
                SELECT a.SlpCode, a.LocCode, a.ItemCode, CAST(a.DocDate AS date) AS D, SUM(a.Amt) AS Amt, SUM(a.Qty) AS Qty
                FROM alloc a WHERE a.SlpCode IN @Codes AND a.ItemCode IN @Items
                GROUP BY a.SlpCode, a.LocCode, a.ItemCode, CAST(a.DocDate AS date)", ip, cancellationToken: ct))).ToList();
        }

        // Company / unit targets compare ALL salespersons' sales (company: all units except the default-excluded locations, as on the dashboard).
        var allAmounts = new List<DayAmount>();
        var excluded = new HashSet<int>();
        if (plainRows.Any(r => r.Scope != "Salesperson"))
        {
            allAmounts = (await db.QueryAsync<DayAmount>(new CommandDefinition($@"
                {cte}
                SELECT 0 AS SlpCode, a.LocCode, CAST(a.DocDate AS date) AS D, SUM(a.Amt) AS Amt
                FROM alloc a GROUP BY a.LocCode, CAST(a.DocDate AS date)", p, cancellationToken: ct))).ToList();
            var excludedNames = (_config.GetSection($"SalesTurnover:DefaultExcludedLocations:{_company.CompanyCode}").Get<string[]>() ?? Array.Empty<string>()).Select(Norm).ToHashSet();
            var locs = await db.QueryAsync<(int Code, string Name)>(new CommandDefinition("SELECT Code, Location FROM OLCT", cancellationToken: ct));
            excluded = locs.Where(l => excludedNames.Contains(Norm(l.Name))).Select(l => l.Code).ToHashSet();
        }

        async Task<(List<DayCount> ByUnit, List<DayCount> Total)> CountsAsync(string header, string line)
        {
            var byUnit = (await db.QueryAsync<DayCount>(new CommandDefinition($@"
                SELECT h.SlpCode, l.LocCode, CAST(h.DocDate AS date) AS D, COUNT(DISTINCT h.DocEntry) AS N
                FROM {header} h JOIN {line} l ON l.DocEntry = h.DocEntry
                WHERE h.CANCELED = 'N' AND h.DocDate >= @From AND h.DocDate <= @To AND h.SlpCode IN @Codes
                GROUP BY h.SlpCode, l.LocCode, CAST(h.DocDate AS date)", p, cancellationToken: ct))).ToList();
            var total = (await db.QueryAsync<DayCount>(new CommandDefinition($@"
                SELECT h.SlpCode, CAST(h.DocDate AS date) AS D, COUNT(*) AS N
                FROM {header} h
                WHERE h.CANCELED = 'N' AND h.DocDate >= @From AND h.DocDate <= @To AND h.SlpCode IN @Codes
                GROUP BY h.SlpCode, CAST(h.DocDate AS date)", p, cancellationToken: ct))).ToList();
            return (byUnit, total);
        }
        var orders = await CountsAsync("ORDR", "RDR1");
        var invoices = await CountsAsync("OINV", "INV1");

        foreach (var r in rows)
        {
            bool InPeriod(DateTime d) => d >= r.PeriodStart.Date && d <= r.PeriodEnd.Date;
            bool InUnit(int? loc) => r.UnitCode == AllUnits || loc == r.UnitCode;

            if (r.Scope != "Salesperson")
            {
                r.ActualSales = Math.Round(allAmounts.Where(a => InPeriod(a.D)
                    && (r.UnitCode == AllUnits ? (a.LocCode is null || !excluded.Contains(a.LocCode.Value)) : a.LocCode == r.UnitCode)).Sum(a => a.Amt), 0);
                r.AchievementPct = r.TargetAmount > 0 ? Math.Round(r.ActualSales / r.TargetAmount * 100, 2) : null;
                r.RemainingTarget = Math.Max(r.TargetAmount - r.ActualSales, 0);
                r.Variance = r.ActualSales - r.TargetAmount;
                continue;
            }

            r.SalesOrders = r.UnitCode == AllUnits
                ? orders.Total.Where(c => c.SlpCode == r.SapSlpCode && InPeriod(c.D)).Sum(c => c.N)
                : orders.ByUnit.Where(c => c.SlpCode == r.SapSlpCode && c.LocCode == r.UnitCode && InPeriod(c.D)).Sum(c => c.N);
            r.ArInvoices = r.UnitCode == AllUnits
                ? invoices.Total.Where(c => c.SlpCode == r.SapSlpCode && InPeriod(c.D)).Sum(c => c.N)
                : invoices.ByUnit.Where(c => c.SlpCode == r.SapSlpCode && c.LocCode == r.UnitCode && InPeriod(c.D)).Sum(c => c.N);

            if (r.HasItems && lines.TryGetValue(r.Id, out var ls))
            {
                foreach (var l in ls)
                {
                    var hits = itemActuals.Where(a => a.SlpCode == r.SapSlpCode && string.Equals(a.ItemCode, l.ItemCode, StringComparison.OrdinalIgnoreCase)
                                                      && InPeriod(a.D) && InUnit(a.LocCode)).ToList();
                    l.ActualAmount = Math.Round(hits.Sum(a => a.Amt), 0);
                    l.ActualQuantity = Math.Round(hits.Sum(a => a.Qty), 3);
                    l.AchievementPct = l.TargetAmount > 0 ? Math.Round(l.ActualAmount / l.TargetAmount * 100, 2) : null;
                    l.QuantityAchievementPct = l.TargetQuantity > 0 ? Math.Round(l.ActualQuantity / l.TargetQuantity * 100, 2) : null;
                    l.RemainingAmount = Math.Max(l.TargetAmount - l.ActualAmount, 0);
                    l.RemainingQuantity = Math.Max(l.TargetQuantity - l.ActualQuantity, 0);
                }
                r.ActualSales = ls.Sum(l => l.ActualAmount);
                r.ActualQuantity = ls.Sum(l => l.ActualQuantity);
            }
            else
            {
                r.ActualSales = Math.Round(amounts.Where(a => a.SlpCode == r.SapSlpCode && InPeriod(a.D) && InUnit(a.LocCode)).Sum(a => a.Amt), 0);
            }

            // Achievement % = actual / target * 100 (no division when there is no target).
            r.AchievementPct = r.TargetAmount > 0 ? Math.Round(r.ActualSales / r.TargetAmount * 100, 2) : null;
            r.RemainingTarget = Math.Max(r.TargetAmount - r.ActualSales, 0);
            r.Variance = r.ActualSales - r.TargetAmount;
        }
        return lines;
    }

    // ------------------------------------------------------------------
    // Target-vs-actual by month / quarter / year (Target Management page and its chart)
    // ------------------------------------------------------------------
    private class MonthLoc { public DateTime M { get; set; } public int? LocCode { get; set; } public decimal Amt { get; set; } }
    private class ApprovedRow { public string PT { get; set; } = ""; public DateTime S { get; set; } public decimal Amt { get; set; } }

    public async Task<TargetPerformanceDto> GetPerformanceAsync(TargetPerformanceQuery q, CancellationToken ct = default)
    {
        var sc = _scope.Current;
        var scope = sc.Restricted ? "Salesperson" : ScopeOf(q.Scope);
        var m = FyPattern.Match(q.FinancialYear ?? "");
        var y1 = m.Success && int.Parse(m.Groups[2].Value) == (int.Parse(m.Groups[1].Value) + 1) % 100 ? int.Parse(m.Groups[1].Value) : FyStartYear(DateTime.Today);
        var start = new DateTime(y1, 4, 1);
        var end = start.AddYears(1).AddDays(-1);
        var unit = scope == "Company" ? AllUnits : (q.Unit ?? AllUnits);
        var slp = scope == "Salesperson" ? (q.Salesperson ?? 0) : 0;
        if (sc.Restricted) slp = sc.SlpCodes.Contains(slp) ? slp : (sc.SlpCodes.Length > 0 ? sc.SlpCodes[0] : 0);
        var dto = new TargetPerformanceDto { Scope = scope, FinancialYear = FyLabel(y1), IncludeTax = false };
        if (sc.Denied)
        {
            dto.EntityLabel = "Your login is not linked to a salesperson yet";
            dto.Note = "Ask an administrator to link your login to your SAP salesperson (Administration > Users).";
            return dto;
        }

        dto.EntityLabel = scope == "Company" ? "Company (all units)"
            : scope == "Unit" ? (unit == AllUnits ? "Select a unit" : (await FindUnitNameAsync(unit, ct) is string un ? UnitLabels().GetValueOrDefault(Norm(un)) ?? un : $"Unit {unit}"))
            : (slp == 0 ? "Select a salesperson" : (await FindSalespersonAsync(slp, ct))?.Name ?? $"Salesperson {slp}") + (unit == AllUnits ? " · all units" : "");

        var approved = new List<ApprovedRow>();
        var hasScope = await HasScopeColumnAsync(ct);
        if ((hasScope || scope == "Salesperson") && !(scope == "Unit" && unit == AllUnits) && !(scope == "Salesperson" && slp == 0))
        {
            using var pdb = _portal.CreateConnection();
            approved = (await pdb.QueryAsync<ApprovedRow>(new CommandDefinition($@"
                SELECT TargetPeriodType AS PT, PeriodStartDate AS S, TargetAmount AS Amt FROM dbo.SalespersonTargets
                WHERE CompanyCode = @Company AND Status = 'Approved' AND HasItems = 0 AND SapSlpCode = @Slp AND UnitCode = @Unit
                  AND PeriodStartDate >= @Start AND PeriodEndDate <= @End{(hasScope ? " AND Scope = @Scope" : "")}",
                new { Company = _company.CompanyCode, Slp = slp, Unit = unit, Start = start, End = end, Scope = scope }, cancellationToken: ct))).ToList();
        }

        var actuals = new List<MonthLoc>();
        var excluded = new HashSet<int>();
        using (var db = _sap.CreateConnection())
        {
            var p = new DynamicParameters();
            p.Add("From", start); p.Add("To", end); p.Add("Slp", slp);
            actuals = (await db.QueryAsync<MonthLoc>(new CommandDefinition($@"
                WITH alloc AS ({SalesAmount.NetOfCreditNotesRows(false)})
                SELECT DATEFROMPARTS(YEAR(a.DocDate), MONTH(a.DocDate), 1) AS M, a.LocCode, SUM(a.Amt) AS Amt
                FROM alloc a WHERE (@Slp = 0 OR a.SlpCode = @Slp)
                GROUP BY DATEFROMPARTS(YEAR(a.DocDate), MONTH(a.DocDate), 1), a.LocCode", p, cancellationToken: ct))).ToList();
            if (scope == "Company")
            {
                var excludedNames = (_config.GetSection($"SalesTurnover:DefaultExcludedLocations:{_company.CompanyCode}").Get<string[]>() ?? Array.Empty<string>()).Select(Norm).ToHashSet();
                var locs = await db.QueryAsync<(int Code, string Name)>(new CommandDefinition("SELECT Code, Location FROM OLCT", cancellationToken: ct));
                excluded = locs.Where(l => excludedNames.Contains(Norm(l.Name))).Select(l => l.Code).ToHashSet();
            }
        }
        decimal ActualIn(DateTime from, DateTime to) => actuals.Where(a => a.M >= from && a.M <= to
            && (scope == "Company" ? (a.LocCode is null || !excluded.Contains(a.LocCode.Value)) : unit == AllUnits || a.LocCode == unit)).Sum(a => a.Amt);

        PeriodPerformanceDto Build(string label, DateTime s, DateTime e, string periodType)
        {
            var row = new PeriodPerformanceDto { Label = label, Start = s, End = e, Actual = Math.Round(ActualIn(new DateTime(s.Year, s.Month, 1), e), 0) };
            var t = approved.Where(a => a.PT == periodType && a.S.Date == s.Date).Select(a => (decimal?)a.Amt).FirstOrDefault();
            if (t is > 0)
            {
                row.Target = t;
                row.AchievementPct = Math.Round(row.Actual / t.Value * 100, 2);
                row.Remaining = Math.Max(t.Value - row.Actual, 0);
                row.Variance = row.Actual - t.Value;
            }
            return row;
        }
        for (var i = 0; i < 12; i++) { var s = start.AddMonths(i); dto.Months.Add(Build(s.ToString("MMM yyyy"), s, s.AddMonths(1).AddDays(-1), "Monthly")); }
        for (var i = 0; i < 4; i++) { var s = start.AddMonths(i * 3); dto.Quarters.Add(Build($"Q{i + 1} (" + s.ToString("MMM") + "–" + s.AddMonths(2).ToString("MMM") + ")", s, s.AddMonths(3).AddDays(-1), "Quarterly")); }
        dto.Year = Build("FY " + dto.FinancialYear, start, end, "Annual");
        dto.Note = "Actual = A/R invoices less credit memos, excluding tax (the basis targets are set on). Each period is compared only with the approved target of that exact period type; a period without one shows \"Not configured\". Quarterly and annual targets are not spread over months.";
        return dto;
    }

    // ------------------------------------------------------------------
    // Writes (portal DB, transactional, audited)
    // ------------------------------------------------------------------
    private static async Task AuditAsync(IDbConnection db, IDbTransaction tx, int targetId, string company, string action, string user, string? detail, CancellationToken ct) =>
        await db.ExecuteAsync(new CommandDefinition(
            "INSERT INTO dbo.SalespersonTargetAudit (TargetId, CompanyCode, Action, PerformedBy, Detail) VALUES (@TargetId, @Company, @Action, @User, @Detail)",
            new { TargetId = targetId, Company = company, Action = action, User = user, Detail = detail }, transaction: tx, cancellationToken: ct));

    /// <summary>Company/Unit targets have no salesperson: the sentinel code 0 is stored and the unit is forced (all units / the chosen unit).</summary>
    private static void Normalize(SaveSalesTargetRequest r)
    {
        r.Scope = ScopeOf(r.Scope);
        if (r.Scope == "Company") { r.SapSlpCode = 0; r.UnitCode = AllUnits; }
        else if (r.Scope == "Unit") r.SapSlpCode = 0;
    }

    private async Task<(string Name, bool Active)> OwnerAsync(SaveSalesTargetRequest r, string? unitName, CancellationToken ct)
    {
        if (r.Scope == "Company") return ("Company (all units)", true);
        if (r.Scope == "Unit") return (unitName ?? $"Unit {r.UnitCode}", true);
        return (await FindSalespersonAsync(r.SapSlpCode, ct))!.Value;
    }

    /// <summary>Live amount-only targets of the same owner may not overlap in dates (e.g. a monthly and an annual target would double count).</summary>
    private async Task<string?> FindPeriodOverlapAsync(IDbConnection db, IDbTransaction tx, int? selfId, int? revisionOfId, SaveSalesTargetRequest r, DateTime start, DateTime end, CancellationToken ct)
    {
        if (!await HasScopeColumnAsync(ct)) return null;
        var hit = await db.QueryFirstOrDefaultAsync<int?>(new CommandDefinition(@"
            SELECT TOP 1 t.Id FROM dbo.SalespersonTargets t
            WHERE t.CompanyCode = @Company AND t.Scope = @Scope AND t.SapSlpCode = @Slp AND t.HasItems = 0
              AND t.Status IN ('Draft','Submitted','Approved') AND (@Self IS NULL OR t.Id <> @Self) AND (@Rev IS NULL OR t.Id <> @Rev)
              AND (t.UnitCode = @Unit OR (@Scope = 'Salesperson' AND (t.UnitCode = -1 OR @Unit = -1)))
              AND t.PeriodStartDate <= @End AND t.PeriodEndDate >= @Start
            ORDER BY t.Id", new { Company = _company.CompanyCode, Scope = r.Scope, Slp = r.SapSlpCode, Unit = r.UnitCode, Self = selfId, Rev = revisionOfId, Start = start, End = end }, transaction: tx, cancellationToken: ct));
        return hit is null ? null : $"Target #{hit} already covers part of these dates for the same {r.Scope!.ToLowerInvariant()} target; overlapping targets would be counted twice. Edit or reject it first.";
    }

    private async Task<SalesTargetResult?> ResolveReferencesAsync(SaveSalesTargetRequest r, bool requireActive, CancellationToken ct)
    {
        if (ScopeOf(r.Scope) == "Salesperson")
        {
            var sp = await FindSalespersonAsync(r.SapSlpCode, ct);
            if (sp is null) return SalesTargetResult.Fail(400, "That salesperson does not exist in SAP.");
            if (requireActive && !sp.Value.Active) return SalesTargetResult.Fail(400, "This salesperson is inactive in SAP; new targets can't be assigned to them.");
        }
        if (r.UnitCode != AllUnits && await FindUnitNameAsync(r.UnitCode, ct) is null) return SalesTargetResult.Fail(400, "That unit does not exist in SAP.");
        return null;
    }

    private static string Describe(string name, string fy, DateTime start, DateTime end, decimal amount, int lines) =>
        $"{name} · {start:yyyy-MM-dd}..{end:yyyy-MM-dd} · {amount:N0}" + (lines > 0 ? $" · {lines} item row(s)" : "");

    private static async Task InsertLinesAsync(IDbConnection db, IDbTransaction tx, int targetId, List<(SaveSalesTargetLineRequest Line, SapItem Item)> rows, CancellationToken ct)
    {
        if (rows.Count == 0) return;
        await db.ExecuteAsync(new CommandDefinition(@"
            INSERT INTO dbo.SalespersonTargetLines (TargetId, ItemCode, ItemName, ItemGroup, Uom, TargetQuantity, TargetAmount, Remarks)
            VALUES (@TargetId, @ItemCode, @ItemName, @ItemGroup, @Uom, @Qty, @Amt, @Remarks)",
            rows.Select(x => new
            {
                TargetId = targetId, x.Item.ItemCode, x.Item.ItemName, x.Item.ItemGroup, x.Item.Uom,
                Qty = x.Line.TargetQuantity, Amt = x.Line.TargetAmount, Remarks = x.Line.Remarks?.Trim()
            }), transaction: tx, cancellationToken: ct));
    }

    /// <summary>
    /// A salesperson (Sales-role) login may only work on Salesperson-scope targets of the salespersons it is linked to. Everyone else is
    /// governed by role permissions alone. Checked on the server against the stored row, never against what the browser claims.
    /// </summary>
    private async Task<SalesTargetResult?> OwnTargetGuardAsync(int? id, SaveSalesTargetRequest? r, CancellationToken ct)
    {
        var sc = _scope.Current;
        if (!sc.RoleRestricted) return null;
        const string denied = "Your login can add and change targets for your own salesperson only.";
        if (r is not null && (r.Scope != "Salesperson" || !sc.SlpCodes.Contains(r.SapSlpCode))) return SalesTargetResult.Fail(403, denied);
        if (id is not null)
        {
            using var db = _portal.CreateConnection();
            var row = await db.QuerySingleOrDefaultAsync<(string Scope, int SapSlpCode)?>(new CommandDefinition(
                (_scopeColumn ? "SELECT Scope, SapSlpCode" : "SELECT 'Salesperson' AS Scope, SapSlpCode") + " FROM dbo.SalespersonTargets WHERE Id = @Id AND CompanyCode = @Company",
                new { Id = id, Company = _company.CompanyCode }, cancellationToken: ct));
            if (row is null) return SalesTargetResult.Fail(404, "Target not found.");
            if (row.Value.Scope != "Salesperson" || !sc.SlpCodes.Contains(row.Value.SapSlpCode)) return SalesTargetResult.Fail(404, "Target not found.");
        }
        return null;
    }

    public async Task<SalesTargetResult> CreateAsync(SaveSalesTargetRequest r, string user, CancellationToken ct = default)
    {
        if (await OwnTargetGuardAsync(null, r, ct) is { } g) return g;
        var error = ValidateShape(r, out var start, out var end, out var fy);
        if (error is not null) return SalesTargetResult.Fail(400, error);
        Normalize(r);
        var hasScope = await HasScopeColumnAsync(ct);
        if (!hasScope && r.Scope != "Salesperson") return SalesTargetResult.Fail(503, ScopeMissing);
        var bad = await ResolveReferencesAsync(r, requireActive: true, ct);
        if (bad is not null) return bad;
        var unitName = r.UnitCode == AllUnits ? null : await FindUnitNameAsync(r.UnitCode, ct);
        var sp = await OwnerAsync(r, unitName, ct);

        var itemRows = new List<(SaveSalesTargetLineRequest Line, SapItem Item)>();
        if (r.Lines is { Count: > 0 })
        {
            var (itemError, resolved) = await ResolveItemsAsync(r.Lines, new HashSet<string>(), ct);
            if (itemError is not null) return SalesTargetResult.Fail(400, itemError);
            itemRows = resolved;
        }
        var amount = itemRows.Count > 0 ? itemRows.Sum(x => x.Line.TargetAmount) : r.TargetAmount;

        using var db = _portal.CreateConnection();
        db.Open();
        using var tx = db.BeginTransaction();
        try
        {
            if (itemRows.Count > 0)
            {
                var overlap = await FindItemOverlapAsync(db, tx, null, null, r, start, end, itemRows.Select(x => x.Item.ItemCode), ct);
                if (overlap is not null) { tx.Rollback(); return SalesTargetResult.Fail(409, overlap); }
            }
            else
            {
                var overlap = await FindPeriodOverlapAsync(db, tx, null, null, r, start, end, ct);
                if (overlap is not null) { tx.Rollback(); return SalesTargetResult.Fail(409, overlap); }
            }
            var id = await db.ExecuteScalarAsync<int>(new CommandDefinition(@"
                INSERT INTO dbo.SalespersonTargets
                    (CompanyCode, SapSlpCode, SalespersonName, UnitCode, UnitName, FinancialYear, TargetPeriodType, PeriodStartDate, PeriodEndDate,
                     TargetAmount, CurrencyCode, HasItems, Remarks, Status, CreatedBy" + (hasScope ? ", Scope" : "") + @")
                OUTPUT INSERTED.Id
                VALUES (@Company, @Slp, @Name, @Unit, @UnitName, @FY, @PT, @Start, @End, @Amount, 'INR', @HasItems, @Remarks, 'Draft', @User" + (hasScope ? ", @Scope" : "") + @")", new
            {
                Scope = r.Scope, Company = _company.CompanyCode, Slp = r.SapSlpCode, Name = sp.Name, Unit = r.UnitCode, UnitName = unitName, FY = fy,
                PT = r.PeriodType, Start = start, End = end, Amount = amount, HasItems = itemRows.Count > 0, Remarks = r.Remarks?.Trim(), User = user
            }, transaction: tx, cancellationToken: ct));
            await InsertLinesAsync(db, tx, id, itemRows, ct);
            await AuditAsync(db, tx, id, _company.CompanyCode, "Created", user, Describe(sp.Name, fy, start, end, amount, itemRows.Count), ct);
            tx.Commit();
            return SalesTargetResult.Success(id);
        }
        catch (SqlException ex) when (IsDuplicate(ex))
        {
            tx.Rollback();
            return SalesTargetResult.Fail(409, "A target already exists for this salesperson, unit and period.");
        }
    }

    public async Task<SalesTargetResult> UpdateAsync(int id, SaveSalesTargetRequest r, string user, CancellationToken ct = default)
    {
        if (await OwnTargetGuardAsync(id, r, ct) is { } g) return g;
        var error = ValidateShape(r, out var start, out var end, out var fy);
        if (error is not null) return SalesTargetResult.Fail(400, error);
        Normalize(r);
        var hasScope = await HasScopeColumnAsync(ct);
        if (!hasScope && r.Scope != "Salesperson") return SalesTargetResult.Fail(503, ScopeMissing);

        using var db = _portal.CreateConnection();
        db.Open();
        using var tx = db.BeginTransaction();
        try
        {
            var current = await db.QuerySingleOrDefaultAsync<(string Status, int SapSlpCode, int? RevisionOfId)?>(new CommandDefinition(
                "SELECT Status, SapSlpCode, RevisionOfId FROM dbo.SalespersonTargets WITH (UPDLOCK) WHERE Id = @Id AND CompanyCode = @Company",
                new { Id = id, Company = _company.CompanyCode }, transaction: tx, cancellationToken: ct));
            if (current is null) { tx.Rollback(); return SalesTargetResult.Fail(404, "Target not found."); }
            if (current.Value.Status is not ("Draft" or "Rejected"))
            {
                tx.Rollback();
                return SalesTargetResult.Fail(409, current.Value.Status == "Approved"
                    ? "Approved targets can't be edited. Use Revise to propose a change."
                    : $"A {current.Value.Status.ToLowerInvariant()} target can't be edited.");
            }

            // Inactive salespersons are only acceptable if this draft already belongs to them.
            var bad = await ResolveReferencesAsync(r, requireActive: current.Value.SapSlpCode != r.SapSlpCode, ct);
            if (bad is not null) { tx.Rollback(); return bad; }
            var unitName = r.UnitCode == AllUnits ? null : await FindUnitNameAsync(r.UnitCode, ct);
            var sp = await OwnerAsync(r, unitName, ct);

            var itemRows = new List<(SaveSalesTargetLineRequest Line, SapItem Item)>();
            if (r.Lines is { Count: > 0 })
            {
                var existing = (await db.QueryAsync<string>(new CommandDefinition(
                    "SELECT ItemCode FROM dbo.SalespersonTargetLines WHERE TargetId = @Id", new { Id = id }, transaction: tx, cancellationToken: ct)))
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);
                var (itemError, resolved) = await ResolveItemsAsync(r.Lines, existing, ct);
                if (itemError is not null) { tx.Rollback(); return SalesTargetResult.Fail(400, itemError); }
                itemRows = resolved;
                var overlap = await FindItemOverlapAsync(db, tx, id, current.Value.RevisionOfId, r, start, end, itemRows.Select(x => x.Item.ItemCode), ct);
                if (overlap is not null) { tx.Rollback(); return SalesTargetResult.Fail(409, overlap); }
            }
            if (itemRows.Count == 0)
            {
                var overlap = await FindPeriodOverlapAsync(db, tx, id, current.Value.RevisionOfId, r, start, end, ct);
                if (overlap is not null) { tx.Rollback(); return SalesTargetResult.Fail(409, overlap); }
            }
            var amount = itemRows.Count > 0 ? itemRows.Sum(x => x.Line.TargetAmount) : r.TargetAmount;

            await db.ExecuteAsync(new CommandDefinition(@"
                UPDATE dbo.SalespersonTargets
                SET " + (hasScope ? "Scope = @Scope, " : "") + @"SapSlpCode = @Slp, SalespersonName = @Name, UnitCode = @Unit, UnitName = @UnitName, FinancialYear = @FY, TargetPeriodType = @PT,
                    PeriodStartDate = @Start, PeriodEndDate = @End, TargetAmount = @Amount, HasItems = @HasItems, Remarks = @Remarks,
                    Status = 'Draft', ReviewRemarks = NULL, UpdatedBy = @User, UpdatedAt = SYSUTCDATETIME()
                WHERE Id = @Id AND CompanyCode = @Company", new
            {
                Scope = r.Scope, Id = id, Company = _company.CompanyCode, Slp = r.SapSlpCode, Name = sp.Name, Unit = r.UnitCode, UnitName = unitName, FY = fy,
                PT = r.PeriodType, Start = start, End = end, Amount = amount, HasItems = itemRows.Count > 0, Remarks = r.Remarks?.Trim(), User = user
            }, transaction: tx, cancellationToken: ct));
            await db.ExecuteAsync(new CommandDefinition("DELETE FROM dbo.SalespersonTargetLines WHERE TargetId = @Id", new { Id = id }, transaction: tx, cancellationToken: ct));
            await InsertLinesAsync(db, tx, id, itemRows, ct);
            await AuditAsync(db, tx, id, _company.CompanyCode, "Updated", user, Describe(sp.Name, fy, start, end, amount, itemRows.Count), ct);
            tx.Commit();
            return SalesTargetResult.Success(id);
        }
        catch (SqlException ex) when (IsDuplicate(ex))
        {
            tx.Rollback();
            return SalesTargetResult.Fail(409, "A target already exists for this salesperson, unit and period.");
        }
    }

    /// <summary>Guarded status change: succeeds only if the row is currently in <paramref name="from"/>.</summary>
    private async Task<SalesTargetResult> TransitionAsync(int id, string from, string setSql, object extra, string action, string user, string? detail, string wrongState, CancellationToken ct)
    {
        using var db = _portal.CreateConnection();
        db.Open();
        using var tx = db.BeginTransaction();
        var p = new DynamicParameters(extra);
        p.Add("Id", id); p.Add("Company", _company.CompanyCode); p.Add("From", from); p.Add("User", user);
        var rows = await db.ExecuteAsync(new CommandDefinition(
            $"UPDATE dbo.SalespersonTargets SET {setSql} WHERE Id = @Id AND CompanyCode = @Company AND Status = @From", p, transaction: tx, cancellationToken: ct));
        if (rows == 0)
        {
            var exists = await db.ExecuteScalarAsync<int>(new CommandDefinition(
                "SELECT COUNT(*) FROM dbo.SalespersonTargets WHERE Id = @Id AND CompanyCode = @Company", new { Id = id, Company = _company.CompanyCode }, transaction: tx, cancellationToken: ct));
            tx.Rollback();
            return exists == 0 ? SalesTargetResult.Fail(404, "Target not found.") : SalesTargetResult.Fail(409, wrongState);
        }
        await AuditAsync(db, tx, id, _company.CompanyCode, action, user, detail, ct);
        tx.Commit();
        return SalesTargetResult.Success(id);
    }

    public async Task<SalesTargetResult> SubmitAsync(int id, string user, CancellationToken ct = default)
    {
        if (await OwnTargetGuardAsync(id, null, ct) is { } g) return g;
        return await TransitionAsync(id, "Draft",
            "Status = 'Submitted', SubmittedBy = @User, SubmittedAt = SYSUTCDATETIME(), ReviewRemarks = NULL, UpdatedBy = @User, UpdatedAt = SYSUTCDATETIME()",
            new { }, "Submitted", user, null, "Only a draft can be submitted (it may already have been submitted).", ct);
    }

    public async Task<SalesTargetResult> ApproveAsync(int id, string? remarks, string user, CancellationToken ct = default)
    {
        if (remarks is { Length: > 500 }) return SalesTargetResult.Fail(400, "Remarks are limited to 500 characters.");

        // Optional maker-checker: set SalesTargets:AllowSelfApproval=false to stop a user approving what they submitted.
        if (!_config.GetValue("SalesTargets:AllowSelfApproval", true))
        {
            using var chk = _portal.CreateConnection();
            var submitter = await chk.ExecuteScalarAsync<string?>(new CommandDefinition(
                "SELECT SubmittedBy FROM dbo.SalespersonTargets WHERE Id = @Id AND CompanyCode = @Company", new { Id = id, Company = _company.CompanyCode }, cancellationToken: ct));
            if (submitter is not null && submitter.Equals(user, StringComparison.OrdinalIgnoreCase))
                return SalesTargetResult.Fail(403, "A target can't be approved by the person who submitted it.");
        }

        using var db = _portal.CreateConnection();
        db.Open();
        using var tx = db.BeginTransaction();
        var p = new { Id = id, Company = _company.CompanyCode, User = user, Remarks = remarks?.Trim() };
        var cur = await db.QuerySingleOrDefaultAsync<(string Status, int? RevisionOfId)?>(new CommandDefinition(
            "SELECT Status, RevisionOfId FROM dbo.SalespersonTargets WITH (UPDLOCK) WHERE Id = @Id AND CompanyCode = @Company", p, transaction: tx, cancellationToken: ct));
        if (cur is null) { tx.Rollback(); return SalesTargetResult.Fail(404, "Target not found."); }
        if (cur.Value.Status != "Submitted") { tx.Rollback(); return SalesTargetResult.Fail(409, "Only a submitted target can be approved."); }

        // Approving a revision retires the approved target it replaces first (keeps one live approved target per period).
        if (cur.Value.RevisionOfId is int oldId)
        {
            var superseded = await db.ExecuteAsync(new CommandDefinition(
                "UPDATE dbo.SalespersonTargets SET Status = 'Superseded' WHERE Id = @Old AND CompanyCode = @Company AND Status = 'Approved'",
                new { Old = oldId, Company = _company.CompanyCode }, transaction: tx, cancellationToken: ct));
            if (superseded > 0) await AuditAsync(db, tx, oldId, _company.CompanyCode, "Superseded", user, $"Replaced by target #{id}", ct);
        }
        await db.ExecuteAsync(new CommandDefinition(@"
            UPDATE dbo.SalespersonTargets
            SET Status = 'Approved', ApprovedBy = @User, ApprovedAt = SYSUTCDATETIME(), ReviewedBy = @User, ReviewedAt = SYSUTCDATETIME(), ReviewRemarks = @Remarks
            WHERE Id = @Id AND CompanyCode = @Company AND Status = 'Submitted'", p, transaction: tx, cancellationToken: ct));
        await AuditAsync(db, tx, id, _company.CompanyCode, "Approved", user, remarks?.Trim(), ct);
        tx.Commit();
        return SalesTargetResult.Success(id);
    }

    public Task<SalesTargetResult> RejectAsync(int id, string? remarks, string user, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(remarks)) return Task.FromResult(SalesTargetResult.Fail(400, "Please give a reason when rejecting a target."));
        if (remarks.Length > 500) return Task.FromResult(SalesTargetResult.Fail(400, "Remarks are limited to 500 characters."));
        return TransitionAsync(id, "Submitted",
            "Status = 'Rejected', ReviewedBy = @User, ReviewedAt = SYSUTCDATETIME(), ReviewRemarks = @Remarks",
            new { Remarks = remarks.Trim() }, "Rejected", user, remarks.Trim(), "Only a submitted target can be rejected.", ct);
    }

    public async Task<SalesTargetResult> ReviseAsync(int id, string user, CancellationToken ct = default)
    {
        if (await OwnTargetGuardAsync(id, null, ct) is { } g) return g;
        await HasScopeColumnAsync(ct);
        using var db = _portal.CreateConnection();
        db.Open();
        using var tx = db.BeginTransaction();
        try
        {
            var src = await db.QuerySingleOrDefaultAsync<SalesTargetDto>(new CommandDefinition(
                $"SELECT {TargetColumns} FROM dbo.SalespersonTargets t WITH (UPDLOCK) WHERE t.Id = @Id AND t.CompanyCode = @Company",
                new { Id = id, Company = _company.CompanyCode }, transaction: tx, cancellationToken: ct));
            if (src is null) { tx.Rollback(); return SalesTargetResult.Fail(404, "Target not found."); }
            if (src.Status != "Approved") { tx.Rollback(); return SalesTargetResult.Fail(409, "Only an approved target can be revised."); }

            if (src.Scope == "Salesperson")
            {
                var sp = await FindSalespersonAsync(src.SapSlpCode, ct);
                if (sp is null || !sp.Value.Active) { tx.Rollback(); return SalesTargetResult.Fail(400, "This salesperson is inactive in SAP; the target can't be revised."); }
            }

            // Only one open revision per approved target (the unique index would also stop the duplicate).
            var open = await db.ExecuteScalarAsync<int>(new CommandDefinition(
                "SELECT COUNT(*) FROM dbo.SalespersonTargets WHERE RevisionOfId = @Id AND CompanyCode = @Company AND Status IN ('Draft','Submitted')",
                new { Id = id, Company = _company.CompanyCode }, transaction: tx, cancellationToken: ct));
            if (open > 0) { tx.Rollback(); return SalesTargetResult.Fail(409, "This target already has a revision in progress."); }

            // The approved target stays live until the revision itself is approved (which supersedes it).
            var newId = await db.ExecuteScalarAsync<int>(new CommandDefinition(@"
                INSERT INTO dbo.SalespersonTargets
                    (CompanyCode, SapSlpCode, SalespersonName, UnitCode, UnitName, FinancialYear, TargetPeriodType, PeriodStartDate, PeriodEndDate,
                     TargetAmount, CurrencyCode, HasItems, Remarks, Status, RevisionOfId, CreatedBy" + (await HasScopeColumnAsync(ct) ? ", Scope" : "") + @")
                OUTPUT INSERTED.Id
                SELECT CompanyCode, SapSlpCode, SalespersonName, UnitCode, UnitName, FinancialYear, TargetPeriodType, PeriodStartDate, PeriodEndDate,
                       TargetAmount, CurrencyCode, HasItems, Remarks, 'Draft', Id, @User" + (await HasScopeColumnAsync(ct) ? ", Scope" : "") + @"
                FROM dbo.SalespersonTargets WHERE Id = @Id AND CompanyCode = @Company", new { Id = id, Company = _company.CompanyCode, User = user },
                transaction: tx, cancellationToken: ct));
            await db.ExecuteAsync(new CommandDefinition(@"
                INSERT INTO dbo.SalespersonTargetLines (TargetId, ItemCode, ItemName, ItemGroup, Uom, TargetQuantity, TargetAmount, Remarks)
                SELECT @NewId, ItemCode, ItemName, ItemGroup, Uom, TargetQuantity, TargetAmount, Remarks FROM dbo.SalespersonTargetLines WHERE TargetId = @Id",
                new { NewId = newId, Id = id }, transaction: tx, cancellationToken: ct));
            await AuditAsync(db, tx, newId, _company.CompanyCode, "Revised", user, $"Draft revision of approved target #{id}", ct);
            await AuditAsync(db, tx, id, _company.CompanyCode, "Revision started", user, $"Revision #{newId} created", ct);
            tx.Commit();
            return SalesTargetResult.Success(newId);
        }
        catch (SqlException ex) when (IsDuplicate(ex))
        {
            tx.Rollback();
            return SalesTargetResult.Fail(409, "A target already exists for this salesperson, unit and period.");
        }
    }

    public async Task<SalesTargetResult> DeleteAsync(int id, string user, CancellationToken ct = default)
    {
        if (await OwnTargetGuardAsync(id, null, ct) is { } g) return g;
        using var db = _portal.CreateConnection();
        db.Open();
        using var tx = db.BeginTransaction();
        var p = new { Id = id, Company = _company.CompanyCode };
        // Lines go with the header (ON DELETE CASCADE); only drafts can be deleted.
        var rows = await db.ExecuteAsync(new CommandDefinition(
            "DELETE FROM dbo.SalespersonTargets WHERE Id = @Id AND CompanyCode = @Company AND Status = 'Draft'", p, transaction: tx, cancellationToken: ct));
        if (rows == 0)
        {
            var exists = await db.ExecuteScalarAsync<int>(new CommandDefinition(
                "SELECT COUNT(*) FROM dbo.SalespersonTargets WHERE Id = @Id AND CompanyCode = @Company", p, transaction: tx, cancellationToken: ct));
            tx.Rollback();
            return exists == 0 ? SalesTargetResult.Fail(404, "Target not found.") : SalesTargetResult.Fail(409, "Only a draft can be deleted.");
        }
        await AuditAsync(db, tx, id, _company.CompanyCode, "Deleted", user, null, ct);
        tx.Commit();
        return SalesTargetResult.Success(id);
    }
}
