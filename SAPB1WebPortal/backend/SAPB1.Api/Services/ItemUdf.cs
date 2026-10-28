using System.Collections.Concurrent;
using System.Data;
using Dapper;

namespace SAPB1.Api.Services;

/// <summary>
/// The client's item-master user-defined field "Aroma Code" (OITM.U_AromaCode). UDFs differ between companies, so the column is used only when it
/// exists in the connected company database; otherwise a typed NULL is used and the reports simply show blanks and search on code / name only.
/// </summary>
public static class ItemUdf
{
    private static readonly ConcurrentDictionary<string, bool> Cache = new();

    public static async Task<bool> HasAromaAsync(IDbConnection db, CancellationToken ct = default)
    {
        var key = db.Database ?? "";
        if (Cache.TryGetValue(key, out var known)) return known;
        var has = await db.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'OITM' AND COLUMN_NAME = 'U_AromaCode'", cancellationToken: ct)) > 0;
        Cache[key] = has;
        return has;
    }

    /// <summary>
    /// " OR &lt;itemCode&gt; IN (items whose Aroma Code matches @SearchLike)" for a search predicate on a table that only carries the item CODE
    /// (no OITM join). Empty when the company has no Aroma Code field. @SearchLike must already be a bound parameter.
    /// </summary>
    public static string AromaOr(bool has, string itemCodeExpr, string param = "@SearchLike") =>
        has ? $" OR {itemCodeExpr} IN (SELECT ai.ItemCode FROM OITM ai WHERE ai.U_AromaCode LIKE {param})" : "";

    /// <summary>SQL expression for the Aroma Code of the OITM alias <paramref name="itemAlias"/>.</summary>
    public static string Aroma(bool has, string itemAlias = "i") => has ? $"{itemAlias}.U_AromaCode" : "CAST(NULL AS nvarchar(20))";
}
