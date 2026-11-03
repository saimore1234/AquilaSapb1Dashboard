# Aquila SAP B1 Business Hub — Windows Server Deployment Guide

Runs the whole application on your own Windows Server 2022 with IIS. Vercel is no longer needed.

Related guides: [IIS_CONFIGURATION_GUIDE.md](IIS_CONFIGURATION_GUIDE.md) · [DATABASE_CONFIGURATION_GUIDE.md](DATABASE_CONFIGURATION_GUIDE.md) · [ROLLBACK_GUIDE.md](ROLLBACK_GUIDE.md) · [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md)

---

## 1. Architecture

```
Browser ──HTTPS 443──► IIS site "AquilaDashboard"  (D:\AquilaDashboard\Frontend)
                         │  static React build, SPA fallback, security headers
                         │
                         └─ /api/*  ──ARR reverse proxy (same machine)──►  IIS site "AquilaApi"
                                                                            127.0.0.1:5010 (loopback only)
                                                                            ASP.NET Core 8, in-process
                                                                              │
                                              ┌───────────────────────────────┴─────────────────┐
                                              ▼                                                   ▼
                                  SQL Server 2019 (same server)                       SAP Business One
                               • SAP company DB  (read-only login)                    Service Layer (only for the
                               • SAPB1PortalAdmin (users, roles, targets)             Purchase Request write feature)
```

* **One public address**, e.g. `https://dashboard.companydomain.com/` — the browser calls `/api/...` on the same origin, so there is **no CORS** to manage for the web app.
* The API listens **only on loopback**; port 5010 is blocked from the network by a firewall rule, and SQL Server is never exposed.
* Secrets (JWT key, SQL connection strings, portal administrator hash) are **IIS application-pool environment variables**, not files.

## 2. What was Vercel-specific (and what changed)

| Item | Before | Now |
|---|---|---|
| `frontend/sap-b1-web/vercel.json` | Rewrote `/api/*` to a temporary Cloudflare tunnel and everything else to `/index.html` | **Not used on IIS.** Left in place only so Vercel keeps working until you cut over. The same two jobs are done by `public/web.config` |
| API address in the browser | `VITE_API_BASE_URL=/api` (relative) | **Unchanged** — the web build already used the relative `/api`, so the frontend needed no code change |
| Tunnel (`*.trycloudflare.com`, ngrok) | Carried the traffic from Vercel to this machine | Not needed. Retire it after cut-over |
| Absolute URLs in source | `localhost:7010` only in `vite.config.ts` (dev proxy), `launchSettings.json`, docs | Not used in a production build; the deploy script refuses to build if `VITE_API_BASE_URL` is anything other than `/api` |

## 3. Code changes made for server hosting

Backend (`backend/SAPB1.Api/Program.cs`) — all optional/config-driven, defaults unchanged for development:

| Change | Setting |
|---|---|
| **Health endpoints**: `GET /api/health` (process up) and `GET /api/health/ready` (portal database reachable); anonymous, no business data | — |
| Log file location + retention configurable | `Hosting:LogFilePath`, `Hosting:LogRetainedFiles` |
| Forwarded headers trusted **only from listed proxies** (IIS/ARR on this machine) | `Hosting:TrustedProxies` |
| HTTPS redirection switch (TLS ends at IIS) | `Hosting:HttpsRedirection` |
| **Rate limiting** per client IP; stricter on `/api/auth/login`; health never limited | `RateLimiting:Enabled/PermitPerMinute/LoginPerMinute` |
| `Cache-Control: no-store` on every `/api` response | — |

Frontend: new `public/web.config` (copied into `dist` by the build): HTTPS redirect, `/api` reverse proxy, SPA fallback, MIME types, compression, cache headers, security headers.

Nothing in the SAP business logic, SQL, authentication or permissions was touched.

## 4. Folder layout on the server

```
D:\AquilaDashboard
├─ Frontend\      index.html, assets\, web.config            ← IIS site "AquilaDashboard"
├─ Backend\       SAPB1.Api.dll, web.config, appsettings*.json, PrintWorker\   ← IIS site "AquilaApi"
├─ Logs\          api\ (application logs)  deploy\ (deployment transcripts)  stdout\ (startup debug)
├─ Keys\          Data Protection keys (see §7) — locked to Administrators + the API identity
├─ Backups\       one folder per deployment (yyyyMMdd-HHmmss) + pre-rollback-…
└─ Deployment\    scripts and templates copied from the repository (staging\ is temporary)
```

Source code stays in your repository/work folder, **not** in `D:\AquilaDashboard`.

## 5. One-time server preparation

Run PowerShell **as Administrator**.

