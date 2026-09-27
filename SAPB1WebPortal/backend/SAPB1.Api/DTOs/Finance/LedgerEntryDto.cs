namespace SAPB1.Api.DTOs.Finance;

/// <summary>One General Ledger line (SAP B1: JDT1, joined to its OJDT header).</summary>
public class LedgerEntryDto
{
    public int TransId { get; set; }
    public int LineId { get; set; }
    public DateTime PostingDate { get; set; }
    public DateTime? DueDate { get; set; }
    public DateTime? TaxDate { get; set; }
    public string AccountCode { get; set; } = string.Empty;
    public string? AccountName { get; set; }
    public decimal Debit { get; set; }
    public decimal Credit { get; set; }
    /// <summary>Running balance for this account, computed within the currently
    /// filtered result set only (not the account's full unfiltered history) —
    /// clear the date filters to see the true cumulative balance.</summary>
    public decimal Balance { get; set; }
    public string? Reference { get; set; }
    public string? Memo { get; set; }
    /// <summary>Raw JDT1.DocType code — the originating document type, shown as-is
    /// since this installation's numbering could not be verified against real
    /// linked documents (see SqlFinanceService class docs).</summary>
    public string? DocumentType { get; set; }
    public int? DocumentNumber { get; set; }
    public string? BusinessPartnerCode { get; set; }
    public string? BusinessPartnerName { get; set; }
}
