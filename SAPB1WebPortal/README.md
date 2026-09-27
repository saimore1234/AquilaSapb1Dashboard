# SAP Business One Web Portal — Phase 1

A read-only ASP.NET Core Web API over your SAP Business One (SQL Server) database, plus a
React web portal that consumes it. The API is designed so that a future Android/iOS app can
reuse the exact same endpoints — nothing here is web-only.

**Phase 1 scope:** Login, Dashboard, Customers, Suppliers, Items, Inventory — all read-only.
Sales, Purchase, Finance, global search, and any write operations are intentionally deferred
to later phases (see "Roadmap" below), per the project's own phased plan.

---

## 1. Requirements

- **.NET 8 SDK** — https://dotnet.microsoft.com/download
- **Node.js 18+** and npm
- **SQL Server** with an existing SAP Business One company database
- Visual Studio 2022 (17.8+) or VS Code with the C# Dev Kit extension
- A SQL Server login with **read-only** (`db_datareader`) access to the SAP B1 company database

> **Before writing SAP-specific SQL for your environment**, confirm: your SAP B1 version,
> SQL Server version, the company database name, and whether you're on SQL Server or HANA.
> This project is built for **SAP B1 on SQL Server only** — do not point it at a HANA database;
> the SQL in `Services/SqlSapB1Service.cs` uses SQL Server T-SQL syntax (`OFFSET/FETCH`,
> `OUTER APPLY`) that HANA does not support the same way.

---

## 2. Project structure

```
SAPB1WebPortal/
├── backend/SAPB1.Api/        ASP.NET Core 8 Web API
└── frontend/sap-b1-web/      React + TypeScript + Vite + Tailwind
```

---

## 3. SQL Server setup

1. Confirm you can already connect to your SAP B1 company database (e.g. `SBODemoUS`) with
   SQL Server Management Studio using SQL authentication.
2. **Create a dedicated read-only login** for this application — never reuse the SAP B1
   application user or `sa`:

   ```sql
   CREATE LOGIN sapb1_portal_reader WITH PASSWORD = 'ReplaceWithAStrongPassword!';
   USE [SBODemoUS];  -- your company database
   CREATE USER sapb1_portal_reader FOR LOGIN sapb1_portal_reader;
   ALTER ROLE db_datareader ADD MEMBER sapb1_portal_reader;
   ```

   Phase 1 never writes to SAP B1, so this account should have **no write permissions** at all.

---

## 4. Configuring credentials securely

**Preferred: Administration → Server / Company Configuration.** As of the database-driven
server/company configuration feature, an Administrator can add, edit, enable/disable, test, and
delete a SAP B1 company/server entirely from the UI (Administration → Server / Company
Configuration) — no `appsettings.json`/User Secrets edits or redeploy needed to onboard a new
client. This writes to `dbo.ServerConfigurations` in the portal database (see
`db/003_CreateServerConfigurationSchema.sql`), with SAP/SQL passwords encrypted at rest via the
ASP.NET Core Data Protection API (never plaintext, never returned by the API). A company
configured this way takes priority over anything below; the file/User-Secrets path described in
the rest of this section is now a **legacy fallback**, kept working for any company not yet
migrated to the database-driven config, and still useful for the very first company you set up
before an Administrator account exists to use the UI with.

**Back up the Data Protection key ring** (`DataProtection:KeysDirectory`, default
`%ProgramData%\SAPB1WebPortal\DataProtection-Keys`) — if it's ever lost, every password stored via
the admin UI becomes permanently undecryptable and must be re-entered per company via Edit.

**Never put real credentials in `appsettings.json`.** That file only holds the public,
non-secret company allow-list (`CompanyDatabases`) and is safe to commit. Real secrets go into
**User Secrets** (development) or **environment variables** (production/IIS).

Two independent secrets are needed: the JWT signing key, and one read-only SQL connection
string **per company database** (used for the fast direct-SQL report/list reads). Portal login
itself is a single shared credential you set once (section 7) — see that section for why this
project isn't using real SAP B1 Service Layer authentication in this environment, and how to
switch back to it later.

### Legacy fallback (file/User Secrets) — Development, User Secrets

From `backend/SAPB1.Api/`:

```bash
dotnet user-secrets init
dotnet user-secrets set "Jwt:Key" "a-random-string-of-at-least-32-characters"

# One of these per company listed in appsettings.json's CompanyDatabases.Companies:
dotnet user-secrets set "CompanyConnectionStrings:STEST" "Server=YOUR_SERVER;Database=STEST;User Id=sapb1_portal_reader;Password=YOUR_PASSWORD;TrustServerCertificate=True"
dotnet user-secrets set "CompanyConnectionStrings:COMPANY_A" "Server=YOUR_SERVER;Database=COMPANY_A;User Id=sapb1_portal_reader;Password=YOUR_PASSWORD;TrustServerCertificate=True"
```

The `{Code}` in `CompanyConnectionStrings:{Code}` must exactly match a `Code` entry under
`CompanyDatabases.Companies` in `appsettings.json`. A company with no matching connection
string will still appear in the login dropdown, but every data endpoint will fail with a clear
"no connection string configured" error until you add one.

### Production — environment variables

ASP.NET Core maps `__` to nested config sections, so on your IIS/Windows Server host set:

```
CompanyConnectionStrings__STEST     = Server=...;Database=STEST;User Id=...;Password=...;
CompanyConnectionStrings__COMPANY_A = Server=...;Database=COMPANY_A;User Id=...;Password=...;
Jwt__Key = <a long random production secret, different from dev>
```

Set these as actual Windows environment variables (or in the IIS Application Pool's
`applicationHost.config`/`web.config` `<environmentVariables>`), never in `appsettings.json`.

---

## 5. Running the backend

```bash
cd backend/SAPB1.Api
dotnet restore
dotnet run
```

The API starts on `https://localhost:7010` (see `Properties/launchSettings.json`). Swagger UI
opens automatically at `https://localhost:7010/swagger`, where every endpoint is listed and
secured endpoints can be tested with the padlock icon (paste `Bearer <token>` or just the raw
token, depending on your Swashbuckle version's UI) after logging in via `POST /api/auth/login`.

---

## 6. Running the frontend

```bash
cd frontend/sap-b1-web
npm install
cp .env.example .env   # adjust VITE_API_BASE_URL if your API runs on a different port
npm run dev
```

Open `http://localhost:5173`. Make sure `Cors:AllowedOrigins` in the backend's
`appsettings.json` includes this URL (it does, by default).

---

## 7. First login (portal-managed credential + company selection)

Login uses a single **portal-managed** username/password (not a real SAP B1 user) to open the
portal, then the **Company** dropdown on the login screen picks which SAP B1 company database
every subsequent request reads from — that company selection/routing is fully real and
server-enforced (see section 14), independent of how the login step itself is implemented.

```bash
cd backend/SAPB1.Api

# Generate a password hash (does not start the web server):
dotnet run -- hash-password "YourStrongPassword123!"
# → prints something like 100000.base64salt.base64hash

dotnet user-secrets set "Auth:PortalUsername" "admin"
dotnet user-secrets set "Auth:PortalPasswordHash" "<paste the hash from above>"
```

Every successful login is treated as the portal's broadest read role (`Admin` — Phase 1 has no
write endpoints, so this only affects which read-only pages are visible).

### Why not real SAP B1 user authentication?

This codebase **does implement genuine SAP B1 Service Layer authentication**
(`Services/SapServiceLayerAuthenticator.cs`, `ISapB1Authenticator`) — it POSTs the entered
username/password straight to SAP B1's own `/Login` endpoint and only succeeds if SAP B1 itself
accepts them. It is currently **not wired into the login flow** because this environment's
Service Layer sits behind an SLD (System Landscape Directory) / Keycloak SSO layer that fails
intermittently server-side (`error -304 "Fail to NONE-SSO login from SLD"`) regardless of
whether the SAP B1 password is correct — a SAP B1 server configuration/licensing issue outside
this codebase, not a bug here.

To switch back once that's resolved: uncomment the `AddHttpClient("SapServiceLayer")` /
`ISapB1Authenticator` registrations in `Program.cs`, and change `AuthService` to depend on
`ISapB1Authenticator` and call it instead of the portal-credential check — nothing else in the
pipeline (JWT issuing, company context, controllers) needs to change.

---

## 8. API reference (Phase 1)

All responses use the envelope:
```json
{ "success": true, "data": { }, "message": null, "errors": [] }
```

