using System.Text;
using System.Text.RegularExpressions;

namespace SAPB1.Api.Data;

/// <summary>
/// Salesperson scoping at the database-connection level. For a RESTRICTED login every query sent to the SAP company database has each reference to a
/// sales document table replaced by a filtered derived table, so no code path — including one added later — can read another salesperson's documents:
///   header tables  OQUT ORDR ODLN OINV ORIN   → only rows whose SlpCode is one of the login's salesperson codes
///   line tables    QUT1 RDR1 DLN1 INV1 RIN1   → only lines of such documents
///   ORCT (receipts)                           → only receipts of customers assigned to one of those salespersons
/// The codes are integers read from the portal database (never user input) and are written into the SQL as literals. A single pass over the original
/// text means the injected sub-queries are never rewritten again. Customer master (OCRD) is scoped explicitly where customers are listed, because it is
/// also joined purely for display names.
/// </summary>
public static class SqlScopeRewriter
{
    public const string Marker = "/*salesperson-scope*/";

    private static readonly Dictionary<string, string> LineToHeader = new(StringComparer.OrdinalIgnoreCase)
    {
        ["QUT1"] = "OQUT", ["RDR1"] = "ORDR", ["DLN1"] = "ODLN", ["INV1"] = "OINV", ["RIN1"] = "ORIN"
    };

    private static readonly HashSet<string> Keywords = new(StringComparer.OrdinalIgnoreCase)
    {
        "WHERE", "ON", "LEFT", "RIGHT", "INNER", "OUTER", "CROSS", "FULL", "JOIN", "GROUP", "ORDER", "HAVING", "UNION", "EXCEPT", "INTERSECT",
        "WITH", "OPTION", "FOR", "SET", "AS", "PIVOT", "UNPIVOT", "OUTPUT", "SELECT", "OFFSET", "FETCH", "USING", "APPLY", "TABLESAMPLE"
    };

    private static readonly Regex TableRef = new(
        @"\b(?<kw>FROM|JOIN)(?<ws>\s+)(?<t>OQUT|ORDR|ODLN|OINV|ORIN|ORCT|QUT1|RDR1|DLN1|INV1|RIN1)\b(?:(?<as>\s+AS)?(?<a>\s+[A-Za-z_][A-Za-z0-9_]*))?",
        RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static string Rewrite(string sql, int[] codes)
    {
        if (string.IsNullOrEmpty(sql) || sql.Contains(Marker, StringComparison.Ordinal)) return sql;
        var list = string.Join(",", (codes.Length == 0 ? new[] { int.MinValue } : codes).Select(c => c.ToString(System.Globalization.CultureInfo.InvariantCulture)));

        var rewritten = TableRef.Replace(sql, m =>
        {
            var table = m.Groups["t"].Value.ToUpperInvariant();
            string? alias = null;
            var trailing = "";
            if (m.Groups["a"].Success)
            {
                var word = m.Groups["a"].Value.Trim();
                if (m.Groups["as"].Success || !Keywords.Contains(word)) alias = word;      // a real alias
                else trailing = m.Groups["a"].Value;                                       // a keyword that merely follows the table: give it back
            }

            string derived;
            if (table == "ORCT")
                derived = $"SELECT * FROM ORCT WHERE CardCode IN (SELECT CardCode FROM OCRD WHERE SlpCode IN ({list}))";
            else if (LineToHeader.TryGetValue(table, out var header))
                derived = $"SELECT x.* FROM {table} x WHERE EXISTS (SELECT 1 FROM {header} hh WHERE hh.DocEntry = x.DocEntry AND hh.SlpCode IN ({list}))";
            else
                derived = $"SELECT * FROM {table} WHERE SlpCode IN ({list})";

            return $"{m.Groups["kw"].Value}{m.Groups["ws"].Value}({derived}) {alias ?? table}{trailing}";
        });

        return Marker + "\n" + rewritten;
    }
}
