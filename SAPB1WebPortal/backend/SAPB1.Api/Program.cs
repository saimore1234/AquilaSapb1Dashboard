using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using Dapper;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using SAPB1.Api.Auth;
using SAPB1.Api.Data;
using SAPB1.Api.Interfaces;
using SAPB1.Api.Middleware;
using SAPB1.Api.Models;
using SAPB1.Api.Services;
using Serilog;

// ---------------------------------------------------------------
// Utility CLI mode: `dotnet run -- hash-password <plaintext>` prints a
// PBKDF2 hash you can paste into `dotnet user-secrets set "Auth:PortalPasswordHash" "..."`.
// This never starts the web server, so it's safe to run locally.
// ---------------------------------------------------------------
if (args.Length == 2 && args[0] == "hash-password")
{
    Console.WriteLine(PasswordHasher.HashPassword(args[1]));
    return;
}

var builder = WebApplication.CreateBuilder(args);

// ---------------------------------------------------------------
// Logging (Serilog) — request logs go to console + rolling file.
// Passwords/tokens/connection strings are never written to these logs;
// see ExceptionMiddleware, AuthService and SapServiceLayerAuthenticator for
// what is/isn't logged.
// ---------------------------------------------------------------
// Hosting:LogFilePath / Hosting:LogRetainedFiles let a server deployment keep the logs outside the application folder
// (e.g. D:\AquilaDashboard\Logs\api\sapb1-api-.log). Unset = the original relative "logs/" folder.
builder.Host.UseSerilog((ctx, cfg) => cfg
    .ReadFrom.Configuration(ctx.Configuration)
    .WriteTo.Console()
    .WriteTo.File(ctx.Configuration["Hosting:LogFilePath"] ?? "logs/sapb1-api-.log", rollingInterval: RollingInterval.Day,
        retainedFileCountLimit: ctx.Configuration.GetValue("Hosting:LogRetainedFiles", 31)));

// ---------------------------------------------------------------
// Configuration binding
// ---------------------------------------------------------------
builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));
builder.Services.Configure<CompanyDatabaseOptions>(builder.Configuration.GetSection(CompanyDatabaseOptions.SectionName));

builder.Services.AddHttpContextAccessor();
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<LoginAttemptTracker>();
builder.Services.AddScoped<ISecurityService, SecurityService>();

// ---------------------------------------------------------------
// Dependency injection
// ---------------------------------------------------------------

// Company allow-list + per-request company context/connection — see README
// "Multi-company architecture" and the XML docs on each interface.
builder.Services.AddSingleton<ICompanyRegistry, CompanyRegistry>();
builder.Services.AddScoped<ICompanyContext, CompanyContext>();
builder.Services.AddScoped<ICompanyConnectionFactory, CompanyConnectionFactory>();

// Database-driven Server/Company Configuration (Administration UI) — encrypts
// stored SAP/SQL passwords at rest via the Data Protection API, and keeps
// CompanyRegistry/CompanyConnectionFactory/SapServiceLayerSessionManager's
// in-memory cache (ICompanyConfigurationProvider) warm from dbo.ServerConfigurations.
// These were previously missing here, which broke company resolution entirely
// (CompanyRegistry has a hard dependency on ICompanyConfigurationProvider).
builder.Services.AddDataProtection()
    .SetApplicationName("SAPB1WebPortal")
    .PersistKeysToFileSystem(new DirectoryInfo(
        builder.Configuration["DataProtection:KeysDirectory"]
        ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "SAPB1WebPortal", "DataProtection-Keys")));
builder.Services.AddSingleton<ICompanyConfigurationProvider, CompanyConfigurationProvider>();
builder.Services.AddSingleton<ISecretProtector, DataProtectionSecretProtector>();
builder.Services.AddScoped<IAuditLogService, SqlAuditLogService>();
builder.Services.AddScoped<IServerConfigurationService, SqlServerConfigurationService>();
builder.Services.AddHostedService<ServerConfigurationCacheWarmupService>();

// RBAC — the portal's own Users/Roles/Permissions database (SAPB1PortalAdmin),
// completely separate from every SAP B1 company database. Global across
// companies, not scoped by ICompanyContext (see Data/PortalConnectionFactory.cs).
builder.Services.AddScoped<IPortalConnectionFactory, PortalConnectionFactory>();
builder.Services.AddScoped<IAdminService, SqlAdminService>();
builder.Services.AddHostedService<PortalSchemaBootstrapper>();

builder.Services.AddScoped<ISapB1Service, SqlSapB1Service>();
builder.Services.AddScoped<IPurchaseService, SqlPurchaseService>();
builder.Services.AddScoped<ISalesService, SqlSalesService>();
builder.Services.AddScoped<ISalesReportsService, SqlSalesReportsService>();
builder.Services.AddScoped<ISalesDetailReportsService, SqlSalesDetailReportsService>();
builder.Services.AddScoped<ISalesPerformanceService, SqlSalesPerformanceService>();
builder.Services.AddScoped<ISalesScope, SalesScope>();
builder.Services.AddScoped<ISalesTargetService, SqlSalesTargetService>();
builder.Services.AddScoped<IProductionService, SqlProductionService>();
builder.Services.AddScoped<IFinanceService, SqlFinanceService>();
builder.Services.AddScoped<IReportsService, SqlReportsService>();
builder.Services.AddScoped<ISapB1PrintService, SapB1PrintService>();

