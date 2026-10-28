using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SAPB1.Api.Auth;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.DTOs.Sales;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Controllers;

/// <summary>
/// Salesperson Targets. Convention-based page enforcement (PageAccessFilter) already maps these verbs on
/// /api/sales/targets to the page's View / Create / Edit / Delete rules; each action below also carries an
/// explicit [RequirePermission] so module-level grants are enforced too. Approve/Reject live on a separate
/// route (api/sales/target-approvals) so they need ONLY the explicit "Approve" permission rather than the
/// verb-derived Create/Edit one. The acting user is always the authenticated identity, never a request field.
/// </summary>
[ApiController]
[Route("api/sales/targets")]
[Authorize]
public class SalesTargetsController : ControllerBase
{
    private readonly ISalesTargetService _targets;

    public SalesTargetsController(ISalesTargetService targets) => _targets = targets;

    private string CurrentUser => User.Identity?.Name ?? "unknown";

    private ActionResult<ApiResponse<T>> Respond<T>(SalesTargetResult r, T? data = default) where T : class =>
        r.Ok ? Ok(ApiResponse<T>.Ok(data!)) : StatusCode(r.StatusCode, ApiResponse<T>.Fail(r.Message ?? "Request failed."));

    [HttpGet("options")]
    [RequirePermission("Sales", "targets", "View")]
    public async Task<ActionResult<ApiResponse<SalesTargetOptionsDto>>> GetOptions(CancellationToken ct) =>
        Ok(ApiResponse<SalesTargetOptionsDto>.Ok(await _targets.GetOptionsAsync(ct)));

    [HttpGet("items")]
    [RequirePermission("Sales", "targets", "View")]
    public async Task<ActionResult<ApiResponse<List<SalesTargetItemOptionDto>>>> SearchItems([FromQuery] string? search, [FromQuery] int limit = 50, [FromQuery] int offset = 0, [FromQuery] bool includeNonSales = false, CancellationToken ct = default) =>
        Ok(ApiResponse<List<SalesTargetItemOptionDto>>.Ok(await _targets.SearchItemsAsync(search, limit, offset, includeNonSales, ct)));

    [HttpGet]
    [RequirePermission("Sales", "targets", "View")]
    public async Task<ActionResult<ApiResponse<SalesTargetListDto>>> List([FromQuery] SalesTargetQuery query, CancellationToken ct) =>
        Ok(ApiResponse<SalesTargetListDto>.Ok(await _targets.ListAsync(query, ct)));

    /// <summary>Monthly / quarterly / annual actual vs approved target for one company, unit or salesperson.</summary>
    [HttpGet("performance")]
    [RequirePermission("Sales", "targets", "View")]
    public async Task<ActionResult<ApiResponse<TargetPerformanceDto>>> Performance([FromQuery] TargetPerformanceQuery query, CancellationToken ct) =>
        Ok(ApiResponse<TargetPerformanceDto>.Ok(await _targets.GetPerformanceAsync(query, ct)));

    [HttpGet("{id:int}")]
    [RequirePermission("Sales", "targets", "View")]
    public async Task<ActionResult<ApiResponse<SalesTargetDetailDto>>> Get(int id, [FromQuery] bool includeTax, CancellationToken ct)
    {
        var result = await _targets.GetAsync(id, includeTax, ct);
        return result is null
            ? NotFound(ApiResponse<SalesTargetDetailDto>.Fail("Target not found."))
            : Ok(ApiResponse<SalesTargetDetailDto>.Ok(result));
    }

    [HttpPost]
    [RequirePermission("Sales", "targets", "Create")]
    [BlockRestricted]
    public async Task<ActionResult<ApiResponse<int>>> Create([FromBody] SaveSalesTargetRequest request, CancellationToken ct)
    {
        var r = await _targets.CreateAsync(request, CurrentUser, ct);
        return r.Ok ? Ok(ApiResponse<int>.Ok(r.Id!.Value)) : StatusCode(r.StatusCode, ApiResponse<int>.Fail(r.Message ?? "Request failed."));
    }