| Method | Endpoint | Roles |
|---|---|---|
| GET | `/api/auth/companies` | — (anonymous, login dropdown) |
| POST | `/api/auth/login` | — |
| POST | `/api/auth/logout` | any authenticated user |
| GET | `/api/dashboard` | Admin, Manager, Sales, Purchase, Accounts, Inventory |
| GET | `/api/customers?page=&pageSize=&search=&group=&active=` | Admin, Manager, Sales, Accounts |
| GET | `/api/customers/{cardCode}` | Admin, Manager, Sales, Accounts |
| GET | `/api/suppliers?page=&pageSize=&search=&group=&active=` | Admin, Manager, Purchase, Accounts |
| GET | `/api/suppliers/{cardCode}` | Admin, Manager, Purchase, Accounts |
| GET | `/api/items?page=&pageSize=&search=&group=&active=` | Admin, Manager, Sales, Purchase, Inventory |
| GET | `/api/items/{itemCode}` | Admin, Manager, Sales, Purchase, Inventory |
| GET | `/api/inventory?page=&pageSize=&warehouse=&itemGroup=&status=` | Admin, Manager, Inventory, Sales, Purchase |
| GET | `/api/inventory/item/{itemCode}` | same |
| GET | `/api/inventory/warehouse/{warehouseCode}` | same |

### Example request/response

```
GET /api/customers?page=1&pageSize=20&search=acme
Authorization: Bearer eyJhbGciOi...
```
```json
{
  "success": true,
  "data": {
    "items": [
      { "cardCode": "C0001", "cardName": "Acme Corp", "groupName": "Retail",
        "phone": "555-1000", "mobile": null, "email": "ap@acme.com",
        "salesEmployee": "J. Rao", "balance": 1250.50, "creditLimit": 5000, "active": true }
    ],
    "page": 1, "pageSize": 20, "totalCount": 1, "totalPages": 1
  },
  "message": null,
  "errors": []
}
```

---

## 9. SQL queries used (per module)

Every query lives in `backend/SAPB1.Api/Services/SqlSapB1Service.cs`, with the tables/fields
documented in the class-level comment at the top of that file (OCRD, CRD1, OCRG, OSLP, OITM,
OITB, OITW, OWHS, ORDR, OPOR, ODLN, OINV, OPCH). All are parameterized Dapper queries — never
string concatenation — with explicit column lists rather than `SELECT *`.

**Field names can vary slightly by SAP B1 version/localization** (e.g. `LicTradNum` for GSTIN
only exists if the Indian localization is active). If a query fails with an "invalid column
name" error, open SQL Server Management Studio, inspect the real column names on your database,
and adjust the query — the comments explain the purpose of each joined table so the fix is
localized to one query.

---

## 10. Security decisions

- **JWT bearer auth**, 60-minute expiry by default (`Jwt:ExpiryMinutes`), HMAC-SHA256 signed
  with a secret that must be ≥32 characters and is never checked into source control.
- **Password hashing**: PBKDF2/SHA-256, 100,000 iterations, random 16-byte salt per user,
  constant-time comparison (`CryptographicOperations.FixedTimeEquals`) to avoid timing attacks.
- **Role-based authorization** on every controller via `[Authorize(Roles = "...")]`.
- **No SQL injection surface**: every query is parameterized through Dapper; the codebase has
  no string-concatenated SQL anywhere.
- **CORS** is locked to `Cors:AllowedOrigins` — only the configured frontend origin(s) may call
  the API from a browser.
- **HTTPS** is enforced (`UseHttpsRedirection`); in production, `RequireHttpsMetadata` is also
  enabled for the JWT middleware.
- **No credentials ever reach the browser or a mobile app** — React and any future mobile client
  only ever hold a JWT, never a SQL connection string or SAP B1 credentials.
- **Logging**: Serilog writes structured logs to console + rolling file. Passwords, JWTs, and
  connection strings are never logged — login failures log the *fact* of failure, not the
  attempted password; the global exception middleware logs full exception details server-side
  but returns a generic message to the client in production.
- **Global exception handling** (`Middleware/ExceptionMiddleware.cs`) ensures unhandled errors
  never leak stack traces or internal details to callers outside Development.
- **Read-only by design**: the SQL login this API uses should have `db_datareader` only. Phase 1
  performs no INSERT/UPDATE/DELETE against SAP B1 anywhere in the codebase.

---

## 11. Swagger

Available at `/swagger` when running in Development. Every endpoint is listed; secured ones show
a padlock. Click **Authorize**, obtain a token via `POST /api/auth/login` first, then paste it in
to test authenticated `GET` requests interactively.

---

## 12. Testing

Phase 1 ships as source code ready for you to add test projects against (e.g.
`dotnet new xunit -o backend/SAPB1.Api.Tests`). Suggested cases to add first, matching the
scenarios called out in the original spec:

- **Login**: valid credentials → 200 + token; invalid password → 401 with generic message;
  unknown username → 401 with the same generic message (no user enumeration).
