# IIS Configuration Guide

Windows Server 2022, IIS 10. Run everything in an **elevated PowerShell**. `scripts\Setup-IIS.ps1` automates sections 2–6 and is safe to re-run; this guide shows what it does so you can check or do it by hand.

## 1. Install IIS and the add-ons (in this order)

```powershell
# 1. IIS role and the features the site uses
Install-WindowsFeature Web-Server, Web-Static-Content, Web-Default-Doc, Web-Http-Errors, Web-Http-Logging, `
    Web-Stat-Compression, Web-Dyn-Compression, Web-Filtering, Web-Mgmt-Console -IncludeManagementTools

# 2. URL Rewrite 2.1  (download the x64 MSI from https://www.iis.net/downloads/microsoft/url-rewrite)
msiexec /i rewrite_amd64_en-US.msi /qn

# 3. Application Request Routing 3.0  (https://www.iis.net/downloads/microsoft/application-request-routing)
msiexec /i requestRouter_amd64.msi /qn

# 4. .NET 8 Hosting Bundle  (https://dotnet.microsoft.com/download/dotnet/8.0  ->  Hosting Bundle)
.\dotnet-hosting-8.0.x-win.exe /install /quiet /norestart
net stop was /y ; net start w3svc          # so IIS loads the new module
```
The Hosting Bundle must be installed **after** IIS. It installs the ASP.NET Core Module (in-process hosting) and the .NET 8 runtime.

Check:
```powershell
Test-Path "$env:windir\System32\inetsrv\rewrite.dll"
Test-Path "$env:ProgramFiles\IIS\Application Request Routing\requestRouter.dll"
Test-Path "$env:ProgramFiles\IIS\Asp.Net Core Module\V2\aspnetcorev2.dll"
dotnet --list-runtimes | Select-String AspNetCore      # Microsoft.AspNetCore.App 8.0.x
```

## 2. Folders

```powershell
$r = 'D:\AquilaDashboard'
'Frontend','Backend','Logs\api','Logs\stdout','Logs\deploy','Backups','Keys','Deployment' | % { New-Item -ItemType Directory "$r\$_" -Force }
```

## 3. Application pools and sites

| | Frontend | API |
|---|---|---|
| Site name | `AquilaDashboard` | `AquilaApi` |
| Physical path | `D:\AquilaDashboard\Frontend` | `D:\AquilaDashboard\Backend` |
| Pool | `AquilaWeb` | `AquilaApi` |
| Bindings | `http :80` and `https :443`, host `dashboard.companydomain.com` | `http 127.0.0.1:5011` **only** |
| .NET CLR version | No Managed Code | No Managed Code |
| Pipeline | Integrated | Integrated |
| Pool extras | — | Start mode **AlwaysRunning**, Idle time-out **0**, Regular time interval (recycle) **0**, Load user profile **True**; site Preload Enabled **True** |

```powershell
Import-Module WebAdministration
New-WebAppPool AquilaWeb ; New-WebAppPool AquilaApi
Set-ItemProperty IIS:\AppPools\AquilaWeb -Name managedRuntimeVersion -Value ''
Set-ItemProperty IIS:\AppPools\AquilaApi -Name managedRuntimeVersion -Value ''
Set-ItemProperty IIS:\AppPools\AquilaApi -Name startMode -Value AlwaysRunning
Set-ItemProperty IIS:\AppPools\AquilaApi -Name processModel.idleTimeout -Value ([TimeSpan]::Zero)
Set-ItemProperty IIS:\AppPools\AquilaApi -Name recycling.periodicRestart.time -Value ([TimeSpan]::Zero)
Set-ItemProperty IIS:\AppPools\AquilaApi -Name processModel.loadUserProfile -Value $true

New-Website AquilaDashboard -PhysicalPath D:\AquilaDashboard\Frontend -ApplicationPool AquilaWeb -Port 80 -HostHeader dashboard.companydomain.com
New-Website AquilaApi -PhysicalPath D:\AquilaDashboard\Backend -ApplicationPool AquilaApi -Port 5011 -IPAddress 127.0.0.1
Set-ItemProperty IIS:\Sites\AquilaApi -Name applicationDefaults.preloadEnabled -Value $true
```
Remove the *Default Web Site* binding on port 80 if it conflicts. The API site has no public binding, so it can only be reached from the server itself.

**Why two sites:** the API's routes already start with `/api`. Hosting it as a sub-application under `/api` would make them `/api/api/...`. A loopback site plus a reverse proxy keeps the routes exactly as they are and gives the browser a single origin.

## 4. HTTPS

1. Get a certificate for `dashboard.companydomain.com` (your CA, or an ACME client such as win-acme for a public name) and import it:
   ```powershell
   Import-PfxCertificate -FilePath D:\cert\dashboard.pfx -CertStoreLocation Cert:\LocalMachine\My -Password (Read-Host -AsSecureString)
   ```
2. Bind it:
   ```powershell
   $thumb = '<thumbprint>'
   New-WebBinding -Name AquilaDashboard -Protocol https -Port 443 -HostHeader dashboard.companydomain.com -SslFlags 1   # SNI
   (Get-WebBinding -Name AquilaDashboard -Protocol https).AddSslCertificate($thumb, 'My')
   ```
3. http→https redirect is done by the first rule in `web.config` (it skips `localhost`/`127.0.0.1` so local health checks still work).
4. Optional hardening: disable TLS 1.0/1.1 and weak ciphers (IIS Crypto or registry), then test with `Test-NetConnection` / an SSL checker.

## 5. ARR reverse proxy

```powershell
# Enable the proxy (server level) and allow long reports to finish
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name enabled -Value $true
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name timeout -Value ([TimeSpan]::FromMinutes(5))

