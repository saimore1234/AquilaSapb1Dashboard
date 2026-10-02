using System.Diagnostics;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Caching.Memory;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Services;

/// <summary>
/// Reads the company's own SAP B1 print configuration and renders its existing
/// Crystal layouts through SAPB1.PrintWorker (a .NET Framework helper, because the
/// Crystal runtime does not run on modern .NET).
///
///   document type slug  (fixed map)      header table + B1 object type + RTYP layout types
///   RDOC (Category = 'C', Status = 'A')  every Crystal layout of that type (what the user picks from)
///   RTYP.DEFLT_REP                       which of them SAP B1 treats as default
///   worker                               PDF, with Dockey@ = DocEntry and ObjectID@ = object type
///
/// Table/column names only ever come from the fixed map below, never from the
/// request; DocEntry and layout code are bound parameters, and a layout code is
/// only accepted if it belongs to THIS document's layout type. Standard B1 (PLD)
/// layouts (Category = 'P') carry no .rpt and cannot be rendered outside the B1
/// client, so they are never listed; there is no fallback layout.
///
/// Speed: layout lists, .rpt templates and rendered PDFs are cached in memory for
/// a short time (keyed by company, so companies never mix). A PDF cache entry also
/// carries the document's UpdateDate/UpdateTS, so an edited document is re-rendered.
/// </summary>
public class SapB1PrintService : ISapB1PrintService
{
    private sealed record DocMap(string Table, int ObjectId, string ItemLayoutType, string ServiceLayoutType, string FileLabel, bool HasDocType = true);

    private static readonly Dictionary<string, DocMap> Map = new(StringComparer.OrdinalIgnoreCase)
    {
        ["purchase-request"]   = new("OPRQ", 1470000113, "PRQ2", "PRQ1", "PurchaseRequest"),
        ["purchase-quotation"] = new("OPQT", 540000006,  "PQT2", "PQT1", "PurchaseQuotation"),
        ["purchase-order"]     = new("OPOR", 22,         "POR2", "POR1", "PurchaseOrder"),
        ["grpo"]               = new("OPDN", 20,         "PDN2", "PDN1", "GRPO"),
        ["ap-invoice"]         = new("OPCH", 18,         "PCH2", "PCH1", "APInvoice"),
        ["ap-credit-memo"]     = new("ORPC", 19,         "RPC2", "RPC1", "APCreditMemo"),
        ["sales-quotation"]    = new("OQUT", 23,         "QUT2", "QUT1", "SalesQuotation"),
        ["sales-order"]        = new("ORDR", 17,         "RDR2", "RDR1", "SalesOrder"),
        ["delivery"]           = new("ODLN", 15,         "DLN2", "DLN1", "Delivery"),
        ["ar-invoice"]         = new("OINV", 13,         "INV2", "INV1", "ARInvoice"),
        ["ar-credit-memo"]     = new("ORIN", 14,         "RIN2", "RIN1", "ARCreditMemo"),
        ["production-order"]   = new("OWOR", 202,        "WOR1", "WOR1", "ProductionOrder", HasDocType: false),
        ["incoming-payment"]   = new("ORCT", 24,         "RCT1", "RCT1", "IncomingPayment", HasDocType: false),
        ["outgoing-payment"]   = new("OVPM", 46,         "VPM1", "VPM1", "OutgoingPayment", HasDocType: false),
    };

    /// <summary>Permission key required to print each document type (same keys the document's module already uses).</summary>
    public static string? PermissionFor(string documentType) => documentType.ToLowerInvariant() switch
    {
        "purchase-request" or "purchase-quotation" or "purchase-order" or "grpo" or "ap-invoice" or "ap-credit-memo" or "outgoing-payment" => "Purchase.View",
        "sales-quotation" or "sales-order" or "delivery" or "ar-invoice" or "ar-credit-memo" or "incoming-payment" => "Sales.View",
        "production-order" => "Production.View",
        _ => null
    };

    public static bool IsKnown(string documentType) => Map.ContainsKey(documentType);

