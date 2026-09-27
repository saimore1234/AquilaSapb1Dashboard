using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SAPB1.Api.Auth;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Purchase;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Controllers;

/// <summary>
/// Purchase document chain (Request → Quotation → Order → GRPO → A/P Invoice →
/// A/P Credit Memo → Outgoing Payment) for whichever company the caller's JWT
/// is scoped to — see IPurchaseService/SqlPurchaseService. Read-only, with ONE
/// deliberate exception: POST requests (create a Purchase Request via the real
/// SAP B1 Service Layer — see IPurchaseRequestWriteService). No other write
/// operation exists here or anywhere else in the API.
/// </summary>
[ApiController]
[Route("api/purchase")]
// Role list relaxed to plain [Authorize] — see CustomersController for why.
[Authorize]
[RequirePermission("Purchase.View")]
public class PurchaseController : ControllerBase
{
    private readonly IPurchaseService _purchaseService;
    private readonly IPurchaseRequestWriteService _purchaseRequestWriteService;

    public PurchaseController(IPurchaseService purchaseService, IPurchaseRequestWriteService purchaseRequestWriteService)
    {
        _purchaseService = purchaseService;
        _purchaseRequestWriteService = purchaseRequestWriteService;
    }

    [HttpGet("dashboard")]
    public async Task<ActionResult<ApiResponse<PurchaseDashboardDto>>> GetDashboard(CancellationToken ct)
    {
        var result = await _purchaseService.GetDashboardAsync(ct);
        return Ok(ApiResponse<PurchaseDashboardDto>.Ok(result));
    }

    [HttpGet("analytics")]
    public async Task<ActionResult<ApiResponse<PurchaseAnalyticsDto>>> GetAnalytics(CancellationToken ct)
    {
        var result = await _purchaseService.GetAnalyticsAsync(ct);
        return Ok(ApiResponse<PurchaseAnalyticsDto>.Ok(result));
    }

    [HttpGet("requests")]
    public async Task<ActionResult<ApiResponse<PagedResult<PurchaseRequestDto>>>> GetRequests([FromQuery] PurchaseDocumentQuery query, CancellationToken ct)
    {
        var result = await _purchaseService.GetRequestsAsync(query, ct);
        return Ok(ApiResponse<PagedResult<PurchaseRequestDto>>.Ok(result));
    }

    [HttpGet("requests/{docEntry:int}")]
    public async Task<ActionResult<ApiResponse<PurchaseRequestDetailDto>>> GetRequest(int docEntry, CancellationToken ct)
    {
        var result = await _purchaseService.GetRequestByEntryAsync(docEntry, ct);
        if (result is null) return NotFound(ApiResponse<PurchaseRequestDetailDto>.Fail($"Purchase Request #{docEntry} was not found."));
        return Ok(ApiResponse<PurchaseRequestDetailDto>.Ok(result));
    }