    [HttpPut("{id:int}")]
    [RequirePermission("Sales", "targets", "Edit")]
    [BlockRestricted]
    public async Task<ActionResult<ApiResponse<int>>> Update(int id, [FromBody] SaveSalesTargetRequest request, CancellationToken ct)
    {
        var r = await _targets.UpdateAsync(id, request, CurrentUser, ct);
        return r.Ok ? Ok(ApiResponse<int>.Ok(id)) : StatusCode(r.StatusCode, ApiResponse<int>.Fail(r.Message ?? "Request failed."));
    }

    [HttpPut("{id:int}/submit")]
    [RequirePermission("Sales", "targets", "Edit")]
    [BlockRestricted]
    public async Task<ActionResult<ApiResponse<int>>> Submit(int id, CancellationToken ct)
    {
        var r = await _targets.SubmitAsync(id, CurrentUser, ct);
        return r.Ok ? Ok(ApiResponse<int>.Ok(id)) : StatusCode(r.StatusCode, ApiResponse<int>.Fail(r.Message ?? "Request failed."));
    }

    /// <summary>Starts a revision of an APPROVED target: creates a new Draft (the approved one stays live until the revision is approved).</summary>
    [HttpPost("{id:int}/revise")]
    [RequirePermission("Sales", "targets", "Create")]
    [BlockRestricted]
    public async Task<ActionResult<ApiResponse<int>>> Revise(int id, CancellationToken ct)
    {
        var r = await _targets.ReviseAsync(id, CurrentUser, ct);
        return r.Ok ? Ok(ApiResponse<int>.Ok(r.Id!.Value)) : StatusCode(r.StatusCode, ApiResponse<int>.Fail(r.Message ?? "Request failed."));
    }

    [HttpDelete("{id:int}")]
    [RequirePermission("Sales", "targets", "Delete")]
    [BlockRestricted]
    public async Task<ActionResult<ApiResponse<int>>> Delete(int id, CancellationToken ct)
    {
        var r = await _targets.DeleteAsync(id, CurrentUser, ct);
        return r.Ok ? Ok(ApiResponse<int>.Ok(id)) : StatusCode(r.StatusCode, ApiResponse<int>.Fail(r.Message ?? "Request failed."));
    }
}

/// <summary>Approve / reject. Separate route so only the explicit Approve permission applies.</summary>
[ApiController]
[Route("api/sales/target-approvals")]
[Authorize]
public class SalesTargetApprovalsController : ControllerBase
{
    private readonly ISalesTargetService _targets;

    public SalesTargetApprovalsController(ISalesTargetService targets) => _targets = targets;

    private string CurrentUser => User.Identity?.Name ?? "unknown";

    [HttpPost("{id:int}/approve")]
    [RequirePermission("Sales", "targets", "Approve")]
    [BlockRestricted]
    public async Task<ActionResult<ApiResponse<int>>> Approve(int id, [FromBody] ReviewSalesTargetRequest? body, CancellationToken ct)
    {
        var r = await _targets.ApproveAsync(id, body?.Remarks, CurrentUser, ct);
        return r.Ok ? Ok(ApiResponse<int>.Ok(id)) : StatusCode(r.StatusCode, ApiResponse<int>.Fail(r.Message ?? "Request failed."));
    }

    [HttpPost("{id:int}/reject")]
    [RequirePermission("Sales", "targets", "Approve")]
    [BlockRestricted]
    public async Task<ActionResult<ApiResponse<int>>> Reject(int id, [FromBody] ReviewSalesTargetRequest? body, CancellationToken ct)
    {
        var r = await _targets.RejectAsync(id, body?.Remarks, CurrentUser, ct);
        return r.Ok ? Ok(ApiResponse<int>.Ok(id)) : StatusCode(r.StatusCode, ApiResponse<int>.Fail(r.Message ?? "Request failed."));
    }
}