    // Crystal rendering is CPU/memory heavy: cap concurrent worker processes.
    private static readonly SemaphoreSlim Gate = new(3, 3);

    // Shared across requests. Entries are sized in bytes (templates/PDFs) or 1 (lists) against a hard cap.
    private static readonly MemoryCache Cache = new(new MemoryCacheOptions { SizeLimit = 96L * 1024 * 1024 });
    private static readonly TimeSpan ListTtl = TimeSpan.FromSeconds(60);
    private static readonly TimeSpan TemplateTtl = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan PdfTtl = TimeSpan.FromMinutes(2);

    // Concurrent identical renders (double click / two users) share one worker run.
    private static readonly Dictionary<string, Lazy<Task<byte[]?>>> InFlight = new();

    private readonly ICompanyConnectionFactory _connections;
    private readonly ICompanyContext _company;
    private readonly IConfiguration _config;
    private readonly ILogger<SapB1PrintService> _logger;

    public SapB1PrintService(ICompanyConnectionFactory connections, ICompanyContext company, IConfiguration config, ILogger<SapB1PrintService> logger)
    {
        _connections = connections;
        _company = company;
        _config = config;
        _logger = logger;
    }

    private sealed record HeaderRow(string? DocType, int DocNum, DateTime? UpdateDate, int? UpdateTS);
    private sealed record TemplateRow(string DocName, byte[] Template);

    private async Task<(HeaderRow? Header, string LayoutType)> ReadHeaderAsync(SqlConnection conn, DocMap map, int docEntry, CancellationToken ct)
    {
        // Table name is from the fixed map (never user input); DocEntry is parameterised.
        var typeColumn = map.HasDocType ? "CAST(DocType AS nvarchar(1))" : "'I'";
        var header = await conn.QueryFirstOrDefaultAsync<HeaderRow>(new CommandDefinition(
            $"SELECT {typeColumn} AS DocType, DocNum, UpdateDate, UpdateTS FROM {map.Table} WHERE DocEntry = @docEntry",
            new { docEntry }, cancellationToken: ct));
        // Same choice SAP B1 makes: service documents use the "(Service)" layout type, everything else "(Items)".
        return (header, header?.DocType == "S" ? map.ServiceLayoutType : map.ItemLayoutType);
    }

    private async Task<IReadOnlyList<PrintLayout>> ListLayoutsAsync(SqlConnection conn, string layoutType, CancellationToken ct)
    {
        var key = $"layouts|{_company.CompanyCode}|{layoutType}";
        if (Cache.TryGetValue(key, out IReadOnlyList<PrintLayout>? cached) && cached is not null) return cached;

        var rows = await conn.QueryAsync<(string Code, string Name, int IsDefault)>(new CommandDefinition(
            @"SELECT d.DocCode AS Code, d.DocName AS Name,
                     CASE WHEN d.DocCode = t.DEFLT_REP THEN 1 ELSE 0 END AS IsDefault
              FROM RDOC d
              LEFT JOIN RTYP t ON t.CODE = d.TypeCode
              WHERE d.TypeCode = @layoutType AND d.Category = 'C' AND d.Status = 'A' AND DATALENGTH(d.Template) > 0
              ORDER BY IsDefault DESC, d.DocName, d.DocCode",
            new { layoutType }, cancellationToken: ct));
        var list = rows.Select(r => new PrintLayout(r.Code, r.Name, r.IsDefault == 1)).ToList();
        Cache.Set(key, list, new MemoryCacheEntryOptions { Size = 1, AbsoluteExpirationRelativeToNow = ListTtl });
        return list;
    }