# Let the rewrite rule tell the API whether the original request was https
Add-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/rewrite/allowedServerVariables' -Name '.' -Value @{ name = 'HTTP_X_FORWARDED_PROTO' }
```
ARR adds `X-Forwarded-For` itself. The API trusts `X-Forwarded-*` **only** from `127.0.0.1`/`::1` (`Hosting:TrustedProxies`), so real client IPs reach the rate limiter and logs and nobody outside can fake them.

## 6. The frontend `web.config` (copied to `Frontend\` by the build)

Source: `frontend/sap-b1-web/public/web.config`. Rules, in order:

| # | Rule | Purpose |
|---|---|---|
| 1 | HTTP to HTTPS | 301 redirect unless the host is localhost/127.0.0.1 |
| 2 | API reverse proxy (https) | `^api/(.*)` → `http://127.0.0.1:5011/api/{R:1}`, query string kept, sets `X-Forwarded-Proto: https` |
| 3 | API reverse proxy (http) | same, for local plain-http checks |
| 4 | SPA fallback | anything that is not a file/folder, not `/api…`, not `/assets/…` → `/index.html` |

So `/sales/reports/payment-due` opened directly or refreshed returns `index.html` (React Router then shows the page), while `/api/...` is never rewritten to `index.html`, and a missing file under `/assets/` is a real 404.

Other settings in the same file:
* `<httpErrors existingResponse="PassThrough" />` — the API's own JSON error bodies reach the browser.
* **MIME types** for `.svg .woff .woff2 .json .webmanifest .js .mjs`.
* **Compression**: `urlCompression` static + dynamic on (the Static/Dynamic Compression features are installed in §1).
* **Caching**: `index.html` is never cached; `/assets/*` (hashed file names) cached for 365 days.
* **Headers**: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`; `X-Powered-By` and the `Server` header removed.
* If the API port is not 5011, change the two `127.0.0.1:5011` targets.

**Content-Security-Policy** is intentionally *not* enforced by default: `index.html` contains an inline theme script and the app has not been tested against a policy. To try one, add it first as `Content-Security-Policy-Report-Only`, watch the browser console on every module, and only then enforce it.

## 7. The API `web.config` and settings

`templates\backend.web.config.template` (deployed to `Backend\web.config`; `{{ROOT}}` is replaced): ASP.NET Core Module V2, **in-process** hosting, startup time-limit 120 s, and the non-secret environment variables:

| Variable | Value |
|---|---|
| `ASPNETCORE_ENVIRONMENT` | `Production` (Swagger and detailed errors off) |
| `Hosting__LogFilePath` | `D:\AquilaDashboard\Logs\api\sapb1-api-.log` (daily files) |
| `DataProtection__KeysDirectory` | `D:\AquilaDashboard\Keys` |
| `PrintWorker__ExePath` | `D:\AquilaDashboard\Backend\PrintWorker\SAPB1.PrintWorker.exe` |

Server-specific, non-secret values (trusted proxies, allowed origins, rate limits) go in `Backend\appsettings.Production.json` (template provided; the deploy script never overwrites it). **Secrets** are pool environment variables set with `scripts\Set-AquilaSecrets.ps1`. To inspect:
```powershell
Get-WebConfiguration -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter "system.applicationHost/applicationPools/add[@name='AquilaApi']/environmentVariables/add" | % name
```
For startup problems set `stdoutLogEnabled="true"` in `Backend\web.config` temporarily, recycle the pool, read `Logs\stdout\`, then set it back to `false`.

## 8. Permissions

| Folder | Identity | Rights |
|---|---|---|
| `Frontend` | `IIS_IUSRS` | Read & execute |
| `Backend` | `IIS AppPool\AquilaApi` | Read & execute |
| `Logs` | `IIS AppPool\AquilaApi` | Modify |
| `Keys` | Administrators, SYSTEM, `IIS AppPool\AquilaApi` | Full / Full / Modify — **inheritance removed**, nobody else |
| `Backups`, `Deployment` | Administrators | Full |

The print worker writes temporary files to the pool identity's temp folder; with *Load user profile = True* this works.

## 9. Firewall

```powershell
New-NetFirewallRule -DisplayName 'Aquila HTTP'  -Direction Inbound -Protocol TCP -LocalPort 80  -Action Allow
New-NetFirewallRule -DisplayName 'Aquila HTTPS' -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
New-NetFirewallRule -DisplayName 'Aquila API (block external)' -Direction Inbound -Protocol TCP -LocalPort 5011 -Action Block
```
Do not open 1433 (SQL Server). If SQL is on another machine, allow it only from this server's IP.

## 10. Quick tests

```powershell
curl.exe -s http://127.0.0.1:5011/api/health                      # direct to the API (loopback)
curl.exe -s -H "Host: dashboard.companydomain.com" http://localhost/api/health   # through IIS + ARR (JSON, not HTML)
curl.exe -sI https://dashboard.companydomain.com/sales/reports/payment-due        # 200 text/html (SPA fallback)
curl.exe -s -o NUL -w "%{http_code}" https://dashboard.companydomain.com/api/sales/reports/payment-due   # 401 (routed to the API)
curl.exe -s -o NUL -w "%{http_code}" https://dashboard.companydomain.com/swagger/v1/swagger.json         # 404
```
`DEPLOYMENT_POWERSHELL_SCRIPT.ps1 -Action Verify -PublicUrl https://…` runs all of these.
