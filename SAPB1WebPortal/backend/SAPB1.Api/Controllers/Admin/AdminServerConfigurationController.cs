using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SAPB1.Api.Auth;
using SAPB1.Api.DTOs.Admin;
using SAPB1.Api.DTOs.Common;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Controllers.Admin;

/// <summary>
/// Database-driven SAP B1 server/company configuration (Administration → Server
/// / Company Configuration). Every action requires the matching
/// ServerConfiguration.* permission (see RequirePermissionAttribute) — the
/// portal Admin superuser always passes; no other role is granted any
/// ServerConfiguration.* permission by default (see
/// db/004_SeedServerConfigurationPermissions.sql), since this module holds SAP
/// and SQL credentials for every company. Never returns a password, encrypted
/// or plaintext.
/// </summary>
[ApiController]
[Route("api/admin/server-configurations")]
[Authorize]
public class AdminServerConfigurationController : ControllerBase
{
    private readonly IServerConfigurationService _service;

    public AdminServerConfigurationController(IServerConfigurationService service)
    {
        _service = service;
    }

    [HttpGet]
    [RequirePermission("ServerConfiguration.View")]
    public async Task<ActionResult<ApiResponse<List<ServerConfigurationListItemDto>>>> GetAll(CancellationToken ct)
    {
        var items = await _service.GetAllAsync(ct);
        return Ok(ApiResponse<List<ServerConfigurationListItemDto>>.Ok(items));
    }

    [HttpGet("{id:int}")]
    [RequirePermission("ServerConfiguration.View")]
    public async Task<ActionResult<ApiResponse<ServerConfigurationDetailDto>>> GetById(int id, CancellationToken ct)
    {
        var item = await _service.GetByIdAsync(id, ct);
        if (item is null) return NotFound(ApiResponse<ServerConfigurationDetailDto>.Fail("Server configuration not found."));
        return Ok(ApiResponse<ServerConfigurationDetailDto>.Ok(item));
    }

