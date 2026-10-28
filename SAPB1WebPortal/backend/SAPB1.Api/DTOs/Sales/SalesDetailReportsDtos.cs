namespace SAPB1.Api.DTOs.Sales;

/// <summary>
/// Shared filter for the line-level / ledger reports. Every field is optional and validated server-side; dates are
/// date-only and inclusive (the SQL uses DocDate &gt;= From AND DocDate &lt; To + 1 day). A report only reads the fields
/// that make sense for it (e.g. Customer ledger balances ignore the product category).
/// </summary>
public class DetailReportQuery
{
    public DateTime? DateFrom { get; set; }
    public DateTime? DateTo { get; set; }
    /// <summary>Warehouse code (OWHS.WhsCode).</summary>
    public string? Warehouse { get; set; }
    /// <summary>Unit = invoice/order line location (OLCT.Code).</summary>
    public int? Unit { get; set; }
    /// <summary>Branch (OBPL.BPLId).</summary>
    public int? Branch { get; set; }
    public int? Salesperson { get; set; }
    public string? Customer { get; set; }
    public int? CustomerGroup { get; set; }
    /// <summary>Trading | Manufacturing | Ring | Emerson Trading | NA (from OITM query groups 1-4).</summary>
    public string? ProductCategory { get; set; }
    /// <summary>Item code or description fragment.</summary>
    public string? Item { get; set; }
    /// <summary>Sales Register only: all | invoice | creditmemo.</summary>
    public string? DocType { get; set; }
    /// <summary>Customers report: free-text search over code and name.</summary>
    public string? Search { get; set; }
    /// <summary>Customers report: only customers created this financial quarter.</summary>
    public bool NewThisQuarter { get; set; }
    /// <summary>Sales analysis: include tax in the amounts (DocTotal) or exclude it (DocTotal - VatSum).</summary>
    public bool IncludeTax { get; set; }
    /// <summary>Open sales orders: ignore the order-date period and list every open line.</summary>
    public bool AllDates { get; set; }
    /// <summary>Net of credit notes (default true). False = A/R invoice lines only.</summary>
    public bool NetOfCreditNotes { get; set; } = true;
    /// <summary>Several unit/location codes at once (the Turnover section's selection); lines with no location are kept.</summary>
    public int[]? Locations { get; set; }
    /// <summary>Sales analysis grouping: month | salesperson | customer | item.</summary>
    public string? By { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 25;
}

public class ReportFilterOptionsDto
{
    public List<TurnoverOptionDto> Units { get; set; } = new();
    public List<TurnoverOptionDto> Branches { get; set; } = new();
    public List<TurnoverOptionDto> CustomerGroups { get; set; } = new();
    public List<SalespersonOptionDto> Salespersons { get; set; } = new();
    public List<WarehouseOptionDto> Warehouses { get; set; } = new();
    public List<string> ProductCategories { get; set; } = new();
}

public class WarehouseOptionDto
{
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
}

// ------------------------------------------------------------------ Open Sales Orders (client line definition)
public class OpenSalesOrderLineDto
{
    /// <summary>Item master user-defined field "Aroma Code" (OITM.U_AromaCode).</summary>
    public string? AromaCode { get; set; }
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public DateTime PostingDate { get; set; }
    public DateTime? DueDate { get; set; }
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public string? ItemCode { get; set; }
    public string? ItemDescription { get; set; }
    public string? ProductCategory { get; set; }
    public string? WarehouseCode { get; set; }
    public string? Warehouse { get; set; }
    public string? Unit { get; set; }
    public string? Salesperson { get; set; }
    public decimal OrderedQuantity { get; set; }
    public decimal OpenQuantity { get; set; }
    public decimal UnitPrice { get; set; }
    /// <summary>Full line total (the client's open-line value) — NOT reduced for the delivered part.</summary>
    public decimal LineTotal { get; set; }
    public string DocumentStatus { get; set; } = string.Empty;
    public string LineStatus { get; set; } = string.Empty;
    /// <summary>ETA from production exactly as entered on the order line (free text, e.g. "15 Working Days"); null when not entered.</summary>
    public string? EtaProduction { get; set; }
    /// <summary>Days from the order date to today (the day the report is run).</summary>
    public int DaysOpen { get; set; }
}

public class OpenOrderTotalsDto
{
    public int OpenLines { get; set; }
    public int DistinctOrders { get; set; }
    public decimal OrderedQuantity { get; set; }
    public decimal OpenQuantity { get; set; }
    public decimal LineTotal { get; set; }
}

public class OpenSalesOrderReportDto
{
    public DateTime DateFrom { get; set; }
    public DateTime DateTo { get; set; }
    public OpenOrderTotalsDto Totals { get; set; } = new();
    public int TotalCount { get; set; }
    public List<OpenSalesOrderLineDto> Rows { get; set; } = new();
}

// ------------------------------------------------------------------ Open Purchase Orders
public class OpenPurchaseOrderLineDto
{
    public string? AromaCode { get; set; }
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public DateTime PostingDate { get; set; }
    public DateTime? DueDate { get; set; }
    public string VendorCode { get; set; } = string.Empty;
    public string? VendorName { get; set; }
    public string? ItemCode { get; set; }
    public string? ItemDescription { get; set; }
    public string? WarehouseCode { get; set; }
    public string? Warehouse { get; set; }
    public decimal OrderedQuantity { get; set; }
    public decimal OpenQuantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal LineTotal { get; set; }
    public string DocumentStatus { get; set; } = string.Empty;
}

public class OpenPurchaseOrderReportDto
{
    public DateTime DateFrom { get; set; }
    public DateTime DateTo { get; set; }
    public OpenOrderTotalsDto Totals { get; set; } = new();
    public int TotalCount { get; set; }
    public List<OpenPurchaseOrderLineDto> Rows { get; set; } = new();
}

// ------------------------------------------------------------------ Sales Register (invoice lines minus credit-memo lines)
public class SalesRegisterRowDto
{
    public string? AromaCode { get; set; }
    public string DocType { get; set; } = string.Empty;       // "A/R Invoice" | "A/R Credit Memo"
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public DateTime PostingDate { get; set; }
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public string? CustomerGroup { get; set; }
    public string? Salesperson { get; set; }                  // document header
    public string? ItemCode { get; set; }
    public string? ItemDescription { get; set; }
    public string? ProductCategory { get; set; }
    public string? Warehouse { get; set; }
    public string? Unit { get; set; }                         // line location
    public decimal Quantity { get; set; }                     // credit memos negative
    public decimal Rate { get; set; }
    public decimal BasicAmount { get; set; }                  // line total, before header discount (credit memos negative)
    public decimal NetSales { get; set; }                     // the reconciled "client basis" amount, excl. tax
    public decimal TaxAmount { get; set; }
    public decimal NetSalesInclTax { get; set; }
    // Dispatch details — invoice rows only (credit memos leave these blank)
    public string? LrNo { get; set; }
    public DateTime? LrDate { get; set; }
    public string? Transporter { get; set; }
    public DateTime? OrderDate { get; set; }
    /// <summary>Days from the order date to the invoice date; null when the invoice has no linked sales order.</summary>
    public int? DaysOrderToInvoice { get; set; }
}

public class SalesRegisterTotalsDto
{
    public int Lines { get; set; }
    public decimal Quantity { get; set; }
    public decimal BasicAmount { get; set; }
    public decimal NetSales { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal NetSalesInclTax { get; set; }
}

public class SalesRegisterReportDto
{
    public DateTime DateFrom { get; set; }
    public DateTime DateTo { get; set; }
    public SalesRegisterTotalsDto Totals { get; set; } = new();
    public int TotalCount { get; set; }
    public List<SalesRegisterRowDto> Rows { get; set; } = new();
}

// ------------------------------------------------------------------ Total Outstanding (client ageing, journal based, as of a date)
public class LedgerOutstandingQuery
{
    /// <summary>The "as of" date (the dashboard's To Date).</summary>
    public DateTime? AsOf { get; set; }
    public string? Customer { get; set; }
    public int? Branch { get; set; }
    /// <summary>Dashboard unit (OLCT.Code). Resolved on the server to its mapped SAP branch; ignored when Branch is given.</summary>
    public int? Unit { get; set; }
    /// <summary>Customer master group (OCRD.GroupCode).</summary>
    public int? CustomerGroup { get; set; }
    /// <summary>The customer's ASSIGNED salesperson (OCRD.SlpCode) — the same one the client's ageing report shows.</summary>
    public int? Salesperson { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 25;
}

public class OutstandingBranchDto
{
    public int? BranchCode { get; set; }
    public string Branch { get; set; } = string.Empty;
    public decimal Amount { get; set; }
}

public class OutstandingBucketDto
{
    public string Label { get; set; } = string.Empty;
    public decimal Amount { get; set; }
}

public class OutstandingCustomerDto
{
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public string? SalesPerson { get; set; }
    public decimal Balance { get; set; }
    public decimal Days0To30 { get; set; }
    public decimal Days31To60 { get; set; }
    public decimal Days61To90 { get; set; }
    public decimal Days91To120 { get; set; }
    public decimal Days121To150 { get; set; }
    public decimal Days151To180 { get; set; }
    public decimal Days181To210 { get; set; }
    public decimal Days211Plus { get; set; }
    /// <summary>Days from the due date to the As-on date for the customer's OLDEST open (owed) item; null when nothing is owed.</summary>
    public int? OverdueDays { get; set; }
}

public class OutstandingLedgerDto
{
    public DateTime AsOf { get; set; }
    /// <summary>false when the selected unit has no valid SAP branch mapping: nothing is calculated and Note says why.</summary>
    public bool Available { get; set; } = true;
    public string? Note { get; set; }
    public string? UnitLabel { get; set; }
    public decimal TotalOutstanding { get; set; }
    public int CustomerCount { get; set; }
    public List<OutstandingBranchDto> ByBranch { get; set; } = new();
    public List<OutstandingBucketDto> Ageing { get; set; } = new();
    public int TotalCount { get; set; }
    public List<OutstandingCustomerDto> Customers { get; set; } = new();
    /// <summary>The old portal figure (unpaid invoices, DocTotal - PaidToDate, as of TODAY) — shown for reconciliation only.</summary>
    public decimal UnpaidInvoicesToday { get; set; }
    /// <summary>Balance of customers WITHOUT a default bill-to address: included in the total above, but dropped by the client's own ageing report.</summary>
    public decimal NoBillToBalance { get; set; }
    public int NoBillToCustomers { get; set; }
}

public class OutstandingLineDto
{
    public int TransId { get; set; }
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public string? Branch { get; set; }
    public DateTime PostingDate { get; set; }
    public DateTime? DueDate { get; set; }
    public int TransType { get; set; }
    public string? DocumentType { get; set; }
    public string? BaseRef { get; set; }
    public string? Ref1 { get; set; }
    public int DaysOutstanding { get; set; }
    /// <summary>Days from this item's due date to the As-on date (negative = not yet due); null without a due date.</summary>
    public int? OverdueDays { get; set; }
    public decimal Balance { get; set; }
}

public class OutstandingLinesReportDto
{
    public DateTime AsOf { get; set; }
    public decimal Total { get; set; }
    public int TotalCount { get; set; }
    public List<OutstandingLineDto> Rows { get; set; } = new();
}

// ------------------------------------------------------------------ Customers (the Total Customers tile)
public class CustomerRowDto
{
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public string? CustomerGroup { get; set; }
    public string? Salesperson { get; set; }
    public string? City { get; set; }
    public DateTime? CreatedDate { get; set; }
    /// <summary>Current account balance (OCRD.Balance) — a live figure, shown for information.</summary>
    public decimal Balance { get; set; }
}

public class CustomerTotalsDto
{
    public int Customers { get; set; }
    public int NewThisQuarter { get; set; }
    public DateTime QuarterStart { get; set; }
}

public class CustomerReportDto
{
    public CustomerTotalsDto Totals { get; set; } = new();
    public int TotalCount { get; set; }
    public List<CustomerRowDto> Rows { get; set; } = new();
}

// ------------------------------------------------------------------ Pending Invoices = open deliveries not yet invoiced
public class PendingDeliveryRowDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public DateTime PostingDate { get; set; }
    public DateTime? DueDate { get; set; }
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public string? Salesperson { get; set; }
    public string? Branch { get; set; }
    public int Lines { get; set; }
    public int DaysOpen { get; set; }
    public decimal DocTotal { get; set; }
}

public class PendingDeliveryTotalsDto
{
    public int Deliveries { get; set; }
    public decimal DocTotal { get; set; }
}

public class PendingDeliveryReportDto
{
    public PendingDeliveryTotalsDto Totals { get; set; } = new();
    public int TotalCount { get; set; }
    public List<PendingDeliveryRowDto> Rows { get; set; } = new();
}

// ------------------------------------------------------------------ Sales analysis (the dashboard charts, in full)
public class SalesAnalysisRowDto
{
    /// <summary>Only filled for the item grouping.</summary>
    public string? AromaCode { get; set; }
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int Invoices { get; set; }
    public decimal Quantity { get; set; }
    public decimal Value { get; set; }
    public decimal Percentage { get; set; }
}

public class SalesAnalysisTotalsDto
{
    public int Rows { get; set; }
    public int Invoices { get; set; }
    public decimal Quantity { get; set; }
    public decimal Value { get; set; }
}

public class SalesAnalysisReportDto
{
    public DateTime DateFrom { get; set; }
    public DateTime DateTo { get; set; }
    public string By { get; set; } = string.Empty;
    public bool IncludeTax { get; set; }
    public SalesAnalysisTotalsDto Totals { get; set; } = new();
    public int TotalCount { get; set; }
    public List<SalesAnalysisRowDto> Rows { get; set; } = new();
}

// ------------------------------------------------------------------ Customer Group -> Customer sales (combined report)
public class CustomerGroupSalesRowDto
{
    public int? GroupCode { get; set; }
    public string CustomerGroup { get; set; } = string.Empty;
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public decimal Value { get; set; }
    public int Documents { get; set; }
}

public class CustomerGroupSalesDto
{
    public DateTime DateFrom { get; set; }
    public DateTime DateTo { get; set; }
    public bool IncludeTax { get; set; }
    public bool NetOfCreditNotes { get; set; }
    public decimal Total { get; set; }
    public List<CustomerGroupSalesRowDto> Rows { get; set; } = new();
}

// ------------------------------------------------------------------ Outstanding Customer Invoices (payment status)
public class UnpaidInvoiceRowDto
{
    public int DocEntry { get; set; }
    public int DocNum { get; set; }
    public DateTime PostingDate { get; set; }
    public DateTime? DueDate { get; set; }
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public string? Salesperson { get; set; }
    public string? Branch { get; set; }
    public decimal DocTotal { get; set; }
    public decimal PaidToDate { get; set; }
    public decimal Balance { get; set; }
    /// <summary>Days past the due date; negative = not yet due.</summary>
    public int DaysOverdue { get; set; }
}

public class UnpaidInvoiceTotalsDto
{
    public int Invoices { get; set; }
    public decimal DocTotal { get; set; }
    public decimal PaidToDate { get; set; }
    public decimal Balance { get; set; }
    public decimal Overdue { get; set; }
}

public class UnpaidInvoiceReportDto
{
    public UnpaidInvoiceTotalsDto Totals { get; set; } = new();
    public int TotalCount { get; set; }
    public List<UnpaidInvoiceRowDto> Rows { get; set; } = new();
}

// ------------------------------------------------------------------ Lost Customer Analysis
public class LostCustomerQuery
{
    /// <summary>"2026-27"; default = the financial year of AsOf.</summary>
    public string? FinancialYear { get; set; }
    /// <summary>The as-of date (the selected To Date). The current year is measured up to this date.</summary>
    public DateTime? AsOf { get; set; }
    public int? Unit { get; set; }
    public int? CustomerGroup { get; set; }
    /// <summary>The customer's ASSIGNED salesperson (customer master).</summary>
    public int? Salesperson { get; set; }
    public decimal? MinPreviousSales { get; set; }
    public string? Search { get; set; }
    public bool IncludeTax { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 25;
}

public class LostCustomerRowDto
{
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public string? CustomerGroup { get; set; }
    public string? Salesperson { get; set; }
    public decimal PreviousYearSales { get; set; }
    public decimal CurrentYearSales { get; set; }
    public DateTime? LastSalesDate { get; set; }
    public int PreviousInvoiceLines { get; set; }
    public bool Frozen { get; set; }
}

public class LostCustomerSummaryDto
{
    /// <summary>Customers with A/R invoices in the previous year (the population the analysis starts from).</summary>
    public int PreviousYearCustomers { get; set; }
    public int LostCustomers { get; set; }
    public decimal LostPreviousSales { get; set; }
    public decimal PreviousYearSales { get; set; }
}

public class LostCustomerReportDto
{
    public string FinancialYear { get; set; } = string.Empty;
    public DateTime PreviousFrom { get; set; }
    public DateTime PreviousTo { get; set; }
    public DateTime CurrentFrom { get; set; }
    public DateTime CurrentTo { get; set; }
    public DateTime CurrentFyEnd { get; set; }
    /// <summary>False while the current financial year is still running: some "lost" customers may yet buy.</summary>
    public bool CurrentYearComplete { get; set; }
    public LostCustomerSummaryDto Summary { get; set; } = new();
    public int TotalCount { get; set; }
    public List<LostCustomerRowDto> Rows { get; set; } = new();
}

// ------------------------------------------------------------------ Order Execution (order date -> invoice date)
public class OrderExecutionRowDto
{
    public int OrderEntry { get; set; }
    public int OrderNo { get; set; }
    public DateTime OrderDate { get; set; }
    public string CustomerCode { get; set; } = string.Empty;
    public string? CustomerName { get; set; }
    public string? Salesperson { get; set; }
    public string? Branch { get; set; }
    /// <summary>Shown on the order's first row only, so an order with several invoices isn't counted several times.</summary>
    public decimal? OrderedQuantity { get; set; }
    public int? InvoiceNo { get; set; }
    public DateTime? InvoiceDate { get; set; }
    public decimal? InvoicedQuantity { get; set; }
    /// <summary>null when the order has no invoice ("Not invoiced").</summary>
    public int? DaysToInvoice { get; set; }
    /// <summary>Not invoiced | Partly invoiced | Fully invoiced</summary>
    public string Status { get; set; } = string.Empty;
}

public class OrderExecutionBucketDto
{
    public string Label { get; set; } = string.Empty;
    public int Orders { get; set; }
}

public class OrderExecutionSummaryDto
{
    public int Orders { get; set; }
    public int InvoicedOrders { get; set; }
    public int AwaitingInvoice { get; set; }
    /// <summary>Days from order date to the FIRST invoice, over orders that have been invoiced.</summary>
    public decimal? AverageDays { get; set; }
    public decimal? MedianDays { get; set; }
    public int? LongestDays { get; set; }
    public int? ShortestDays { get; set; }
    public List<OrderExecutionBucketDto> Buckets { get; set; } = new();
}

public class OrderExecutionReportDto
{
    public DateTime DateFrom { get; set; }
    public DateTime DateTo { get; set; }
    public OrderExecutionSummaryDto Summary { get; set; } = new();
    public int TotalCount { get; set; }
    public List<OrderExecutionRowDto> Rows { get; set; } = new();
}