// ---------------------------------------------------------------
// SAP B1 Service Layer authentication — implemented (SapServiceLayerAuthenticator)
// but NOT currently wired into the login flow. This environment's Service
// Layer sits behind an SLD (System Landscape Directory) / Keycloak SSO layer
// that intermittently fails server-side (error -304 "Fail to NONE-SSO login
// from SLD") independent of whether the SAP B1 password is correct — a SAP
// B1 server configuration/licensing issue, not something this codebase can
// fix. AuthService currently checks a single portal-managed credential
// instead (Auth:PortalUsername / Auth:PortalPasswordHash). To switch back to
// real SAP B1 authentication once that server-side issue is resolved,
// uncomment the two registrations below and make AuthService depend on
// ISapB1Authenticator again (see its constructor's XML doc comment).
// ---------------------------------------------------------------
// var allowInvalidServiceLayerCert = builder.Configuration.GetValue<bool>("SapServiceLayer:AllowInvalidCertificate");
// builder.Services.AddHttpClient("SapServiceLayer", client =>
// {
//     client.Timeout = TimeSpan.FromSeconds(30);
// })
// .ConfigurePrimaryHttpMessageHandler(() =>
// {
//     var handler = new HttpClientHandler();
//     if (allowInvalidServiceLayerCert)
//     {
//         handler.ServerCertificateCustomValidationCallback = (_, _, _, _) => true;
//     }
//     return handler;
// });
// builder.Services.AddScoped<ISapB1Authenticator, SapServiceLayerAuthenticator>();

// ---------------------------------------------------------------
// SAP B1 Service Layer WRITE client — separate from the (still-disabled)
// login-verification registration above. Used only by
// SapServiceLayerPurchaseWriteService/SapServiceLayerSessionManager for the
// one write endpoint in the API (POST /api/purchase/requests). Credentials
// come from "SapServiceLayerCredentials:{CompanyCode}" in user-secrets/env —
// a purpose-built B1 account per company, never the portal's own login.
// ---------------------------------------------------------------
var allowInvalidServiceLayerCertForWrite = builder.Configuration.GetValue<bool>("SapServiceLayer:AllowInvalidCertificate");
builder.Services.AddHttpClient("SapServiceLayerWrite", client =>
{
    client.Timeout = TimeSpan.FromSeconds(60);
})
.ConfigurePrimaryHttpMessageHandler(() =>
{
    var handler = new HttpClientHandler();
    if (allowInvalidServiceLayerCertForWrite)
    {
        handler.ServerCertificateCustomValidationCallback = (_, _, _, _) => true;
    }
    return handler;
});
builder.Services.AddSingleton<ISapServiceLayerSessionManager, SapServiceLayerSessionManager>();
builder.Services.AddScoped<IPurchaseRequestWriteService, SapServiceLayerPurchaseWriteService>();

builder.Services.AddSingleton<ITokenRevocationStore, TokenRevocationStore>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<ITokenService, TokenService>();

builder.Services.AddControllers(options => options.Filters.Add<PageAccessFilter>());

// ---------------------------------------------------------------
// CORS — only the configured frontend origin(s) may call this API.
// ---------------------------------------------------------------
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendPolicy", policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// ---------------------------------------------------------------
// JWT authentication
// ---------------------------------------------------------------
var jwtSection = builder.Configuration.GetSection(JwtOptions.SectionName);
var jwtKey = jwtSection["Key"];

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
    options.SaveToken = false; // don't cache tokens server-side
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = jwtSection["Issuer"],
        ValidateAudience = true,
        ValidAudience = jwtSection["Audience"],
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey ?? string.Empty)),
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromSeconds(30)
    };

    // Makes POST /api/auth/logout actually take effect immediately instead of
    // the token staying valid until it naturally expires — see
    // ITokenRevocationStore.
    options.Events = new JwtBearerEvents
    {
        OnTokenValidated = context =>
        {
            var jti = context.Principal?.FindFirstValue(JwtRegisteredClaimNames.Jti);
            var revocationStore = context.HttpContext.RequestServices.GetRequiredService<ITokenRevocationStore>();
            if (!string.IsNullOrEmpty(jti) && revocationStore.IsRevoked(jti))
            {
                context.Fail("Token has been revoked.");
            }
            return Task.CompletedTask;
        }
    };
});

builder.Services.AddAuthorization();

