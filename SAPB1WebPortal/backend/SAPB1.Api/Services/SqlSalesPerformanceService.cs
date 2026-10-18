using Dapper;
using Microsoft.Data.SqlClient;
using SAPB1.Api.DTOs.Sales;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Services;

/// <summary>
/// Sales Dashboard figures. Actual turnover uses the reconciled Sales Register rule (net of credit notes when enabled) and the
/// same default location exclusions as Total Turnover. Targets are the APPROVED salesperson targets (portal database) whose whole
/// period lies inside the selected dates — a target is never compared with a part of its period; targets that only partly overlap
/// are counted and reported as excluded. Units come from company configuration (SalesDashboard:Units:&lt;company&gt;); a unit's SAP
/// Location (sales) and Branch (outstanding) are separate dimensions, mapped by name and never assumed equal.
/// </summary>
public class SqlSalesPerformanceService : ISalesPerformanceService
{
    private readonly ICompanyConnectionFactory _sap;
    private readonly IPortalConnectionFactory _portal;
    private readonly ICompanyContext _company;
    private readonly IConfiguration _config;
    private readonly ISalesDetailReportsService _detail;

    public SqlSalesPerformanceService(ICompanyConnectionFactory sap, IPortalConnectionFactory portal, ICompanyContext company, IConfiguration config, ISalesDetailReportsService detail)
    {
        _sap = sap;
        _portal = portal;
        _company = company;
        _config = config;
        _detail = detail;
    }

    private class UnitConfig { public string Label { get; set; } = ""; public string? Location { get; set; } public string? Branch { get; set; } }
    private static string Norm(string? v) => new string((v ?? "").Where(c => !char.IsWhiteSpace(c)).ToArray()).ToLowerInvariant();
    private static DateTime FyStart(DateTime d) => new(d.Month >= 4 ? d.Year : d.Year - 1, 4, 1);

    private class LocRow { public int Code { get; set; } public string Name { get; set; } = ""; }
    private class BplRow { public int Id { get; set; } public string Name { get; set; } = ""; }
    private class AmtRow { public int? LocCode { get; set; } public decimal Amt { get; set; } public int N { get; set; } }