    [HttpPost]
    [RequirePermission("ServerConfiguration.Create")]
    public async Task<ActionResult<ApiResponse<object>>> Create([FromBody] CreateServerConfigurationDto dto, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.CompanyCode) || string.IsNullOrWhiteSpace(dto.CompanyName)
            || string.IsNullOrWhiteSpace(dto.SapCompanyDb) || string.IsNullOrWhiteSpace(dto.ServiceLayerUrl)
            || string.IsNullOrWhiteSpace(dto.SapUsername) || string.IsNullOrWhiteSpace(dto.SapPassword)
            || string.IsNullOrWhiteSpace(dto.SqlServer) || string.IsNullOrWhiteSpace(dto.SqlDatabase)
            || string.IsNullOrWhiteSpace(dto.SqlUsername) || string.IsNullOrWhiteSpace(dto.SqlPassword))
        {
            return BadRequest(ApiResponse<object>.Fail("Company code/name, SAP details, and SQL details (including both passwords) are required."));
        }

        try
        {
            var id = await _service.CreateAsync(dto, ct);
            return Ok(ApiResponse<object>.Ok(new { id }, "Server configuration created."));
        }
        catch (Exception ex) when (IsDuplicateKeyViolation(ex))
        {
            return BadRequest(ApiResponse<object>.Fail($"A configuration for company code '{dto.CompanyCode}' already exists."));
        }
    }

    [HttpPut("{id:int}")]
    [RequirePermission("ServerConfiguration.Edit")]
    public async Task<ActionResult<ApiResponse<object>>> Update(int id, [FromBody] UpdateServerConfigurationDto dto, CancellationToken ct)
    {
        var ok = await _service.UpdateAsync(id, dto, ct);
        if (!ok) return NotFound(ApiResponse<object>.Fail("Server configuration not found."));
        return Ok(ApiResponse<object>.Ok(new { }, "Server configuration updated."));
    }

    [HttpPost("{id:int}/enable")]
    [RequirePermission("ServerConfiguration.Edit")]
    public async Task<ActionResult<ApiResponse<object>>> Enable(int id, CancellationToken ct)
    {
        var ok = await _service.SetActiveAsync(id, true, ct);
        if (!ok) return NotFound(ApiResponse<object>.Fail("Server configuration not found."));
        return Ok(ApiResponse<object>.Ok(new { }, "Server configuration enabled."));
    }

    [HttpPost("{id:int}/disable")]
    [RequirePermission("ServerConfiguration.Edit")]
    public async Task<ActionResult<ApiResponse<object>>> Disable(int id, CancellationToken ct)
    {
        var ok = await _service.SetActiveAsync(id, false, ct);
        if (!ok) return NotFound(ApiResponse<object>.Fail("Server configuration not found."));
        return Ok(ApiResponse<object>.Ok(new { }, "Server configuration disabled."));
    }

    [HttpDelete("{id:int}")]
    [RequirePermission("ServerConfiguration.Delete")]
    public async Task<ActionResult<ApiResponse<object>>> Delete(int id, CancellationToken ct)
    {
        var ok = await _service.DeleteAsync(id, ct);
        if (!ok) return NotFound(ApiResponse<object>.Fail("Server configuration not found."));
        return Ok(ApiResponse<object>.Ok(new { }, "Server configuration deleted."));
    }

    /// <summary>Pre-save tests: the Administrator is still filling out the
    /// Add/Edit form, so the plaintext values come from the request body rather
    /// than an already-saved row.</summary>
    [HttpPost("test")]
    [RequirePermission("ServerConfiguration.TestConnection")]
    public async Task<ActionResult<ApiResponse<TestAllResultDto>>> TestForm([FromBody] TestConnectionDto dto, CancellationToken ct)
    {
        var result = await _service.TestAllAsync(null, dto, ct);
        return Ok(ApiResponse<TestAllResultDto>.Ok(result));
    }

    [HttpPost("test-sql")]
    [RequirePermission("ServerConfiguration.TestConnection")]
    public async Task<ActionResult<ApiResponse<TestConnectionResultDto>>> TestFormSql([FromBody] TestConnectionDto dto, CancellationToken ct)
    {
        var result = await _service.TestSqlAsync(null, dto, ct);
        return Ok(ApiResponse<TestConnectionResultDto>.Ok(result));
    }

    [HttpPost("test-sap")]
    [RequirePermission("ServerConfiguration.TestConnection")]
    public async Task<ActionResult<ApiResponse<TestConnectionResultDto>>> TestFormSap([FromBody] TestConnectionDto dto, CancellationToken ct)
    {
        var result = await _service.TestSapAsync(null, dto, ct);
        return Ok(ApiResponse<TestConnectionResultDto>.Ok(result));
    }

    [HttpPost("{id:int}/test-sql")]
    [RequirePermission("ServerConfiguration.TestConnection")]
    public async Task<ActionResult<ApiResponse<TestConnectionResultDto>>> TestSql(int id, CancellationToken ct)
    {
        var result = await _service.TestSqlAsync(id, null, ct);
        return Ok(ApiResponse<TestConnectionResultDto>.Ok(result));
    }

    [HttpPost("{id:int}/test-sap")]
    [RequirePermission("ServerConfiguration.TestConnection")]
    public async Task<ActionResult<ApiResponse<TestConnectionResultDto>>> TestSap(int id, CancellationToken ct)
    {
        var result = await _service.TestSapAsync(id, null, ct);
        return Ok(ApiResponse<TestConnectionResultDto>.Ok(result));
    }

    [HttpPost("{id:int}/test-all")]
    [RequirePermission("ServerConfiguration.TestConnection")]
    public async Task<ActionResult<ApiResponse<TestAllResultDto>>> TestAll(int id, CancellationToken ct)
    {
        var result = await _service.TestAllAsync(id, null, ct);
        return Ok(ApiResponse<TestAllResultDto>.Ok(result));
    }

    private static bool IsDuplicateKeyViolation(Exception ex) =>
        ex is Microsoft.Data.SqlClient.SqlException sqlEx && (sqlEx.Number == 2601 || sqlEx.Number == 2627);
}
