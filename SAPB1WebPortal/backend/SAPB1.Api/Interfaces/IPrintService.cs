namespace SAPB1.Api.Interfaces;

public enum PrintFailure
{
    None,
    /// <summary>Unknown document type slug (not in the server-side allow-list).</summary>
    UnknownDocumentType,
    /// <summary>The DocEntry does not exist in the caller's company database.</summary>
    DocumentNotFound,
    /// <summary>SAP B1 has no Crystal layout configured as the default for this document type in this company.</summary>
    NoLayoutConfigured,
    /// <summary>A layout exists but could not be rendered (worker/Crystal/SQL failure).</summary>
    RenderFailed
}

public class PrintResult
{
    public bool Success { get; init; }
    public PrintFailure Failure { get; init; }
    public string ContentType { get; init; } = "application/pdf";
    public string FileName { get; init; } = string.Empty;
    public byte[] Content { get; init; } = Array.Empty<byte>();
    /// <summary>The SAP B1 layout name (RDOC.DocName) that was rendered.</summary>
    public string ReportName { get; init; } = string.Empty;
    public string DocumentType { get; init; } = string.Empty;
    public int DocEntry { get; init; }
}

/// <summary>
/// Renders a document using the layout ALREADY configured as default in the
/// caller's SAP B1 company (RTYP.DEFLT_REP to RDOC). Never builds its own
/// layout and never writes to SAP B1. The company always comes from the JWT.
/// </summary>
public interface ISapB1PrintService
{
    /// <summary>
    /// Renders the document. layoutCode = an RDOC.DocCode chosen from GetLayoutsAsync; null = the
    /// company's SAP B1 default layout for this document type. A layoutCode that is not a Crystal
    /// layout of this document's type is treated as NoLayoutConfigured.
    /// </summary>
    Task<PrintResult> PrintDocumentAsync(string documentType, int docEntry, string? layoutCode = null, CancellationToken ct = default);

    /// <summary>Every active Crystal layout SAP B1 holds for this document type in the caller's company (default first).</summary>
    Task<PrintLayoutsResult> GetLayoutsAsync(string documentType, int docEntry, CancellationToken ct = default);
}

public record PrintLayout(string Code, string Name, bool IsDefault);

public class PrintLayoutsResult
{
    public bool Success { get; init; }
    public PrintFailure Failure { get; init; }
    public IReadOnlyList<PrintLayout> Layouts { get; init; } = Array.Empty<PrintLayout>();
}
