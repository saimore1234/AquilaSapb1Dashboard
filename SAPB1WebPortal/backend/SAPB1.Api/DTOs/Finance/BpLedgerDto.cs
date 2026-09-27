namespace SAPB1.Api.DTOs.Finance;

/// <summary>Per-business-partner G/L activity summary (JDT1 grouped by ShortName,
/// joined to OCRD) over the requested date range.</summary>
public class BpLedgerDto
{
    public string BpCode { get; set; } = string.Empty;
    public string? BpName { get; set; }
    /// <summary>"Customer" | "Vendor" — from OCRD.CardType.</summary>
    public string Type { get; set; } = string.Empty;
    /// <summary>Net Debit-Credit position before the report's DateFrom (0 when no DateFrom given).</summary>
    public decimal OpeningBalance { get; set; }
    public decimal Debit { get; set; }
    public decimal Credit { get; set; }
    /// <summary>OpeningBalance + Debit - Credit.</summary>
    public decimal Balance { get; set; }
    public string? Currency { get; set; }
}