1. **Windows updates**, time zone set to India Standard Time, D: drive present.
2. **Get the files**: clone the repository (or copy it) to a work folder such as `D:\Source\AquilaSapb1Dashboard`, then copy `SAPB1WebPortal\deployment\windows-server` to `D:\AquilaDashboard\Deployment`.
3. **Install IIS and the add-ons** — exact commands are in [IIS_CONFIGURATION_GUIDE.md §1](IIS_CONFIGURATION_GUIDE.md): IIS role, **URL Rewrite 2.1**, **ARR 3.0**, **.NET 8 ASP.NET Core Hosting Bundle** (install *after* IIS).
4. **Install build tools** on the machine that runs the deploy script: **.NET 8 SDK**, **Node.js 18+ (LTS)**.
5. **Print feature only**: install the **SAP Crystal Reports runtime (x64, 13.0.4000 as used today)**. The invoice/order *Print* button runs `SAPB1.PrintWorker.exe`, which needs it. Without it everything else works; only Print fails.
6. **Create the IIS structure** (shows the plan first):
   ```powershell
   cd D:\AquilaDashboard\Deployment\scripts
   .\Setup-IIS.ps1 -WhatIf
   .\Setup-IIS.ps1 -HostName dashboard.companydomain.com -CertificateThumbprint <thumbprint>
   ```
7. **Configure the API** — copy `templates\appsettings.Production.json.template` to `D:\AquilaDashboard\Backend\appsettings.Production.json` and set your domain in `Cors:AllowedOrigins`.
8. **Move the Data Protection keys** (critical, §7).
9. **Set the secrets** (§8).
10. **Prepare SQL Server logins** — [DATABASE_CONFIGURATION_GUIDE.md](DATABASE_CONFIGURATION_GUIDE.md).
11. **DNS + certificate**: create the DNS record for `dashboard.companydomain.com` pointing at the server; install the certificate (IIS guide §4).

## 6. Deploying

```powershell
cd D:\AquilaDashboard\Deployment
# 1. Build and validate only — changes nothing on the server
.\DEPLOYMENT_POWERSHELL_SCRIPT.ps1 -SourceRoot D:\Source\AquilaSapb1Dashboard\SAPB1WebPortal -DryRun

# 2. Real deployment (asks you to type DEPLOY)
.\DEPLOYMENT_POWERSHELL_SCRIPT.ps1 -SourceRoot D:\Source\AquilaSapb1Dashboard\SAPB1WebPortal `
    -PublicUrl https://dashboard.companydomain.com -AutoRollback
```

What it does: validates paths and tools → builds the frontend (`npm ci`, `npm run build`) → publishes the backend (`dotnet publish -c Release`) → checks the output → **asks for confirmation** → backs up the current Frontend and Backend → puts the API offline (`app_offline.htm`) → copies the new version → brings it back → checks health, the SPA routes, the API through the proxy and that Swagger is off → on failure stops (or, with `-AutoRollback`, restores the previous version).

It never deletes or overwrites: `Logs`, `Keys`, `Backups`, `appsettings.Production.json`, database-type files (`*.mdf *.ldf *.ndf *.bak *.trn`) and the pool secrets. A transcript is written to `Logs\deploy\`.

Other actions: `-Action Status`, `-Action Verify`, `-Action Rollback` (see [ROLLBACK_GUIDE.md](ROLLBACK_GUIDE.md)).

Manual equivalents (if you prefer not to use the script):
```powershell
cd SAPB1WebPortal\frontend\sap-b1-web ; npm install ; npm run build         # output: dist\  (index.html, assets\, web.config)
cd SAPB1WebPortal\backend\SAPB1.Api    ; dotnet publish SAPB1.Api.csproj -c Release -o .\publish
```
The frontend build output directory is **`frontend\sap-b1-web\dist`**.

## 7. Data Protection keys — do not skip

The portal encrypts SAP/SQL passwords stored in its database (Administration → Server Configuration) with ASP.NET Data Protection keys. **If the new server starts with different keys, those stored passwords cannot be decrypted.**

Today the keys are on the current machine in `C:\ProgramData\SAPB1WebPortal\DataProtection-Keys\`. Copy that folder's `key-*.xml` file(s) to `D:\AquilaDashboard\Keys\` **before the first start**, keep a copy in a safe place, and restrict the folder (`Setup-IIS.ps1` does this). The application is pointed there by `DataProtection__KeysDirectory` (set in `web.config`).

## 8. Secrets

```powershell
cd D:\AquilaDashboard\Deployment\scripts
.\Set-AquilaSecrets.ps1 -CompanyCodes AOPL        # prompts; nothing is echoed or written to disk
.\Set-AquilaSecrets.ps1 -List                       # names only
```
It stores them as environment variables on the `AquilaApi` application pool: `Jwt__Key`, `PortalDb__ConnectionString`, `CompanyConnectionStrings__AOPL`, `Auth__PortalUsername`, `Auth__PortalPasswordHash`, and optionally `SapServiceLayerCredentials__AOPL__Username/Password`. Use `GENERATE` at the JWT prompt for a random key. Changing `Jwt__Key` signs everyone out.

## 9. After a server restart

The `AquilaApi` pool is set to **AlwaysRunning** with no idle time-out, and IIS starts automatically with Windows, so the API (and its cache warm-up) starts by itself after a reboot. Verify with `.\DEPLOYMENT_POWERSHELL_SCRIPT.ps1 -Action Verify -PublicUrl https://dashboard.companydomain.com`.