// ---------------------------------------------------------------
// Rate limiting — per client IP, fixed one-minute window. Login gets a much lower limit (it is the brute-force target; the account
// lockout in LoginAttemptTracker still applies on top). Health checks are never limited. All numbers are configuration
// (RateLimiting:Enabled / PermitPerMinute / LoginPerMinute); the defaults are generous enough for normal dashboard use.
// ---------------------------------------------------------------
var rateLimitEnabled = builder.Configuration.GetValue("RateLimiting:Enabled", true);
var permitPerMinute = builder.Configuration.GetValue("RateLimiting:PermitPerMinute", 1200);
var loginPerMinute = builder.Configuration.GetValue("RateLimiting:LoginPerMinute", 20);
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (ctx, ct) =>
    {
        ctx.HttpContext.Response.Headers["Retry-After"] = "60";
        ctx.HttpContext.Response.ContentType = "application/json";
        await ctx.HttpContext.Response.WriteAsync("{\"success\":false,\"message\":\"Too many requests. Please wait a moment and try again.\"}", ct);
    };
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(http =>
    {
        var path = http.Request.Path.Value ?? "";
        if (!rateLimitEnabled || path.StartsWith("/api/health", StringComparison.OrdinalIgnoreCase))
            return RateLimitPartition.GetNoLimiter("none");
        var ip = http.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var login = path.StartsWith("/api/auth/login", StringComparison.OrdinalIgnoreCase);
        return RateLimitPartition.GetFixedWindowLimiter((login ? "login:" : "api:") + ip, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = login ? loginPerMinute : permitPerMinute,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        });
    });
});

// ---------------------------------------------------------------
// Swagger / OpenAPI with Bearer auth support
// ---------------------------------------------------------------
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "SAP Business One Web Portal API",
        Version = "v1",
        Description = "Multi-company, read-only REST API over SAP Business One. Login authenticates " +
                      "against the real SAP B1 Service Layer for a chosen company database; every " +
                      "endpoint after that is automatically scoped to that company. Designed to be " +
                      "consumed by both the React web portal and future mobile apps."
    });

    var bearerScheme = new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Enter a JWT token obtained from POST /api/auth/login."
    };
    options.AddSecurityDefinition("Bearer", bearerScheme);
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        { new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } }, Array.Empty<string>() }
    });
});

var app = builder.Build();

// ---------------------------------------------------------------
// Middleware pipeline
// ---------------------------------------------------------------
app.UseMiddleware<ExceptionMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "SAP B1 Web Portal API v1"));
}

// Cloud container hosts (Render, Railway, Azure Web App for Containers, Fly.io)
// terminate HTTPS at their own edge and forward plain HTTP to this container;
// without trusting their X-Forwarded-* headers, UseHttpsRedirection below would
// see every request as HTTP and redirect it to HTTPS again, looping forever.
// Also harmless/no-op for a bare `dotnet run` or an IIS reverse proxy setup.
var forwarded = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
    KnownNetworks = { },
    KnownProxies = { }
};
// Hosting:TrustedProxies (e.g. ["127.0.0.1", "::1"] for IIS/ARR on the same server): only those addresses may set X-Forwarded-*, so a caller
// cannot fake its IP or protocol. Unset = the framework default (loopback proxies only).
var trustedProxies = builder.Configuration.GetSection("Hosting:TrustedProxies").Get<string[]>() ?? Array.Empty<string>();
if (trustedProxies.Length > 0)
{
    forwarded.KnownNetworks.Clear();
    forwarded.KnownProxies.Clear();
    foreach (var proxy in trustedProxies)
        if (System.Net.IPAddress.TryParse(proxy, out var ip)) forwarded.KnownProxies.Add(ip);
}
app.UseForwardedHeaders(forwarded);

// API responses carry financial data: never let a browser or proxy cache them.
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path.StartsWithSegments("/api"))
        ctx.Response.OnStarting(() =>
        {
            if (!ctx.Response.Headers.ContainsKey("Cache-Control")) ctx.Response.Headers["Cache-Control"] = "no-store";
            return Task.CompletedTask;
        });
    await next();
});

app.UseRateLimiter();

// Behind IIS (TLS ends at the IIS site, the API listens on loopback only) this can be turned off with Hosting:HttpsRedirection=false.
if (builder.Configuration.GetValue("Hosting:HttpsRedirection", true)) app.UseHttpsRedirection();
app.UseCors("FrontendPolicy");
app.UseAuthentication();
app.UseMiddleware<MustChangePasswordMiddleware>();
app.UseAuthorization();
app.UseSerilogRequestLogging();

app.MapControllers();

// Health checks for IIS / monitoring / the deployment script. /api/health = the process is up; /api/health/ready = it can also reach the
// portal database. Both are anonymous and return no business data or error detail.
var appVersion = typeof(Program).Assembly.GetName().Version?.ToString() ?? "unknown";
app.MapGet("/api/health", () => Results.Ok(new { status = "healthy", service = "SAPB1.Api", version = appVersion, time = DateTime.UtcNow }));
app.MapGet("/api/health/ready", async (IPortalConnectionFactory portal, ILogger<Program> log, CancellationToken ct) =>
{
    try
    {
        using var db = portal.CreateConnection();
        await db.ExecuteScalarAsync<int>(new CommandDefinition("SELECT 1", cancellationToken: ct));
        return Results.Ok(new { status = "ready", database = "reachable", time = DateTime.UtcNow });
    }
    catch (Exception ex)
    {
        log.LogError(ex, "Readiness check failed: portal database unreachable");
        return Results.Json(new { status = "unhealthy", database = "unreachable", time = DateTime.UtcNow }, statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

app.Run();
