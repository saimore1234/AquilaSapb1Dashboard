namespace SAPB1.Api.DTOs.Finance;

public class BalanceSheetAccountDto
{
    public string AcctCode { get; set; } = string.Empty;
    public string AcctName { get; set; } = string.Empty;
    public decimal Amount { get; set; }
}

/// <summary>
/// Asset/Liability/Equity classification comes from each account's real
/// chart-of-accounts root "drawer" (see AccountDto.Classification); the
/// Current-vs-Non-Current and Cash/Bank/A-R/Inventory sub-splits use the same
/// name/hierarchy heuristics as the Bank/Cash and Receivables logic — see
/// SqlFinanceService class docs for exactly how, and their honest limits.
/// </summary>
public class BalanceSheetDto
{
    public DateTime AsOfDate { get; set; }

    public List<BalanceSheetAccountDto> Cash { get; set; } = new();
    public List<BalanceSheetAccountDto> Bank { get; set; } = new();
    /// <summary>Informational only (from open OINV/OITW), NOT included in TotalAssets — see SqlFinanceService.GetBalanceSheetAsync for why.</summary>
    public decimal AccountsReceivable { get; set; }
    /// <summary>Informational only (from OITW), NOT included in TotalAssets — see SqlFinanceService.GetBalanceSheetAsync for why.</summary>
    public decimal Inventory { get; set; }
    public List<BalanceSheetAccountDto> OtherCurrentAssets { get; set; } = new();
    public List<BalanceSheetAccountDto> NonCurrentAssets { get; set; } = new();
    public decimal TotalAssets { get; set; }

    /// <summary>Informational only (from open OPCH), NOT included in TotalLiabilities — see SqlFinanceService.GetBalanceSheetAsync for why.</summary>
    public decimal AccountsPayable { get; set; }
    public decimal TaxLiabilities { get; set; }
    public List<BalanceSheetAccountDto> OtherCurrentLiabilities { get; set; } = new();
    public List<BalanceSheetAccountDto> NonCurrentLiabilities { get; set; } = new();
    public decimal TotalLiabilities { get; set; }

    public List<BalanceSheetAccountDto> Capital { get; set; } = new();
    public decimal RetainedEarnings { get; set; }
    /// <summary>Net Profit/Loss for the current fiscal year through AsOfDate — folded
    /// into Equity so the statement balances before year-end closing entries are posted, exactly as real accounting requires.</summary>
    public decimal CurrentYearResult { get; set; }
    public decimal TotalEquity { get; set; }

    public decimal TotalLiabilitiesAndEquity { get; set; }
    /// <summary>TotalAssets == TotalLiabilitiesAndEquity, to the cent.</summary>
    public bool IsBalanced { get; set; }
}
