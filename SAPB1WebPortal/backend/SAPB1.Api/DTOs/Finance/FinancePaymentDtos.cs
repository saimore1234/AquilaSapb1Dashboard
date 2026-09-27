namespace SAPB1.Api.DTOs.Finance;

/// <summary>Incoming Payment (SAP B1: ORCT) for the Finance module's own field
/// set (Reference, Bank/Cash account, Applied Invoice Count) — deliberately
/// separate from ISalesService's OutgoingPaymentDto, which doesn't carry these
/// fields; see SqlFinanceService class docs for why this isn't shared code.</summary>
public class FinanceIncomingPaymentDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public DateTime PostingDate { get; set; }
    public string? Currency { get; set; }
    public decimal Amount { get; set; }
    public string PaymentMethod { get; set; } = string.Empty;
    public string? BankOrCash { get; set; }
    public string? Reference { get; set; }
    public int AppliedInvoiceCount { get; set; }
}

public class FinanceInvoiceApplicationDto
{
    public int InvoiceDocEntry { get; set; }
    public int InvoiceDocNum { get; set; }
    public decimal AmountApplied { get; set; }
}

public class FinanceIncomingPaymentDetailDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public DateTime PostingDate { get; set; }
    public string? Currency { get; set; }
    public decimal Amount { get; set; }
    public decimal CashAmount { get; set; }
    public decimal BankAmount { get; set; }
    public decimal TransferAmount { get; set; }
    public List<FinanceInvoiceApplicationDto> AppliedInvoices { get; set; } = new();
}

/// <summary>Outgoing Payment (SAP B1: OVPM, DocType='S') for the Finance module's field set.</summary>
public class FinanceOutgoingPaymentDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public string VendorCode { get; set; } = string.Empty;
    public string? VendorName { get; set; }
    public DateTime PostingDate { get; set; }
    public string? Currency { get; set; }
    public decimal Amount { get; set; }
    public string PaymentMethod { get; set; } = string.Empty;
    public string? BankOrCash { get; set; }
    public string? Reference { get; set; }
    public int AppliedInvoiceCount { get; set; }
}

public class FinanceOutgoingPaymentDetailDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public string VendorCode { get; set; } = string.Empty;
    public string? VendorName { get; set; }
    public DateTime PostingDate { get; set; }
    public string? Currency { get; set; }
    public decimal Amount { get; set; }
    public decimal CashAmount { get; set; }
    public decimal BankAmount { get; set; }
    public decimal TransferAmount { get; set; }
    public List<FinanceInvoiceApplicationDto> AppliedInvoices { get; set; } = new();
}
