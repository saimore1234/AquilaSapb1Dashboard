namespace SAPB1.Api.DTOs.Finance;

/// <summary>One bank or cash G/L account. SAP B1 has no single "bank balance"
/// table — this project's OACT.CashBox flag is unused (blank on every account
/// in this installation), so Bank vs Cash is identified by walking each
/// account's real chart-of-accounts hierarchy (whether it sits under a group
/// named like "Bank Accounts" / "Cash-in-Hand") together with its name and
/// ActType — see SqlFinanceService class docs for the exact rule and its
/// documented limits.</summary>
public class BankCashAccountDto
{
    public string AcctCode { get; set; } = string.Empty;
    public string AcctName { get; set; } = string.Empty;
    /// <summary>"Bank" | "Cash".</summary>
    public string Kind { get; set; } = string.Empty;
    public string? Currency { get; set; }
    /// <summary>Net Debit-Credit position before the report's DateFrom (0 when no DateFrom given).</summary>
    public decimal OpeningBalance { get; set; }
    public decimal Debit { get; set; }
    public decimal Credit { get; set; }
    public decimal ClosingBalance { get; set; }
}

public class BankCashSummaryDto
{
    public decimal CashBalance { get; set; }
    public decimal BankBalance { get; set; }
    public List<BankCashAccountDto> Accounts { get; set; } = new();
}
