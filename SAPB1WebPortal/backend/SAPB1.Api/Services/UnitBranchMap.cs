using System.Data;
using Dapper;

namespace SAPB1.Api.Services;

/// <summary>Outcome of mapping a dashboard unit (SAP location) to its SAP branch. BranchId null = no valid mapping (see Note).</summary>
public record UnitBranch(string? Label, int? BranchId, string? BranchName, string? Note);

/// <summary>
/// Balances (journal outstanding, unpaid invoices) live on the SAP BRANCH (OBPL / BPLId), while sales are attributed to the line LOCATION
/// (OLCT). The two are different dimensions and are never assumed equal: the mapping comes from company configuration
/// (SalesDashboard:Units:&lt;company&gt; — Location name -> Branch name), matched by name ignoring case and spaces. A unit without a
/// configured branch has NO mapping, and callers must show "not available" instead of a misleading zero.
/// </summary>
public static class UnitBranchMap
{
    private class Entry { public string Label { get; set; } = ""; public string? Location { get; set; } public string? Branch { get; set; } }
    private static string Norm(string? v) => new string((v ?? "").Where(c => !char.IsWhiteSpace(c)).ToArray()).ToLowerInvariant();

    public static async Task<UnitBranch> ResolveAsync(IDbConnection db, IConfiguration config, string company, int unitCode, CancellationToken ct)
    {
        var loc = await db.QuerySingleOrDefaultAsync<string?>(new CommandDefinition("SELECT Location FROM OLCT WHERE Code = @Code", new { Code = unitCode }, cancellationToken: ct));
        if (loc is null) return new UnitBranch(null, null, null, "That unit does not exist in SAP.");

        var entry = (config.GetSection($"SalesDashboard:Units:{company}").Get<List<Entry>>() ?? new()).FirstOrDefault(e => Norm(e.Location) == Norm(loc));
        if (entry is null) return new UnitBranch(loc, null, null, $"No SAP branch is mapped to {loc}, so balances can't be shown for it.");
        if (string.IsNullOrWhiteSpace(entry.Branch)) return new UnitBranch(entry.Label, null, null, $"No SAP branch is mapped to {entry.Label}, so balances can't be shown for it.");

        var branches = await db.QueryAsync<(int Id, string Name)>(new CommandDefinition("SELECT BPLId, BPLName FROM OBPL", cancellationToken: ct));
        var br = branches.FirstOrDefault(b => Norm(b.Name) == Norm(entry.Branch));
        return br.Name is null
            ? new UnitBranch(entry.Label, null, null, $"Branch '{entry.Branch}' for {entry.Label} was not found in SAP.")
            : new UnitBranch(entry.Label, br.Id, br.Name, null);
    }
}
