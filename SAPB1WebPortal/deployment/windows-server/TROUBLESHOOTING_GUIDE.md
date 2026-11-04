# Troubleshooting Guide

## 0. Where to look first

| What | Where |
|---|---|
| Application log (errors, requests, login failures) | `D:\AquilaDashboard\Logs\api\sapb1-api-YYYYMMDD.log` |
| Start-up crash detail | set `stdoutLogEnabled="true"` in `Backend\web.config`, `Restart-WebAppPool AquilaApi`, read `Logs\stdout\` — then set it back to `false` |
| Deployment history | `Logs\deploy\deploy-*.log` |
| IIS request log | `C:\inetpub\logs\LogFiles\W3SVC<id>\` (status + sub-status codes) |
| Windows | Event Viewer → *Windows Logs → Application* (sources: *IIS AspNetCore Module V2*, *.NET Runtime*) |

Quick health commands:
```powershell
curl.exe -s http://127.0.0.1:5011/api/health            # API alive?
curl.exe -s http://127.0.0.1:5011/api/health/ready      # + portal database reachable?
.\DEPLOYMENT_POWERSHELL_SCRIPT.ps1 -Action Verify -PublicUrl https://dashboard.companydomain.com
Get-WebAppPoolState AquilaApi ; Get-WebAppPoolState AquilaWeb
Get-Website | Select Name, State, Bindings
```

## 1. Symptoms

| Symptom | Likely cause | Fix |
|---|---|---|
| **HTTP 500.19** on the whole site, "config section rewrite is not defined" / "cannot add duplicate" | URL Rewrite not installed (or `web.config` edited badly) | Install URL Rewrite 2.1 (IIS guide §1); validate the XML |
| **HTTP 500.19** mentioning `proxy` | ARR not installed | Install ARR 3.0, then enable the proxy (IIS guide §5) |
| Home page loads but every API call returns **404** or HTML | ARR proxy disabled, or rule order broken | `Get-WebConfigurationProperty … system.webServer/proxy -Name enabled` must be `True`; test `curl http://localhost/api/health` — JSON expected |
| API calls return **502.3 Bad Gateway** | API site stopped / not listening on 5011 | `Get-Website AquilaApi`; `Start-Website AquilaApi`; `Restart-WebAppPool AquilaApi`; `Test-NetConnection 127.0.0.1 -Port 5011` |
| API calls return **500.0 / "Rewrite … server variable is not allowed"** | `HTTP_X_FORWARDED_PROTO` not in *allowedServerVariables* | Run the command in IIS guide §5 (or `Setup-IIS.ps1`) |
| API **500.30 / 500.31 / 502.5** ("ASP.NET Core app failed to start") | Hosting Bundle missing/old, missing required setting, or a crash in start-up | Check `dotnet --list-runtimes` (8.0.x), install the Hosting Bundle then `net stop was /y; net start w3svc`; read the stdout log; confirm `Jwt__Key`, `PortalDb__ConnectionString` exist (`Set-AquilaSecrets.ps1 -List`) |
| API **500.37** "failed to start within startup time limit" | slow first database connection | wait/retry; check SQL Server is running and reachable; raise `startupTimeLimit` |
| Refreshing `/sales/reports/...` gives **404** | SPA fallback rule missing — `Frontend\web.config` absent | Redeploy (the build copies `web.config` from `public/`); check it exists next to `index.html` |
| Blank white page; console shows `Unexpected token '<'` for a `.js` file | an old `index.html` is cached, or assets from another release | hard-refresh (Ctrl+F5); confirm `index.html` is served with `Cache-Control: no-cache` |
| **Redirect loop** (ERR_TOO_MANY_REDIRECTS) | API redirecting to https because it does not see `X-Forwarded-Proto` | set `"Hosting": { "HttpsRedirection": false }` in `appsettings.Production.json` (template does) and ensure the allowed-server-variable is set |
| Login: **"company not found / not configured"** | company code missing in `CompanyDatabases:Companies` or its connection string variable missing | add the variable `CompanyConnectionStrings__<Code>` with `Set-AquilaSecrets.ps1` |
| Login works but every report says "unable to load" | company SQL login wrong/blocked | test the exact login with `sqlcmd` (Database guide §6); check `Logs\api` for `Login failed for user` |
| `Login failed for user 'IIS APPPOOL\AquilaApi'` | portal DB connection uses `Trusted_Connection=True` but the pool identity has no SQL login | create the login (Database guide §3) or use SQL authentication |
| Sudden **401 for everyone** after a deploy | `Jwt__Key` changed or missing | expected after a key change — log in again; if unintended restore the original value |
| **401** only through the site but fine on 127.0.0.1:5011 | `Authorization` header stripped by something in front | check no other proxy/WAF removes it; ARR passes it by default |
| **429 Too many requests** | rate limit (20 logins/min and 1200 requests/min per IP by default) | a script/monitor is hammering; or many users share one NAT IP — raise `RateLimiting:PermitPerMinute` in `appsettings.Production.json` |
| Everyone seems to come from `127.0.0.1` (logs, rate limit) | proxy not trusted so `X-Forwarded-For` ignored | `Hosting:TrustedProxies` must contain `127.0.0.1` and `::1` |
| Large report times out / **504** | ARR proxy timeout or SQL command time | `system.webServer/proxy timeout` (default set to 5 min); look for the slow query in the log |
| Server Configuration page: passwords show as unreadable / "cannot decrypt" | Data Protection keys not the original ones | restore `key-*.xml` into `D:\AquilaDashboard\Keys`, recycle the pool (Server guide §7) |
| Log files empty / not written | pool identity cannot write `Logs\` | grant *Modify* to `IIS AppPool\AquilaApi` on `D:\AquilaDashboard\Logs` |
| **Print** button fails | Crystal Reports runtime missing, `PrintWorker` folder not deployed, or pool cannot run it | install SAP Crystal Reports runtime (x64) on the server; confirm `Backend\PrintWorker\SAPB1.PrintWorker.exe` exists (the deploy script builds it only where Crystal is installed); check `Logs\api` for "Print worker failed" |
| CSV / **PDF download** does nothing | browser blocking downloads, or old cached JS | the exports are created in the browser (no server call); hard-refresh, check the console |
| Mobile app cannot log in | CORS origin missing | `capacitor://localhost` (and the https address) in `Cors:AllowedOrigins`, app built with the permanent `VITE_API_BASE_URL` |
| `app_offline.htm` message stays after a deploy | a failed deploy left it behind | delete `D:\AquilaDashboard\Backend\app_offline.htm` |
| Deploy script: "Missing folder … run Setup-IIS.ps1" | server structure not created | run `Setup-IIS.ps1` |
| Deploy script: build fails on `npm ci` | no internet / proxy, wrong Node version | `npm config get registry`; Node 18+; run `npm ci` manually in `frontend\sap-b1-web` to see the error |
| Deploy script: "VITE_API_BASE_URL is set to …" | an `.env` file or variable points the build at a tunnel/absolute URL | remove it or set `/api` — the IIS build must use the relative path |

