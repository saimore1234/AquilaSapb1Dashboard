# Database Configuration Guide

SQL Server 2019 on the same Windows Server as IIS. The application touches three things:

| Store | What it holds | Access the application needs |
|---|---|---|
| **SAP B1 company database** (today `AOPL_LIVE_BRANCH`) | All business data the dashboards report on | **Read-only** (`db_datareader`). The application never writes to it |
| **Portal database `SAPB1PortalAdmin`** | Portal users, roles, page permissions, salesperson targets, audit, stored server configuration | Read/write + create-if-missing tables (`db_datareader`, `db_datawriter`, `db_ddladmin`) |
| **SAP Service Layer** (HTTPS, port 50000) | Only the *Create Purchase Request* feature | A dedicated SAP user, used for that one write endpoint |

No SAP table or SAP database object is created, altered or deleted by this deployment. The only DDL the application runs is idempotent `CREATE … IF NOT EXISTS` in the **portal** database at start-up (`PortalSchemaBootstrapper`); the scripts in `backend/SAPB1.Api/db/` are the same objects if you prefer to run them by hand.

## 1. Where the settings live

Nothing is hard-coded and nothing secret is in source control.

| Setting | Variable (application pool `AquilaApi`) | Notes |
|---|---|---|
| Portal database | `PortalDb__ConnectionString` | one connection for all companies |
| SAP company database | `CompanyConnectionStrings__<Code>` (e.g. `…__AOPL`) | one per company code |
| Company allow-list (login dropdown) | `appsettings.json` → `CompanyDatabases:Companies` | **no secrets**; each `Code` needs a matching connection string variable |
| Service Layer URL | `appsettings.json` → `CompanyDatabases:Companies[].ServiceLayerUrl` | e.g. `https://localhost:50000/b1s/v1` |
| Service Layer account | `SapServiceLayerCredentials__<Code>__Username/Password` | only for Purchase Requests |
| JWT signing key | `Jwt__Key` | ≥ 32 random chars |
| Portal administrator | `Auth__PortalUsername`, `Auth__PortalPasswordHash` | hash created by the API itself |

Set them with `scripts\Set-AquilaSecrets.ps1`. Multi-company behaviour is unchanged: the company is taken from the login token and every query runs on that company's connection.

## 2. Connection string formats

SQL authentication (recommended — works the same everywhere):
```
Server=localhost;Database=AOPL_LIVE_BRANCH;User Id=sapb1_portal_reader;Password=<password>;TrustServerCertificate=True
Server=localhost;Database=SAPB1PortalAdmin;User Id=aquila_portal;Password=<password>;TrustServerCertificate=True
```
* `Server=localhost` (or the instance name, e.g. `localhost\SAP`) because SQL Server and IIS are on the same machine; use a named instance's port if needed (`Server=localhost,1433`).
* `TrustServerCertificate=True` is acceptable for a same-machine connection. If SQL Server is on another machine, install a proper certificate on it and use `Encrypt=True;TrustServerCertificate=False`.
* Never use the `sa` login.

Windows authentication alternative for the **portal** database (no password at all): the pool runs as `IIS APPPOOL\AquilaApi`, which can be given a SQL login (§4). Connection string `Server=localhost;Database=SAPB1PortalAdmin;Trusted_Connection=True;TrustServerCertificate=True`. Note: your current development setup uses exactly this style (`Trusted_Connection=True`), which on IIS means the **app pool identity**, not your own account — create the login in §4 or switch to SQL authentication.

## 3. Create the SQL logins (run in SSMS or `sqlcmd` as an administrator)

Use strong, unique passwords and keep them in your password manager.

```sql
-- A) Read-only login for the SAP company database
CREATE LOGIN sapb1_portal_reader WITH PASSWORD = '<strong password>', CHECK_POLICY = ON;
USE [AOPL_LIVE_BRANCH];
CREATE USER sapb1_portal_reader FOR LOGIN sapb1_portal_reader;
ALTER ROLE db_datareader ADD MEMBER sapb1_portal_reader;       -- read only; nothing else

-- B) Portal database and its login
CREATE DATABASE SAPB1PortalAdmin;                                  -- skip if it already exists
CREATE LOGIN aquila_portal WITH PASSWORD = '<strong password>', CHECK_POLICY = ON;
USE [SAPB1PortalAdmin];
CREATE USER aquila_portal FOR LOGIN aquila_portal;
ALTER ROLE db_datareader  ADD MEMBER aquila_portal;
ALTER ROLE db_datawriter  ADD MEMBER aquila_portal;
ALTER ROLE db_ddladmin    ADD MEMBER aquila_portal;                -- lets start-up create missing portal tables
```
If your existing `sapb1_portal_reader` login is already in use today, simply reuse it — it is the login the running system uses.

