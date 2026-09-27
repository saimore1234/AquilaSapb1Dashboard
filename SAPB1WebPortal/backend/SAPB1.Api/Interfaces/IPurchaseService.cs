using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Purchase;

namespace SAPB1.Api.Interfaces;

/// <summary>
/// Read-only access to the SAP B1 Purchase document chain (Request → Quotation
/// → Order → GRPO → A/P Invoice → A/P Credit Memo → Outgoing Payment), for the
/// company the current request is authenticated against (see
/// ICompanyConnectionFactory — every method here runs against that company,
/// never anything a client could choose per-request). No write operations —
/// see the class-level docs on the implementation for why.
/// </summary>
public interface IPurchaseService
{
    Task<PurchaseDashboardDto> GetDashboardAsync(CancellationToken ct = default);
    Task<PurchaseAnalyticsDto> GetAnalyticsAsync(CancellationToken ct = default);

    Task<PagedResult<PurchaseRequestDto>> GetRequestsAsync(PurchaseDocumentQuery query, CancellationToken ct = default);
    Task<PurchaseRequestDetailDto?> GetRequestByEntryAsync(int docEntry, CancellationToken ct = default);

    Task<PagedResult<PurchaseQuotationDto>> GetQuotationsAsync(PurchaseDocumentQuery query, CancellationToken ct = default);
    Task<PurchaseQuotationDetailDto?> GetQuotationByEntryAsync(int docEntry, CancellationToken ct = default);

    Task<PagedResult<PurchaseOrderDto>> GetOrdersAsync(PurchaseDocumentQuery query, CancellationToken ct = default);
    Task<PurchaseOrderDetailDto?> GetOrderByEntryAsync(int docEntry, CancellationToken ct = default);

    Task<PagedResult<GrpoDto>> GetGrposAsync(PurchaseDocumentQuery query, CancellationToken ct = default);
    Task<GrpoDetailDto?> GetGrpoByEntryAsync(int docEntry, CancellationToken ct = default);

    Task<PagedResult<ApInvoiceDto>> GetInvoicesAsync(PurchaseDocumentQuery query, CancellationToken ct = default);
    Task<ApInvoiceDetailDto?> GetInvoiceByEntryAsync(int docEntry, CancellationToken ct = default);

    Task<PagedResult<ApCreditMemoDto>> GetCreditMemosAsync(PurchaseDocumentQuery query, CancellationToken ct = default);
    Task<ApCreditMemoDetailDto?> GetCreditMemoByEntryAsync(int docEntry, CancellationToken ct = default);

    Task<PagedResult<OutgoingPaymentDto>> GetPaymentsAsync(PurchaseDocumentQuery query, CancellationToken ct = default);
    Task<OutgoingPaymentDetailDto?> GetPaymentByEntryAsync(int docEntry, CancellationToken ct = default);
}
