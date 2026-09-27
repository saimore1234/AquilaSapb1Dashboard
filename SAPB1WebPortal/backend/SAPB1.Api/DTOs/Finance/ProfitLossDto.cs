namespace SAPB1.Api.DTOs.Finance;

public class ProfitLossAccountDto
{
    public string AcctCode { get; set; } = string.Empty;
    public string AcctName { get; set; } = string.Empty;
    public decimal Amount { get; set; }
}

/// <summary>
/// Revenue/COGS/Operating-Expense/Other-Income/Other-Expense classification is
/// derived from each account's real chart-of-accounts ancestry — accounts
/// under a "Direct Income"/"Sales" group are Revenue, "Direct Expense" is
/// COGS, "Indirect Income" is Other Income, "Indirect Expense" is Operating
/// Expenses — falling back to the coarse Revenue/Expense root "drawer" when an
/// account isn't nested under one of those named sub-groups. See
/// SqlFinanceService class docs.
/// </summary>
public class ProfitLossDto
{
    public DateTime DateFrom { get; set; }
    public DateTime DateTo { get; set; }

    public List<ProfitLossAccountDto> Revenue { get; set; } = new();
    public decimal TotalRevenue { get; set; }

    public List<ProfitLossAccountDto> CostOfGoodsSold { get; set; } = new();
    public decimal TotalCostOfGoodsSold { get; set; }

    public decimal GrossProfit { get; set; }
    /// <summary>GrossProfit / TotalRevenue * 100, 0 when TotalRevenue is 0.</summary>
    public double GrossMarginPercent { get; set; }

    public List<ProfitLossAccountDto> OperatingExpenses { get; set; } = new();
    public decimal TotalOperatingExpenses { get; set; }

    public decimal OperatingProfit { get; set; }

    public List<ProfitLossAccountDto> OtherIncome { get; set; } = new();
    public decimal TotalOtherIncome { get; set; }

    public List<ProfitLossAccountDto> OtherExpenses { get; set; } = new();
    public decimal TotalOtherExpenses { get; set; }

    public decimal NetProfit { get; set; }
    public double NetMarginPercent { get; set; }
}
