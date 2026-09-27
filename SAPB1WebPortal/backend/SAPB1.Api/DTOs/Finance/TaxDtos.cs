namespace SAPB1.Api.DTOs.Finance;

/// <summary>Tax activity for one tax code, aggregated from the actual invoice
/// line tax fields this project already relies on elsewhere (INV1/PCH1
/// TaxCode + VatSum) — SAP B1's dedicated tax-group master table (OVTG) is
/// empty in every configured company here, so the tax code's rate/name are
/// shown only when OVTG does have a matching row; otherwise the raw code is
/// shown as-is. See SqlFinanceService class docs.</summary>
public class TaxByCodeDto
{
    public string TaxCode { get; set; } = string.Empty;
    public string? TaxCodeName { get; set; }
    public double? TaxRate { get; set; }
    public decimal TaxableAmount { get; set; }
    public decimal TaxAmount { get; set; }
}

public class TaxByPeriodDto
{
    public string Period { get; set; } = string.Empty;
    public decimal OutputTax { get; set; }
    public decimal InputTax { get; set; }
}

public class TaxSummaryDto
{
    public DateTime DateFrom { get; set; }
    public DateTime DateTo { get; set; }

    public decimal TaxableSales { get; set; }
    public decimal OutputTax { get; set; }
    public decimal TaxablePurchases { get; set; }
    public decimal InputTax { get; set; }
    /// <summary>OutputTax - InputTax.</summary>
    public decimal NetTax { get; set; }

    public List<TaxByCodeDto> SalesTaxByCode { get; set; } = new();
    public List<TaxByCodeDto> PurchaseTaxByCode { get; set; } = new();
    public List<TaxByPeriodDto> TaxByMonth { get; set; } = new();
}
