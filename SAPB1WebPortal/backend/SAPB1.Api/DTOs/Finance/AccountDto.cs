namespace SAPB1.Api.DTOs.Finance;

/// <summary>One SAP B1 G/L account (OACT), including the hierarchy fields
/// needed to render both a flat searchable table and a tree.</summary>
public class AccountDto
{
    public string AcctCode { get; set; } = string.Empty;
    public string AcctName { get; set; } = string.Empty;
    /// <summary>"Assets" | "Liabilities" | "Equity" | "Revenue" | "Expenses" | "Other" — derived
    /// by walking OACT.FatherNum up to its root "drawer" account and reading that
    /// root's own name (Asset/Liability/Equity/Revenue/Expenditure) — a genuine
    /// SAP B1 structural feature (every company's COA has exactly these 10 root
    /// accounts), not a hardcoded account-number guess. See SqlFinanceService.</summary>
    public string Classification { get; set; } = string.Empty;
    /// <summary>Immediate parent account's name, for the "Group" column.</summary>
    public string? GroupName { get; set; }
    public string? ParentCode { get; set; }
    public int Level { get; set; }
    /// <summary>True when this is a real postable (leaf) account rather than a title/group account.</summary>
    public bool Postable { get; set; }
    public bool Active { get; set; }
    public string? Currency { get; set; }
    /// <summary>OACT.CurrTotal — the same current-balance field SAP B1 itself shows in its Chart of Accounts.</summary>
    public decimal Balance { get; set; }
}
