using System.Net;
using System.Text.Json;
using SAPB1.Api.DTOs.Common;

namespace SAPB1.Api.Middleware;

/// <summary>
/// Catches unhandled exceptions, logs full details server-side (never including
/// connection strings, passwords or tokens), and returns a generic ApiResponse
/// to the client so internal details are never leaked (spec sections 16 & 22).
/// </summary>
public class ExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionMiddleware> _logger;
    private readonly IHostEnvironment _env;

    public ExceptionMiddleware(RequestDelegate next, ILogger<ExceptionMiddleware> logger, IHostEnvironment env)
    {
        _next = next;
        _logger = logger;
        _env = env;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception on {Method} {Path}", context.Request.Method, context.Request.Path);

            context.Response.ContentType = "application/json";
            context.Response.StatusCode = ex switch
            {
                UnauthorizedAccessException => (int)HttpStatusCode.Unauthorized,
                KeyNotFoundException => (int)HttpStatusCode.NotFound,
                ArgumentException => (int)HttpStatusCode.BadRequest,
                _ => (int)HttpStatusCode.InternalServerError
            };

            var message = context.Response.StatusCode == (int)HttpStatusCode.InternalServerError
                ? "An unexpected error occurred. Please try again or contact support."
                : ex.Message;

            var response = ApiResponse<object>.Fail(message,
                _env.IsDevelopment() ? new List<string> { ex.ToString() } : null);

            await context.Response.WriteAsync(JsonSerializer.Serialize(response));
        }
    }
}
