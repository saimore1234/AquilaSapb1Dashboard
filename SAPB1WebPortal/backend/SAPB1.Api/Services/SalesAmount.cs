namespace SAPB1.Api.Services;

/// <summary>
/// The single definition of "sales amount" shared by every Sales Overview query,
/// so the Include Tax switch behaves identically everywhere. Only fixed SQL
/// fragments are returned (no user input is ever concatenated).
///   Include Tax = A/R invoice DocTotal
///   Exclude Tax = DocTotal - VatSum
/// Credit memos are deliberately not netted off (existing portal logic).
/// </summary>
public static class SalesAmount
{
    /// <summary>Invoice-header amount, e.g. "h.DocTotal" or "(h.DocTotal - h.VatSum)".</summary>
    public static string Header(bool includeTax, string alias = "h") =>
        includeTax ? $"{alias}.DocTotal" : $"({alias}.DocTotal - {alias}.VatSum)";

    /// <summary>Invoice-line amount (line GTotal incl. tax / LineTotal excl. tax) for item-level views.</summary>
    public static string Line(bool includeTax, string alias = "l") =>
        includeTax ? $"{alias}.GTotal" : $"{alias}.LineTotal";

    /// <summary>
    /// Header amount spread over the invoice's lines in proportion to line GTotal (equal split
    /// when every line is zero), so slicing by a line-level field (location) still sums to the
    /// exact header amount. Must be evaluated over ALL lines of the invoice (no line filter).
    /// </summary>
    public static string AllocatedToLine(bool includeTax, string headerAlias = "h", string lineAlias = "l") =>
        $@"CASE WHEN SUM({lineAlias}.GTotal) OVER (PARTITION BY {lineAlias}.DocEntry) <> 0
                THEN {Header(includeTax, headerAlias)} * {lineAlias}.GTotal / SUM({lineAlias}.GTotal) OVER (PARTITION BY {lineAlias}.DocEntry)
                ELSE {Header(includeTax, headerAlias)} / COUNT(*) OVER (PARTITION BY {lineAlias}.DocEntry) END";

    /// <summary>
    /// "Client basis" per-line amounts: A/R invoice lines MINUS A/R credit-memo lines, item/service line
    /// totals only (no freight, no rounding), after spreading each document's header discount over its
    /// lines. Excl. tax uses LineTotal; incl. tax uses GTotal. Produces rows (BPLId, GroupCode, LocCode, Amt)
    /// for the CTE named by the caller. Cancelled documents are excluded; @From/@To bound DocDate.
    /// Reconciled against the client's turnover report (see project notes).
    /// </summary>
    public static string NetOfCreditNotesRows(bool includeTax)
    {
        var line = includeTax ? "l.GTotal" : "l.LineTotal";
        string Branch(string hdr, string ln, string sign) => $@"
                SELECT h.BPLId, c.GroupCode, l.LocCode,
                       {sign}({line} * (1 - CASE WHEN SUM(l.LineTotal) OVER (PARTITION BY l.DocEntry) <> 0
                                                  THEN h.DiscSum / SUM(l.LineTotal) OVER (PARTITION BY l.DocEntry) ELSE 0 END)) AS Amt
                FROM {hdr} h
                JOIN {ln} l ON l.DocEntry = h.DocEntry
                LEFT JOIN OCRD c ON c.CardCode = h.CardCode
                WHERE h.CANCELED = 'N' AND h.DocDate >= @From AND h.DocDate <= @To";
        return Branch("OINV", "INV1", "") + "\n                UNION ALL" + Branch("ORIN", "RIN1", "-");
    }
}
