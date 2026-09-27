namespace SAPB1.Api.DTOs.Finance;

public class JournalEntryDto
{
    public int TransId { get; set; }
    public DateTime PostingDate { get; set; }
    public string? Reference { get; set; }
    public string? Memo { get; set; }
    /// <summary>Raw OJDT.TransType code — unverified against real linked documents
    /// in this installation, shown as-is rather than guessed. See SqlFinanceService.</summary>
    public string? Origin { get; set; }
    public int? DocumentNumber { get; set; }
    public decimal TotalDebit { get; set; }
    public decimal TotalCredit { get; set; }
}

public class JournalEntryLineDto
{
    public int LineId { get; set; }
    public string AccountCode { get; set; } = string.Empty;
    public string? AccountName { get; set; }
    public decimal Debit { get; set; }
    public decimal Credit { get; set; }
    public string? BusinessPartnerCode { get; set; }
    public string? BusinessPartnerName { get; set; }
    public string? LineMemo { get; set; }
    /// <summary>JDT1.ContraAct — the offsetting account SAP B1 recorded for this line, where available.</summary>
    public string? ContraAccount { get; set; }
    /// <summary>JDT1.Project — cost centre / distribution rule dimension, where used.</summary>
    public string? CostCenter { get; set; }
}

public class JournalEntryDetailDto
{
    public int TransId { get; set; }
    public DateTime PostingDate { get; set; }
    public DateTime? DueDate { get; set; }
    public DateTime? TaxDate { get; set; }
    public string? Reference { get; set; }
    public string? Reference2 { get; set; }
    public string? Memo { get; set; }
    public string? Origin { get; set; }
    public int? DocumentNumber { get; set; }

    public List<JournalEntryLineDto> Lines { get; set; } = new();

    public decimal TotalDebit { get; set; }
    public decimal TotalCredit { get; set; }
    /// <summary>TotalDebit - TotalCredit. A properly balanced journal entry always has this at 0.</summary>
    public decimal BalanceDifference { get; set; }
}