    /// <summary>
    /// POST /api/purchase/requests — creates a real Purchase Request in SAP
    /// Business One via the Service Layer, for whichever company the caller's
    /// JWT is scoped to (never a client-supplied database). This is the only
    /// write endpoint in the entire API. See IPurchaseRequestWriteService for
    /// the full validate → SAP Service Layer → real DocEntry/DocNum flow, and
    /// why this never falls back to direct SQL.
    /// </summary>
    [HttpPost("requests")]
    [RequirePermission("Purchase.Create")]
    public async Task<ActionResult<ApiResponse<CreatePurchaseRequestResultDto>>> CreateRequest(
        [FromBody] CreatePurchaseRequestDto dto, CancellationToken ct)
    {
        try
        {
            var result = await _purchaseRequestWriteService.CreateAsync(dto, ct);
            return Ok(ApiResponse<CreatePurchaseRequestResultDto>.Ok(result, "Purchase Request created successfully in SAP Business One."));
        }
        catch (PurchaseRequestValidationException ex)
        {
            return BadRequest(ApiResponse<CreatePurchaseRequestResultDto>.Fail(ex.Message));
        }
        catch (SapServiceLayerBusinessException ex)
        {
            return BadRequest(ApiResponse<CreatePurchaseRequestResultDto>.Fail(ex.Message));
        }
        catch (SapServiceLayerNotConfiguredException ex)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, ApiResponse<CreatePurchaseRequestResultDto>.Fail(ex.Message));
        }
        catch (SapServiceLayerUnavailableException ex)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, ApiResponse<CreatePurchaseRequestResultDto>.Fail(ex.Message));
        }
    }

    [HttpGet("quotations")]
    public async Task<ActionResult<ApiResponse<PagedResult<PurchaseQuotationDto>>>> GetQuotations([FromQuery] PurchaseDocumentQuery query, CancellationToken ct)
    {
        var result = await _purchaseService.GetQuotationsAsync(query, ct);
        return Ok(ApiResponse<PagedResult<PurchaseQuotationDto>>.Ok(result));
    }

    [HttpGet("quotations/{docEntry:int}")]
    public async Task<ActionResult<ApiResponse<PurchaseQuotationDetailDto>>> GetQuotation(int docEntry, CancellationToken ct)
    {
        var result = await _purchaseService.GetQuotationByEntryAsync(docEntry, ct);
        if (result is null) return NotFound(ApiResponse<PurchaseQuotationDetailDto>.Fail($"Purchase Quotation #{docEntry} was not found."));
        return Ok(ApiResponse<PurchaseQuotationDetailDto>.Ok(result));
    }

    [HttpGet("orders")]
    public async Task<ActionResult<ApiResponse<PagedResult<PurchaseOrderDto>>>> GetOrders([FromQuery] PurchaseDocumentQuery query, CancellationToken ct)
    {
        var result = await _purchaseService.GetOrdersAsync(query, ct);
        return Ok(ApiResponse<PagedResult<PurchaseOrderDto>>.Ok(result));
    }

    [HttpGet("orders/{docEntry:int}")]
    public async Task<ActionResult<ApiResponse<PurchaseOrderDetailDto>>> GetOrder(int docEntry, CancellationToken ct)
    {
        var result = await _purchaseService.GetOrderByEntryAsync(docEntry, ct);
        if (result is null) return NotFound(ApiResponse<PurchaseOrderDetailDto>.Fail($"Purchase Order #{docEntry} was not found."));
        return Ok(ApiResponse<PurchaseOrderDetailDto>.Ok(result));
    }

    [HttpGet("grpo")]
    public async Task<ActionResult<ApiResponse<PagedResult<GrpoDto>>>> GetGrpos([FromQuery] PurchaseDocumentQuery query, CancellationToken ct)
    {
        var result = await _purchaseService.GetGrposAsync(query, ct);
        return Ok(ApiResponse<PagedResult<GrpoDto>>.Ok(result));
    }

    [HttpGet("grpo/{docEntry:int}")]
    public async Task<ActionResult<ApiResponse<GrpoDetailDto>>> GetGrpo(int docEntry, CancellationToken ct)
    {
        var result = await _purchaseService.GetGrpoByEntryAsync(docEntry, ct);
        if (result is null) return NotFound(ApiResponse<GrpoDetailDto>.Fail($"GRPO #{docEntry} was not found."));
        return Ok(ApiResponse<GrpoDetailDto>.Ok(result));
    }

    [HttpGet("invoices")]
    public async Task<ActionResult<ApiResponse<PagedResult<ApInvoiceDto>>>> GetInvoices([FromQuery] PurchaseDocumentQuery query, CancellationToken ct)
    {
        var result = await _purchaseService.GetInvoicesAsync(query, ct);
        return Ok(ApiResponse<PagedResult<ApInvoiceDto>>.Ok(result));
    }

    [HttpGet("invoices/{docEntry:int}")]
    public async Task<ActionResult<ApiResponse<ApInvoiceDetailDto>>> GetInvoice(int docEntry, CancellationToken ct)
    {
        var result = await _purchaseService.GetInvoiceByEntryAsync(docEntry, ct);
        if (result is null) return NotFound(ApiResponse<ApInvoiceDetailDto>.Fail($"A/P Invoice #{docEntry} was not found."));
        return Ok(ApiResponse<ApInvoiceDetailDto>.Ok(result));
    }

    [HttpGet("credit-memos")]
    public async Task<ActionResult<ApiResponse<PagedResult<ApCreditMemoDto>>>> GetCreditMemos([FromQuery] PurchaseDocumentQuery query, CancellationToken ct)
    {
        var result = await _purchaseService.GetCreditMemosAsync(query, ct);
        return Ok(ApiResponse<PagedResult<ApCreditMemoDto>>.Ok(result));
    }

    [HttpGet("credit-memos/{docEntry:int}")]
    public async Task<ActionResult<ApiResponse<ApCreditMemoDetailDto>>> GetCreditMemo(int docEntry, CancellationToken ct)
    {
        var result = await _purchaseService.GetCreditMemoByEntryAsync(docEntry, ct);
        if (result is null) return NotFound(ApiResponse<ApCreditMemoDetailDto>.Fail($"A/P Credit Memo #{docEntry} was not found."));
        return Ok(ApiResponse<ApCreditMemoDetailDto>.Ok(result));
    }

    [HttpGet("payments")]
    public async Task<ActionResult<ApiResponse<PagedResult<OutgoingPaymentDto>>>> GetPayments([FromQuery] PurchaseDocumentQuery query, CancellationToken ct)
    {
        var result = await _purchaseService.GetPaymentsAsync(query, ct);
        return Ok(ApiResponse<PagedResult<OutgoingPaymentDto>>.Ok(result));
    }

    [HttpGet("payments/{docEntry:int}")]
    public async Task<ActionResult<ApiResponse<OutgoingPaymentDetailDto>>> GetPayment(int docEntry, CancellationToken ct)
    {
        var result = await _purchaseService.GetPaymentByEntryAsync(docEntry, ct);
        if (result is null) return NotFound(ApiResponse<OutgoingPaymentDetailDto>.Fail($"Payment #{docEntry} was not found."));
        return Ok(ApiResponse<OutgoingPaymentDetailDto>.Ok(result));
    }
}