    public async Task<PrintLayoutsResult> GetLayoutsAsync(string documentType, int docEntry, CancellationToken ct = default)
    {
        if (!Map.TryGetValue(documentType, out var map))
            return new PrintLayoutsResult { Failure = PrintFailure.UnknownDocumentType };

        using var conn = (SqlConnection)_connections.CreateConnection();
        await conn.OpenAsync(ct);
        var (header, layoutType) = await ReadHeaderAsync(conn, map, docEntry, ct);
        if (header is null) return new PrintLayoutsResult { Failure = PrintFailure.DocumentNotFound };

        var layouts = await ListLayoutsAsync(conn, layoutType, ct);
        return new PrintLayoutsResult
        {
            Success = true,
            Failure = layouts.Count == 0 ? PrintFailure.NoLayoutConfigured : PrintFailure.None,
            Layouts = layouts
        };
    }

    public async Task<PrintResult> PrintDocumentAsync(string documentType, int docEntry, string? layoutCode = null, CancellationToken ct = default)
    {
        if (!Map.TryGetValue(documentType, out var map))
            return Fail(PrintFailure.UnknownDocumentType, documentType, docEntry);

        // The connection comes from the JWT company (ICompanyConnectionFactory). Read its string BEFORE
        // opening: SqlClient strips the password from ConnectionString once the connection is open.
        using var conn = (SqlConnection)_connections.CreateConnection();
        var connectionString = conn.ConnectionString;
        await conn.OpenAsync(ct);

        var (header, layoutType) = await ReadHeaderAsync(conn, map, docEntry, ct);
        if (header is null)
            return Fail(PrintFailure.DocumentNotFound, documentType, docEntry);

        // Only a Crystal layout of THIS document's layout type is accepted; no code => SAP B1's default.
        var layouts = await ListLayoutsAsync(conn, layoutType, ct);
        var chosen = string.IsNullOrWhiteSpace(layoutCode)
            ? layouts.FirstOrDefault(l => l.IsDefault)
            : layouts.FirstOrDefault(l => string.Equals(l.Code, layoutCode, StringComparison.OrdinalIgnoreCase));
        if (chosen is null)
        {
            _logger.LogInformation("No usable Crystal layout for {Type} (layout type {LayoutType}, requested {Layout}) in company {Company}", documentType, layoutType, layoutCode ?? "default", _company.CompanyCode);
            return Fail(PrintFailure.NoLayoutConfigured, documentType, docEntry);
        }

        var stamp = $"{header.UpdateDate?.Ticks}.{header.UpdateTS}";
        var pdfKey = $"pdf|{_company.CompanyCode}|{documentType}|{docEntry}|{chosen.Code}|{stamp}";
        byte[]? pdf = Cache.TryGetValue(pdfKey, out byte[]? hit) ? hit : null;

        if (pdf is null)
        {
            Lazy<Task<byte[]?>> work;
            lock (InFlight)
            {
                if (!InFlight.TryGetValue(pdfKey, out work!))
                {
                    // CancellationToken.None: a shared render must not die because one of its callers navigated away.
                    work = new Lazy<Task<byte[]?>>(() => RenderToCacheAsync(pdfKey, chosen.Code, docEntry, map.ObjectId, connectionString));
                    InFlight[pdfKey] = work;
                }
            }
            pdf = await work.Value.WaitAsync(ct);
        }

        if (pdf is null)
            return Fail(PrintFailure.RenderFailed, documentType, docEntry, chosen.Name);

        return new PrintResult
        {
            Success = true,
            Content = pdf,
            FileName = $"{map.FileLabel}-{header.DocNum}.pdf",
            ReportName = chosen.Name,
            DocumentType = documentType,
            DocEntry = docEntry
        };
    }

    private async Task<byte[]?> RenderToCacheAsync(string pdfKey, string layoutCode, int dockey, int objectId, string connectionString)
    {
        try
        {
            var template = await GetTemplateAsync(layoutCode, connectionString);
            if (template is null) return null;
            var pdf = await RenderAsync(template, dockey, objectId, connectionString);
            if (pdf is not null)
                Cache.Set(pdfKey, pdf, new MemoryCacheEntryOptions { Size = pdf.Length, AbsoluteExpirationRelativeToNow = PdfTtl });
            return pdf;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Render failed for company {Company}", _company.CompanyCode);
            return null;
        }
        finally
        {
            lock (InFlight) InFlight.Remove(pdfKey);
        }
    }

