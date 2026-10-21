using System.Data;
using Dapper;

namespace SAPB1.Api.Services;

/// <summary>
/// The client's dispatch fields are SAP user-defined fields, so they differ between companies. Each expression is built only when the column really
/// exists in the connected company database; otherwise it is a typed NULL and the report simply shows blanks (never a failing query).
/// Invoice (OINV): LR number = U_LrNo (else the duplicate U_LR_no), LR date = U_LrDt, transporter = U_Trnsptr (else the SAP shipping type name).
/// Sales order line (RDR1): ETA from production = U_ETA, shown exactly as entered (free text such as "15 Working Days").
/// </summary>
public record DispatchUdfs(bool LrNo, bool LrNo2, bool LrDate, bool Transporter, bool Eta)
{
    public static readonly DispatchUdfs None = new(false, false, false, false, false);

    public static async Task<DispatchUdfs> LoadAsync(IDbConnection db, CancellationToken ct)
    {
        var cols = (await db.QueryAsync<string>(new CommandDefinition(@"
            SELECT TABLE_NAME + '.' + COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE (TABLE_NAME = 'OINV' AND COLUMN_NAME IN ('U_LrNo', 'U_LR_no', 'U_LrDt', 'U_Trnsptr'))
               OR (TABLE_NAME = 'RDR1' AND COLUMN_NAME = 'U_ETA')", cancellationToken: ct))).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return new DispatchUdfs(cols.Contains("OINV.U_LrNo"), cols.Contains("OINV.U_LR_no"), cols.Contains("OINV.U_LrDt"), cols.Contains("OINV.U_Trnsptr"), cols.Contains("RDR1.U_ETA"));
    }

    /// <summary>LR number of invoice header alias <paramref name="h"/>.</summary>
    public string LrNoExpr(string h) =>
        LrNo && LrNo2 ? $"COALESCE(NULLIF({h}.U_LrNo, ''), NULLIF({h}.U_LR_no, ''))"
        : LrNo ? $"NULLIF({h}.U_LrNo, '')" : LrNo2 ? $"NULLIF({h}.U_LR_no, '')" : "CAST(NULL AS nvarchar(100))";

    public string LrDateExpr(string h) => LrDate ? $"{h}.U_LrDt" : "CAST(NULL AS datetime)";

    public string TransporterExpr(string h) =>
        Transporter ? $"COALESCE(NULLIF({h}.U_Trnsptr, ''), (SELECT TOP 1 sh.TrnspName FROM OSHP sh WHERE sh.TrnspCode = {h}.TrnspCode))"
                    : $"(SELECT TOP 1 sh.TrnspName FROM OSHP sh WHERE sh.TrnspCode = {h}.TrnspCode)";

    public string EtaExpr(string l) => Eta ? $"NULLIF({l}.U_ETA, '')" : "CAST(NULL AS nvarchar(100))";

    /// <summary>
    /// Order date for an invoice line alias <paramref name="l"/> (INV1), through SAP's own document chain: invoice from an order (BaseType 17), or from a
    /// delivery (BaseType 15) that was created from an order. NULL for an invoice raised without an order.
    /// </summary>
    public static string OrderDateOfInvoiceLine(string l) => $@"(SELECT o.DocDate FROM ORDR o WHERE o.DocEntry = CASE
                 WHEN {l}.BaseType = 17 THEN {l}.BaseEntry
                 WHEN {l}.BaseType = 15 THEN (SELECT TOP 1 d.BaseEntry FROM DLN1 d WHERE d.DocEntry = {l}.BaseEntry AND d.LineNum = {l}.BaseLine AND d.BaseType = 17) END)";
}
