using System.Collections.Concurrent;
using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Caching.Memory;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Auth;

/// <summary>
/// Keeps the result of a read-only report for a few seconds so that many users opening the same screen at the same moment share ONE database query
/// instead of each running it. The cache key is company + the caller's salesperson scope + the full URL, so a salesperson login never receives
/// anything computed for a wider (or different) scope. It runs after authentication and permission checks, so a cached result is only ever returned
/// to a caller who is allowed to call the action. Concurrent identical requests wait for the first one rather than all hitting SAP.
/// Only successful (200) responses are kept.
/// </summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class ShortCacheAttribute : Attribute, IAsyncActionFilter
{
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> Gates = new();
    private readonly int _seconds;

    public ShortCacheAttribute(int seconds = 30) => _seconds = seconds;

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var http = context.HttpContext;
        if (!HttpMethods.IsGet(http.Request.Method)) { await next(); return; }

        var cache = http.RequestServices.GetRequiredService<IMemoryCache>();
        var scope = http.RequestServices.GetRequiredService<ISalesScope>().Current;
        var key = string.Join('|', "sc", http.User.FindFirstValue(AppClaimTypes.CompanyDb) ?? "", scope.Restricted ? "R" : "A",
            string.Join(',', scope.SlpCodes.OrderBy(x => x)), http.Request.Path.Value, http.Request.QueryString.Value);

        if (cache.TryGetValue(key, out ObjectResult? hit) && hit is not null) { context.Result = hit; return; }

        var gate = Gates.GetOrAdd(key, _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(http.RequestAborted);
        try
        {
            if (cache.TryGetValue(key, out hit) && hit is not null) { context.Result = hit; return; }
            var executed = await next();
            if (executed.Exception is null && executed.Result is ObjectResult { StatusCode: null or 200 } ok)
                cache.Set(key, ok, TimeSpan.FromSeconds(_seconds));
        }
        finally
        {
            gate.Release();
            if (gate.CurrentCount == 1) Gates.TryRemove(key, out _);
        }
    }
}