    public async Task<SalesPerformanceDto> GetAsync(PerformanceQuery q, CancellationToken ct = default)
    {
        var today = DateTime.Today;
        var from = (q.DateFrom ?? FyStart(today)).Date;
        var to = (q.DateTo ?? today).Date;
        var category = ProductCategories.Canonical(q.ProductCategory);

        using var db = _sap.CreateConnection();
        var locations = (await db.QueryAsync<LocRow>(new CommandDefinition("SELECT Code, Location AS Name FROM OLCT", cancellationToken: ct))).ToList();
        var branches = (await db.QueryAsync<BplRow>(new CommandDefinition("SELECT BPLId AS Id, BPLName AS Name FROM OBPL", cancellationToken: ct))).ToList();

        var excludedNames = (_config.GetSection($"SalesTurnover:DefaultExcludedLocations:{_company.CompanyCode}").Get<string[]>() ?? Array.Empty<string>()).Select(Norm).ToHashSet();
        var excludedCodes = locations.Where(l => excludedNames.Contains(Norm(l.Name))).Select(l => l.Code).ToHashSet();

        // ---- units: configured names (resolved to SAP codes by name), else every location
        var cfg = _config.GetSection($"SalesDashboard:Units:{_company.CompanyCode}").Get<List<UnitConfig>>() ?? new();
        var units = new List<UnitPerformanceDto>();
        if (cfg.Count > 0)
        {
            foreach (var u in cfg)
            {
                var loc = locations.FirstOrDefault(l => Norm(l.Name) == Norm(u.Location));
                var br = string.IsNullOrWhiteSpace(u.Branch) ? null : branches.FirstOrDefault(b => Norm(b.Name) == Norm(u.Branch));
                units.Add(new UnitPerformanceDto
                {
                    Label = u.Label, LocationCode = loc?.Code, LocationName = loc?.Name, BranchCode = br?.Id, BranchName = br?.Name,
                    Note = loc is null ? $"Location '{u.Location}' was not found in SAP." : (string.IsNullOrWhiteSpace(u.Branch) ? "No SAP branch is mapped to this unit, so outstanding isn't shown." : br is null ? $"Branch '{u.Branch}' was not found in SAP." : null)
                });
            }
        }
        else
        {
            foreach (var l in locations.OrderBy(l => l.Name))
                units.Add(new UnitPerformanceDto { Label = l.Name, LocationCode = l.Code, LocationName = l.Name, Note = "No SAP branch is mapped to this unit, so outstanding isn't shown." });
        }
        var selected = q.Unit is int su ? units.FirstOrDefault(u => u.LocationCode == su) : null;

        var dto = new SalesPerformanceDto
        {
            DateFrom = from, DateTo = to, IncludeTax = q.IncludeTax, NetOfCreditNotes = q.NetOfCreditNotes,
            SelectedUnit = q.Unit, SelectedUnitLabel = selected?.Label ?? (q.Unit is null ? "All units" : locations.FirstOrDefault(l => l.Code == q.Unit)?.Name ?? "Unit")
        };

        var p = new DynamicParameters();
        p.Add("From", from);
        p.Add("To", to);
        p.Add("Group", q.CustomerGroup);
        p.Add("Slp", q.Salesperson);
        p.Add("Cat", category);

        // ---- actual turnover by location (same rows and rules as the Sales Register / Total Turnover)
        var rowsSql = q.NetOfCreditNotes
            ? SalesAmount.NetOfCreditNotesRows(q.IncludeTax)
            : $@"SELECT h.BPLId, c.GroupCode, l.LocCode, h.SlpCode, h.DocDate, l.ItemCode, l.Quantity AS Qty, {SalesAmount.AllocatedToLine(q.IncludeTax)} AS Amt
                 FROM OINV h JOIN INV1 l ON l.DocEntry = h.DocEntry LEFT JOIN OCRD c ON c.CardCode = h.CardCode
                 WHERE h.CANCELED = 'N' AND h.DocDate >= @From AND h.DocDate <= @To";
        var actualByLoc = (await db.QueryAsync<AmtRow>(new CommandDefinition($@"
            WITH alloc AS ({rowsSql})
            SELECT a.LocCode, SUM(a.Amt) AS Amt, 0 AS N
            FROM alloc a LEFT JOIN OITM it ON it.ItemCode = a.ItemCode
            WHERE (@Group IS NULL OR a.GroupCode = @Group) AND (@Slp IS NULL OR a.SlpCode = @Slp)
              AND (@Cat IS NULL OR {ProductCategories.Expr("it")} = @Cat)
            GROUP BY a.LocCode", p, cancellationToken: ct))).ToList();
        decimal ActualOf(int? loc) => actualByLoc.Where(r => r.LocCode == loc).Sum(r => r.Amt);

        // ---- open sales orders by location (client line definition: open lines, full LineTotal, order date in the period)
        var openByLoc = (await db.QueryAsync<AmtRow>(new CommandDefinition($@"
            SELECT l.LocCode, COUNT(*) AS N, ISNULL(SUM(l.LineTotal), 0) AS Amt
            FROM ORDR h JOIN RDR1 l ON l.DocEntry = h.DocEntry
            LEFT JOIN OCRD c ON c.CardCode = h.CardCode LEFT JOIN OITM i ON i.ItemCode = l.ItemCode
            WHERE h.CANCELED = 'N' AND l.LineStatus = 'O' AND h.DocDate >= @From AND h.DocDate < DATEADD(DAY, 1, @To)
              AND (@Group IS NULL OR c.GroupCode = @Group)
              AND (@Slp IS NULL OR (CASE WHEN l.SlpCode IS NULL OR l.SlpCode = -1 THEN h.SlpCode ELSE l.SlpCode END) = @Slp)
              AND (@Cat IS NULL OR {ProductCategories.Expr("i")} = @Cat)
            GROUP BY l.LocCode", p, cancellationToken: ct))).ToList();

        // ---- approved targets (portal DB). Missing tables or any failure must not break the dashboard.
        var targetByUnit = new Dictionary<int, decimal>();
        var targetCounts = new Dictionary<int, int>();
        var partial = 0;
        var targetsAvailable = true;
        try
        {
            using var pdb = _portal.CreateConnection();
            var trows = await pdb.QueryAsync<(int UnitCode, decimal Amt, int N)>(new CommandDefinition(@"
                SELECT UnitCode, SUM(TargetAmount) AS Amt, COUNT(*) AS N FROM dbo.SalespersonTargets
                WHERE CompanyCode = @Company AND Status = 'Approved' AND PeriodStartDate >= @From AND PeriodEndDate <= @To
                  AND (@Slp IS NULL OR SapSlpCode = @Slp)
                GROUP BY UnitCode", new { Company = _company.CompanyCode, From = from, To = to, Slp = q.Salesperson }, cancellationToken: ct));
            foreach (var r in trows) { targetByUnit[r.UnitCode] = r.Amt; targetCounts[r.UnitCode] = r.N; }
            partial = await pdb.ExecuteScalarAsync<int>(new CommandDefinition(@"
                SELECT COUNT(*) FROM dbo.SalespersonTargets
                WHERE CompanyCode = @Company AND Status = 'Approved' AND PeriodEndDate >= @From AND PeriodStartDate <= @To
                  AND NOT (PeriodStartDate >= @From AND PeriodEndDate <= @To) AND (@Slp IS NULL OR SapSlpCode = @Slp)",
                new { Company = _company.CompanyCode, From = from, To = to, Slp = q.Salesperson }, cancellationToken: ct));
        }
        catch (SqlException)
        {
            targetsAvailable = false;
        }
        // Targets are set per salesperson / unit / period; they cannot be split by customer group or product category.
        var targetApplies = targetsAvailable && q.CustomerGroup is null && category is null;

        // ---- journal-based outstanding by branch (as of the To Date)
        var outstandingByBranch = new Dictionary<int, decimal>();
        decimal outstandingTotal = 0;
        string? outstandingNote = null;
        var outstandingAvailable = false;
        if (q.Salesperson is not null || q.CustomerGroup is not null || category is not null)
        {
            outstandingNote = "Outstanding is a customer balance and is not split by salesperson, customer group or product category.";
        }
        else
        {
            try
            {
                var led = await _detail.GetLedgerOutstandingAsync(new LedgerOutstandingQuery { AsOf = to, Page = 1, PageSize = 1 }, ct);
                foreach (var b in led.ByBranch) if (b.BranchCode is int bc) outstandingByBranch[bc] = b.Amount;
                outstandingTotal = led.TotalOutstanding;
                outstandingAvailable = true;
            }
            catch (Exception)
            {
                outstandingNote = "Total outstanding could not be calculated.";
            }
        }

        // ---- per-unit rows
        foreach (var u in units)
        {
            u.Actual = ActualOf(u.LocationCode);
            var o = openByLoc.Where(r => r.LocCode == u.LocationCode).ToList();
            u.OpenOrderLines = o.Sum(r => r.N);
            u.OpenOrderValue = o.Sum(r => r.Amt);
            if (targetApplies && u.LocationCode is int lc && targetByUnit.TryGetValue(lc, out var t) && t > 0)
            {
                u.TargetConfigured = true;
                u.Target = t;
                u.AchievementPct = Math.Round(u.Actual / t * 100, 2);
                u.Variance = u.Actual - t;
            }
            if (outstandingAvailable && u.BranchCode is int bc2) u.Outstanding = outstandingByBranch.GetValueOrDefault(bc2);
        }
        dto.Units = units;

        // ---- headline
        if (q.Unit is int unitCode)
        {
            dto.Actual = ActualOf(unitCode);
            if (targetApplies && targetByUnit.TryGetValue(unitCode, out var ut) && ut > 0) { dto.Target = ut; dto.TargetCount = targetCounts.GetValueOrDefault(unitCode); }
            var oo = openByLoc.Where(r => r.LocCode == unitCode).ToList();
            dto.OpenOrders = new OpenOrderTotalsDto { OpenLines = oo.Sum(r => r.N), LineTotal = oo.Sum(r => r.Amt) };
            var sel = units.FirstOrDefault(u => u.LocationCode == unitCode);
            if (outstandingAvailable && sel?.BranchCode is int sb) { dto.TotalOutstanding = outstandingByBranch.GetValueOrDefault(sb); dto.OutstandingAvailable = true; dto.OutstandingNote = $"Branch {sel.BranchName} (mapped to this unit)"; }
            else { dto.OutstandingAvailable = false; dto.OutstandingNote = outstandingNote ?? "No SAP branch is mapped to this unit, so its outstanding can't be shown."; }
        }
        else
        {
            // All units = every location except the company's default-excluded ones (same as Total Turnover), plus lines with no location.
            dto.Actual = actualByLoc.Where(r => r.LocCode is null || !excludedCodes.Contains(r.LocCode.Value)).Sum(r => r.Amt);
            if (targetApplies && targetByUnit.Count > 0) { dto.Target = targetByUnit.Values.Sum(); dto.TargetCount = targetCounts.Values.Sum(); }
            dto.OpenOrders = new OpenOrderTotalsDto { OpenLines = openByLoc.Sum(r => r.N), LineTotal = openByLoc.Sum(r => r.Amt) };
            dto.TotalOutstanding = outstandingTotal;
            dto.OutstandingAvailable = outstandingAvailable;
            dto.OutstandingNote = outstandingNote;
        }

        dto.PartialTargetsExcluded = partial;
        dto.TargetConfigured = dto.Target is > 0;
        if (dto.TargetConfigured)
        {
            var t = dto.Target!.Value;
            dto.AchievementPct = Math.Round(dto.Actual / t * 100, 2);
            dto.Remaining = t - dto.Actual;
            dto.Variance = dto.Actual - t;
            dto.Status = dto.Actual >= t ? "Achieved" : "In progress";
        }
        else dto.Status = "No target configured";

        dto.TargetBasis = !targetsAvailable
            ? "Targets are unavailable (the targets database could not be read)."
            : q.CustomerGroup is not null || category is not null
                ? "Targets are set per salesperson, unit and period, so no target applies to a customer-group or product-category selection."
                : $"Approved salesperson targets whose whole period falls between {from:dd MMM yyyy} and {to:dd MMM yyyy}"
                  + (q.Unit is null ? " (company-wide and unit targets together)" : " for this unit (company-wide targets are not split by unit)")
                  + (q.Salesperson is not null ? ", for the selected salesperson" : "")
                  + (partial > 0 ? $". {partial} approved target(s) only partly overlap these dates and are excluded." : ".");
        return dto;
    }
}