    private async Task<byte[]?> GetTemplateAsync(string layoutCode, string connectionString)
    {
        var key = $"rpt|{_company.CompanyCode}|{layoutCode}";
        if (Cache.TryGetValue(key, out byte[]? cached) && cached is not null) return cached;

        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync();
        var bytes = await conn.QueryFirstOrDefaultAsync<byte[]?>("SELECT Template FROM RDOC WHERE DocCode = @layoutCode AND Category = 'C'", new { layoutCode });
        if (bytes is null || bytes.Length == 0) return null;
        Cache.Set(key, bytes, new MemoryCacheEntryOptions { Size = bytes.Length, AbsoluteExpirationRelativeToNow = TemplateTtl });
        return bytes;
    }

    private async Task<byte[]?> RenderAsync(byte[] template, int dockey, int objectId, string connectionString)
    {
        var exe = ResolveWorkerPath();
        if (exe is null)
        {
            _logger.LogError("SAPB1.PrintWorker.exe not found (configure PrintWorker:ExePath).");
            return null;
        }

        var timeout = TimeSpan.FromSeconds(_config.GetValue("PrintWorker:TimeoutSeconds", 90));
        var dir = Path.Combine(Path.GetTempPath(), "sapb1print", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        var rpt = Path.Combine(dir, "layout.rpt");
        var pdf = Path.Combine(dir, "out.pdf");

        await Gate.WaitAsync();
        try
        {
            await File.WriteAllBytesAsync(rpt, template);

            var psi = new ProcessStartInfo(exe)
            {
                RedirectStandardInput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var proc = Process.Start(psi)!;
            // Values go over stdin so the connection string never appears in a process command line.
            await proc.StandardInput.WriteLineAsync(rpt);
            await proc.StandardInput.WriteLineAsync(pdf);
            await proc.StandardInput.WriteLineAsync(dockey.ToString());
            await proc.StandardInput.WriteLineAsync(objectId.ToString());
            await proc.StandardInput.WriteLineAsync(connectionString);
            proc.StandardInput.Close();
            var stderr = proc.StandardError.ReadToEndAsync();

            using var cts = new CancellationTokenSource(timeout);
            try
            {
                await proc.WaitForExitAsync(cts.Token);
            }
            catch (OperationCanceledException)
            {
                try { proc.Kill(entireProcessTree: true); } catch { /* already gone */ }
                _logger.LogError("Print worker timed out after {Seconds}s for company {Company}", timeout.TotalSeconds, _company.CompanyCode);
                return null;
            }

            if (proc.ExitCode != 0 || !File.Exists(pdf))
            {
                // Detail stays in the server log only; the client gets a generic message.
                _logger.LogError("Print worker failed (exit {Code}) for company {Company}: {Detail}", proc.ExitCode, _company.CompanyCode, await stderr);
                return null;
            }
            return await File.ReadAllBytesAsync(pdf);
        }
        finally
        {
            Gate.Release();
            try { Directory.Delete(dir, true); } catch { /* best effort */ }
        }
    }

    private string? ResolveWorkerPath()
    {
        var configured = _config["PrintWorker:ExePath"];
        if (!string.IsNullOrWhiteSpace(configured)) return File.Exists(configured) ? configured : null;

        // Dev default: sibling project's build output, found by walking up from the API's base directory.
        for (var d = new DirectoryInfo(AppContext.BaseDirectory); d is not null; d = d.Parent)
        {
            foreach (var cfg in new[] { "Release", "Debug" })
            {
                var candidate = Path.Combine(d.FullName, "SAPB1.PrintWorker", "bin", cfg, "net48", "SAPB1.PrintWorker.exe");
                if (File.Exists(candidate)) return candidate;
            }
        }
        return null;
    }

    private static PrintResult Fail(PrintFailure f, string type, int docEntry, string report = "") =>
        new() { Success = false, Failure = f, DocumentType = type, DocEntry = docEntry, ReportName = report };
}
