using SAPB1.Api.DTOs.Common;

namespace SAPB1.Api.DTOs.Finance;

/// <summary>Chart of Accounts is bounded master data (hundreds, not millions,
/// of rows even for large companies) — this query still supports paging, but
/// with a much higher cap than the 200-row PagedRequest default so the
/// frontend's hierarchical tree view can request "everything" in one call.</summary>
public class ChartOfAccountsQuery
{
    private const int MaxPageSize = 2000;
    private int _pageSize = 1000;

    public int Page { get; set; } = 1;
    public int PageSize
    {
        get => _pageSize;
        set => _pageSize = value <= 0 ? 1000 : Math.Min(value, MaxPageSize);
    }
    public string? Search { get; set; }
    /// <summary>"Active" | "Inactive" — maps to OACT.Frozen.</summary>
    public bool? Active { get; set; }
    public int Skip => (Math.Max(Page, 1) - 1) * PageSize;
}

/// <summary>Query for GET /api/finance/ledger.</summary>
public class LedgerQuery : PagedRequest
{
    public DateTime? DateFrom { get; set; }
    public DateTime? DateTo { get; set; }
    public string? Account { get; set; }
    /// <summary>Business partner code (JDT1.ShortName).</summary>
    public string? BusinessPartner { get; set; }
    /// <summary>Raw JDT1.DocType code.</summary>
    public string? DocumentType { get; set; }
    /// <summary>"Debit" | "Credit" — restricts to lines with a non-zero value on that side.</summary>
    public string? DebitCredit { get; set; }
}

/// <summary>Query for GET /api/finance/journal-entries.</summary>
public class JournalEntryQuery : PagedRequest
{
    public DateTime? DateFrom { get; set; }
    public DateTime? DateTo { get; set; }
}

/// <summary>Query for GET /api/finance/bp-ledger.</summary>
public class BpLedgerQuery : PagedRequest
{
    public DateTime? DateFrom { get; set; }
    public DateTime? DateTo { get; set; }
    /// <summary>"Customer" | "Vendor" — maps to OCRD.CardType ('C'/'S').</summary>
    public string? PartnerType { get; set; }
    public string? BusinessPartner { get; set; }
}

/// <summary>Query for GET /api/finance/receivables and GET /api/finance/payables.</summary>
public class AgeingQuery : PagedRequest
{
    public DateTime? DateFrom { get; set; }
    public DateTime? DateTo { get; set; }
    public string? BusinessPartner { get; set; }
    public string? Status { get; set; }
    /// <summary>"Current" | "1-30" | "31-60" | "61-90" | "91-120" | "120+".</summary>
    public string? AgeingBucket { get; set; }
}

/// <summary>Query shared by the financial statement/report endpoints
/// (Trial Balance, Profit &amp; Loss, Tax) that report over a date range.</summary>
public class ReportPeriodQuery
{
    public DateTime? DateFrom { get; set; }
    public DateTime? DateTo { get; set; }
    public string? Account { get; set; }
    public string? AccountGroup { get; set; }
}