## 2. Useful commands

```powershell
# Pool and site control
Restart-WebAppPool AquilaApi
Stop-Website AquilaApi ; Start-Website AquilaApi
iisreset /noforce                                    # last resort, restarts all IIS

# See the pool's non-secret environment (names only)
.\scripts\Set-AquilaSecrets.ps1 -List

# Tail the application log
Get-Content (Get-ChildItem D:\AquilaDashboard\Logs\api\*.log | Sort LastWriteTime | Select -Last 1).FullName -Tail 50 -Wait

# What is listening
Get-NetTCPConnection -State Listen -LocalPort 80,443,5011 | Select LocalPort, OwningProcess
Get-NetFirewallRule -DisplayName 'Aquila*' | Select DisplayName, Enabled, Action

# From a different PC: these must FAIL (not exposed)
Test-NetConnection <server> -Port 5011
Test-NetConnection <server> -Port 1433
```

## 3. Failed deployment checklist

1. Read the red line at the end of the script output and `Logs\deploy\deploy-<time>.log`.
2. If the API is down and you need the site back **now**: `.\DEPLOYMENT_POWERSHELL_SCRIPT.ps1 -Action Rollback`.
3. Look at `Logs\api` for the real error (database login, missing variable, port in use).
4. Fix, then `-DryRun`, then deploy again.

## 4. Information to send when asking for help

* The exact HTTP status and sub-status (e.g. 500.19.0) and the URL.
* The last 50 lines of `Logs\api\…log` and any `Logs\stdout` file.
* Output of `dotnet --list-runtimes`, `Get-WebAppPoolState`, `Get-Website`, and the Event Viewer entry from *IIS AspNetCore Module V2*.
* **Never** send passwords, connection strings, the JWT key or the contents of `Keys\`.