## 10. Cut-over from Vercel

1. Deploy and verify on the server using the real hostname (or a test hostname) **while Vercel is still live**.
2. Complete the checklist in §11 with real logins.
3. Switch DNS to the server (lower the TTL a day earlier). Keep Vercel running for a day as a fallback.
4. Mobile app (Capacitor): rebuild it with `VITE_API_BASE_URL=https://dashboard.companydomain.com/api` (permanent HTTPS address, not a tunnel) and keep `capacitor://localhost` in `Cors:AllowedOrigins`.
5. Stop the Cloudflare/ngrok tunnels, remove the Vercel project, and delete the old `vercel.json` rewrite if you want.

## 11. Validation checklist (do this on the server with real logins)

Mark each item only after you have opened it and seen correct data.

**Platform:** `/api/health` → `healthy` · `/api/health/ready` → `ready` · site opens over HTTPS · http redirects to https · refresh on `/sales`, `/sales/dashboard`, `/sales/reports/total-outstanding`, `/sales/reports/payment-due`, `/sales/reports/lost-customers`, `/sales/reports/unpaid-invoices` · login / logout · company switching · 5 wrong passwords lock the account (15 min) · more than 20 login attempts in a minute from one IP return 429 · Swagger URL returns 404.

**Sales:** Dashboard (all KPI cards open their reports; target card shows the financial year) · Sales Overview · Reports hub · Quotations · Orders · Deliveries · A/R Invoices (open one; Print) · Credit Memos · Payments · Salesperson Targets · Analytics.

**Reports:** Payment Due Register (cards, tabs, filters, CSV) · Lost Customer Analysis · Unpaid Invoices (invoice link) · Total Outstanding · Customer Ledger (**Download PDF**, Download CSV) · Customer Outstanding · Open Sales Orders · Sales Register.

**Other modules:** Business Partners · Items · Inventory · Purchasing (incl. creating a Purchase Request) · Production · Finance · Banking · Reports · Administration (users, roles, server configuration).

**Operations:** restart the server and confirm the site comes back on its own · deploy a trivial change and roll it back · confirm logs appear in `Logs\api\`.

## 12. Security checklist

* HTTPS only; certificate valid; HSTS header present (set by `web.config`).
* Port 5010 and SQL Server (1433) not reachable from other machines (`Test-NetConnection <server> -Port 5010` from a PC must fail).
* SQL logins are least-privilege (see database guide); no credentials in source, `web.config`, scripts or the Frontend folder.
* `Jwt__Key` ≥ 32 random characters, unique to this server.
* Roles/permissions unchanged (enforced server-side by the existing `PageAccessFilter` and scope rules).
* Rate limits on; Swagger off (only enabled in the Development environment).
* Windows firewall: only 80/443 inbound for the site; RDP restricted to your network.
* Backups: nightly SQL backups of `SAPB1PortalAdmin` (and your normal SAP DB backups); copy `D:\AquilaDashboard\Keys` and the latest `Backups\` folder off the server.

## 13. Backup and recovery

| What | How | Where |
|---|---|---|
| Application files | Automatic before every deploy | `Backups\<timestamp>` (the script keeps the newest 10) |
| Portal database `SAPB1PortalAdmin` | SQL Server backup job (full nightly + log if needed) | your backup location |
| SAP company DB | your existing SAP backup routine (this app only reads it) | — |
| Data Protection keys | copy `D:\AquilaDashboard\Keys` after any change | off-server |
| Pool secrets | record them in your password manager; `Set-AquilaSecrets.ps1` re-creates them | — |

Recovery from a bad release: [ROLLBACK_GUIDE.md](ROLLBACK_GUIDE.md). Recovery of a lost server: install prerequisites → `Setup-IIS.ps1` → restore `Keys` → `Set-AquilaSecrets.ps1` → copy `appsettings.Production.json` → run the deploy script.

## 14. What has and has not been tested

**Tested on the build machine (not on your server):** frontend production build; backend publish; the published API run in *Production* mode — health and readiness endpoints, Swagger off, `no-store` header, login rate limit (429 with JSON body), no secrets in logs, logs written to the configured path; the deployment script — dry run, deploy, second deploy with backup, status, rollback, auto-rollback on a failed health check, preservation of `appsettings.Production.json` / `Keys` / `Logs` / database-type files; `web.config` is well-formed XML; script syntax of all three PowerShell files.

**Not tested (needs your server):** IIS + ARR + URL Rewrite behaviour (reverse proxy, SPA fallback, HTTPS redirect, headers, compression), the app pool environment-variable mechanism, in-process hosting under IIS, certificate binding, Windows-authentication SQL logins, the Crystal Reports print worker under the app pool identity, and every item in §11. These rules are written to standard IIS behaviour but **no claim is made that they work until you run §11 on the server**.
