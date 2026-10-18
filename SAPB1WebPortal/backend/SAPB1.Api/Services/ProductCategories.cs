namespace SAPB1.Api.Services;

/// <summary>
/// The client's Product Category, taken from the item master's query groups (OITM.QryGroup1..4), exactly as in the client's
/// own sales-register SQL. The CASE order IS the precedence when an item is flagged in more than one group (QryGroup1 wins).
/// Only a fixed SQL fragment is produced; the filter value is always passed as a parameter.
/// </summary>
public static class ProductCategories
{
    public static readonly string[] All = { "Trading", "Manufacturing", "Ring", "Emerson Trading", "NA" };

    public static bool IsValid(string? value) =>
        string.IsNullOrWhiteSpace(value) || All.Contains(value.Trim(), StringComparer.OrdinalIgnoreCase);

    /// <summary>Normalises a valid value to its canonical spelling (null when empty).</summary>
    public static string? Canonical(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : All.First(c => c.Equals(value.Trim(), StringComparison.OrdinalIgnoreCase));

    /// <summary>SQL CASE over an OITM alias, e.g. <c>Expr("i")</c>.</summary>
    public static string Expr(string itemAlias = "i") =>
        $@"CASE WHEN {itemAlias}.QryGroup1 = 'Y' THEN 'Trading' WHEN {itemAlias}.QryGroup2 = 'Y' THEN 'Manufacturing'
                 WHEN {itemAlias}.QryGroup3 = 'Y' THEN 'Ring' WHEN {itemAlias}.QryGroup4 = 'Y' THEN 'Emerson Trading' ELSE 'NA' END";
}