- **Unauthorized access**: calling any `/api/*` endpoint without a token → 401; calling
  `/api/suppliers` as a `Sales`-only user → 403.
- **Customer/Supplier/Item search**: `search=` param matches on code/name partials; unmatched
  search returns an empty `items` array with `totalCount: 0`, not an error.
- **Pagination**: `page=2&pageSize=5` returns the correct slice and `totalPages` is consistent
  with `totalCount`.
- **Invalid document number** (customer/supplier/item not found): `GET /api/customers/NOPE` →
  404 with `success: false`.
- **Database unavailable**: stop SQL Server, hit any data endpoint → 500 with the generic
  "unexpected error" message (never a raw SQL exception) in Production mode, and the real
  exception in the `errors` array only in Development.

A manual smoke test: `dotnet run --project backend/SAPB1.Api`, open Swagger, log in, then call
`/api/dashboard`, `/api/customers`, `/api/items`, `/api/inventory` in sequence.

---

## 13. Production deployment / IIS

1. `dotnet publish backend/SAPB1.Api -c Release -o ./publish`
2. On the Windows Server host, install the **ASP.NET Core Hosting Bundle** matching .NET 8.
3. Create an IIS site pointing at `./publish`, application pool set to **No Managed Code**
   (ASP.NET Core is self-hosted via Kestrel behind IIS as a reverse proxy).
4. Set the environment variables from section 4 (production) on the Application Pool or via
   `web.config`'s `<environmentVariables>` — never in `appsettings.json`.
5. Bind HTTPS with a real certificate; do not serve the API over plain HTTP in production.
6. `npm run build` the frontend (`frontend/sap-b1-web`) and deploy the `dist/` folder to a
   static site (IIS static site, Azure Static Web Apps, Nginx, etc.), with `VITE_API_BASE_URL`
   set at build time to the production API URL.
7. Update `Cors:AllowedOrigins` in production configuration to the real frontend domain.

---

## 14. Roadmap (not built yet — by design)

Phase 1 deliberately stops here. Future phases, in order:

1. **Sales module** — Quotation → Order → Delivery → Invoice → Credit Memo, with document
   relationships.
2. **Purchase module** — Request → Quotation → Order → Goods Receipt → A/P Invoice.
3. **Finance module** — outstanding reports, incoming/outgoing payments, journal entries.
4. **Global document search** across all document types.
5. **Controlled write operations** — once the read-only architecture has proven stable, add a
   `ServiceLayerSapB1Service` implementation of `ISapB1Service` (see the interface's XML docs)
   that uses the SAP B1 Service Layer/DI API instead of direct SQL, since writes need to go
   through B1's own business logic, numbering, and approval rules — direct SQL writes to B1
   are not safe and are intentionally never implemented here.
6. **React Native mobile app** reusing the exact same `/api/*` endpoints — same JWT login flow,
   same DTOs. No backend changes required to add it.

---

## 15. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `No connection string configured for company '{Code}'` | Run `dotnet user-secrets set "CompanyConnectionStrings:{Code}" "..."` for that company |
| `Jwt:Key is missing or too short` on startup | Set `Jwt:Key` via user-secrets/env var, ≥32 chars |
| Login always fails with "Invalid company, username or password" | Confirm the SAP B1 Service Layer is reachable at the company's `ServiceLayerUrl` and the credentials work in the normal SAP B1 client; check the API log for the real Service Layer error code |
| Login fails only in Development, works via `curl`/Postman | The local Service Layer's self-signed cert — confirm `SapServiceLayer:AllowInvalidCertificate` is `true` in `appsettings.Development.json` |
| A company doesn't appear in the login dropdown | Add/enable it via Administration → Server / Company Configuration (preferred), or add it to `CompanyDatabases.Companies` in `appsettings.json` (legacy fallback) |
| A database-driven company's Test SQL/SAP fails but the same credentials work elsewhere | Check the server log for the real error (never shown to the client); if it's a decrypt error, the Data Protection key ring changed — re-enter that company's passwords via Edit |
| 401 immediately after a successful login | Check `Jwt:Issuer`/`Jwt:Audience` match between token generation and validation (they read from the same config, so this is usually a stale/old token — log in again) |
| CORS error in the browser console | Add your frontend's exact origin to `Cors:AllowedOrigins` |
| "Invalid column name" SQL errors | Your SAP B1 version/localization has different field names than assumed — see section 9 |
| Frontend shows "Network Error" | Confirm the backend is running and `VITE_API_BASE_URL` in `.env` matches its URL, including the trailing `/api` |
