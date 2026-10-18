using SAPB1.Api.DTOs.Sales;

namespace SAPB1.Api.Interfaces;

/// <summary>
/// Line-level and ledger reports that reproduce the client's own SAP queries. Read-only; scoped to the authenticated user's
/// company through ICompanyConnectionFactory; every filter is a typed SQL parameter.
/// </summary>
public interface ISalesDetailReportsService
{
    Task<ReportFilterOptionsDto> GetFilterOptionsAsync(CancellationToken ct = default);
    Task<OpenSalesOrderReportDto> GetOpenSalesOrderLinesAsync(DetailReportQuery query, CancellationToken ct = default);
    Task<OpenPurchaseOrderReportDto> GetOpenPurchaseOrderLinesAsync(DetailReportQuery query, CancellationToken ct = default);
    Task<SalesRegisterReportDto> GetSalesRegisterAsync(DetailReportQuery query, CancellationToken ct = default);
    Task<CustomerGroupSalesDto> GetCustomerGroupSalesAsync(DetailReportQuery query, CancellationToken ct = default);
    Task<UnpaidInvoiceReportDto> GetUnpaidInvoicesAsync(DetailReportQuery query, CancellationToken ct = default);
    Task<LostCustomerReportDto> GetLostCustomersAsync(LostCustomerQuery query, CancellationToken ct = default);
    Task<OrderExecutionReportDto> GetOrderExecutionAsync(DetailReportQuery query, CancellationToken ct = default);
    Task<CustomerReportDto> GetCustomersAsync(DetailReportQuery query, CancellationToken ct = default);
    Task<PendingDeliveryReportDto> GetPendingDeliveriesAsync(DetailReportQuery query, CancellationToken ct = default);
    Task<SalesAnalysisReportDto> GetSalesAnalysisAsync(DetailReportQuery query, CancellationToken ct = default);
    Task<OutstandingLedgerDto> GetLedgerOutstandingAsync(LedgerOutstandingQuery query, CancellationToken ct = default);
    Task<OutstandingLinesReportDto> GetLedgerOutstandingLinesAsync(LedgerOutstandingQuery query, CancellationToken ct = default);
}