**Windows-authentication variant for the portal DB:**
```sql
CREATE LOGIN [IIS APPPOOL\AquilaApi] FROM WINDOWS;
USE [SAPB1PortalAdmin];
CREATE USER [IIS APPPOOL\AquilaApi] FOR LOGIN [IIS APPPOOL\AquilaApi];
ALTER ROLE db_datareader ADD MEMBER [IIS APPPOOL\AquilaApi];
ALTER ROLE db_datawriter ADD MEMBER [IIS APPPOOL\AquilaApi];
ALTER ROLE db_ddladmin   ADD MEMBER [IIS APPPOOL\AquilaApi];
```
(The pool must exist first; run `Setup-IIS.ps1`.)

## 4. Moving an existing portal database to the new server

If SQL Server is the **same** server as today, nothing to move. If you are migrating servers:

1. On the old server: `BACKUP DATABASE SAPB1PortalAdmin TO DISK = 'D:\Backups\SAPB1PortalAdmin.bak' WITH COMPRESSION, CHECKSUM;`
2. Copy the `.bak` to the new server and `RESTORE DATABASE SAPB1PortalAdmin FROM DISK = '…' WITH MOVE …;`
3. Re-create the logins (§3) — restored users are orphaned: `ALTER USER aquila_portal WITH LOGIN = aquila_portal;`
4. **Copy the Data Protection keys** (`C:\ProgramData\SAPB1WebPortal\DataProtection-Keys\key-*.xml` on the old machine → `D:\AquilaDashboard\Keys\` on the new one). Without them the SAP/SQL passwords stored in *Administration → Server Configuration* cannot be decrypted.
5. The SAP company database is restored/attached by your SAP administrator as usual; the application only needs the read-only login.

## 5. SQL Server network settings

* The dashboard talks to SQL Server **locally**; nothing outside the server needs to reach it. Keep **TCP 1433 closed** in the Windows firewall (and at the network edge).
* SQL Server Configuration Manager → *Protocols*: enable **TCP/IP** (or Shared Memory is enough for `localhost`). If you use a named instance, make sure the SQL Browser service is running or use the port number.
* Mixed-mode authentication is required if you use SQL logins (SSMS → Server properties → Security → *SQL Server and Windows Authentication mode*; restart the service).
* Set `max server memory` so SQL Server leaves room for IIS and the API on the same machine.

## 6. Verify the connections

```powershell
# From the server, with the same logins the application will use
sqlcmd -S localhost -U sapb1_portal_reader -d AOPL_LIVE_BRANCH -Q "SELECT COUNT(*) FROM OINV"     # works
sqlcmd -S localhost -U sapb1_portal_reader -d AOPL_LIVE_BRANCH -Q "UPDATE OINV SET Comments=Comments WHERE 1=0"   # must FAIL (read-only)
sqlcmd -S localhost -U aquila_portal -d SAPB1PortalAdmin -Q "SELECT COUNT(*) FROM dbo.Users"
curl.exe -s http://127.0.0.1:5010/api/health/ready                                                # {"status":"ready","database":"reachable"}
```
(`-P` is deliberately not on the command line; `sqlcmd` prompts, or set `$env:SQLCMDPASSWORD` for the session and clear it afterwards.)

`/api/health/ready` only proves the **portal** database is reachable. A company database problem shows up at login or on the first report — check `Logs\api\`.

## 7. Adding another SAP company later

1. Create its read-only login/user as in §3 (A).
2. Add an entry to `CompanyDatabases:Companies` in `appsettings.json` (Code, Name, `ServiceLayerCompanyDb`, `ServiceLayerUrl`) — or add it from *Administration → Server Configuration*.
3. Run `.\Set-AquilaSecrets.ps1 -CompanyCodes AOPL,NEWCODE` and give the new connection string.
4. Add `SalesDashboard` / `SalesTurnover` unit settings for it if you use them (they are per company code).
5. Deploy, then log in and pick the company.

## 8. Data you must not touch by hand

* `dbo.ServerConfigurations` passwords are encrypted; edit them only through the Administration page.
* Do not delete rows from the `Users`, `Roles`, `RolePagePermissions` tables to "reset" access; use the Administration page.
* Changing `Jwt__Key` is safe (it only signs people out); losing the Data Protection keys is not (see §4.4).
