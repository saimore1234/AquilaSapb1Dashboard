namespace SAPB1.Api.DTOs.Finance;

public class FinanceByPeriodDto
{
    public string Period { get; set; } = string.Empty;
    public decimal Value { get; set; }
}

public class FinanceByPartnerDto
{
    public string Code { get; set; } = string.Empty;
    public string? Name { get; set; }
    public decimal Value { get; set; }
}

public class FinanceByAccountDto
{
    public string AcctCode { get; set; } = string.Empty;
    public string? AcctName { get; set; }
    public decimal Value { get; set; }
}

public class FinanceAnalyticsDto
{
    public List<FinanceByPeriodDto> RevenueTrend { get; set; } = new();
    public List<FinanceByPeriodDto> PurchaseTrend { get; set; } = new();
    public List<FinanceByPeriodDto> GrossProfitTrend { get; set; } = new();
    public List<FinanceByPeriodDto> NetProfitTrend { get; set; } = new();
    public List<FinanceByPeriodDto> ReceivablesTrend { get; set; } = new();
    public List<FinanceByPeriodDto> PayablesTrend { get; set; } = new();
    public List<FinanceByPeriodDto> CashFlow { get; set; } = new();
    public List<FinanceByPeriodDto> ExpenseTrend { get; set; } = new();
    public List<FinanceByPeriodDto> TaxTrend { get; set; } = new();
    public List<FinanceByPartnerDto> TopCustomersByRevenue { get; set; } = new();
    public List<FinanceByPartnerDto> TopVendorsByPurchase { get; set; } = new();
    public List<FinanceByAccountDto> TopExpenseAccounts { get; set; } = new();
}
