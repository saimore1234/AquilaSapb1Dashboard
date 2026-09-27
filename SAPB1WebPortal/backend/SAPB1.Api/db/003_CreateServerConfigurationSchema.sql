-- Database-driven SAP B1 server/company configuration (SAPB1PortalAdmin).
-- Lets an Administrator add/edit/enable/disable/delete a company/server via
-- Administration > Server / Company Configuration, without editing
-- appsettings.json/user-secrets or redeploying. See ICompanyConfigurationProvider
-- and SqlServerConfigurationService for how this table is consumed at runtime;
-- companies with no row here (or no ACTIVE row) keep working exactly as before,
-- via the existing CompanyDatabases/CompanyConnectionStrings/
-- SapServiceLayerCredentials file/user-secrets configuration (fallback, not
-- removed by this migration).
-- Run once with: sqlcmd -S <server> -d SAPB1PortalAdmin -E -C -i 003_CreateServerConfigurationSchema.sql

IF OBJECT_ID('dbo.ServerConfigurations', 'U') IS NULL
CREATE TABLE dbo.ServerConfigurations (
    Id                    INT IDENTITY(1,1) PRIMARY KEY,
    CompanyCode           NVARCHAR(50)  NOT NULL,   -- matches the JWT companyDb claim / ICompanyRegistry Code
    CompanyName           NVARCHAR(200) NOT NULL,
    SapCompanyDb          NVARCHAR(100) NOT NULL,   -- CompanyEntry.ServiceLayerCompanyDb
    ServiceLayerUrl       NVARCHAR(500) NOT NULL,
    SapUsername           NVARCHAR(200) NOT NULL,
    SapPasswordEncrypted  NVARCHAR(MAX) NOT NULL,   -- Data Protection API ciphertext, never plaintext
    SqlServer             NVARCHAR(200) NOT NULL,   -- host[\instance][,port]
    SqlDatabase           NVARCHAR(200) NOT NULL,
    SqlUsername            NVARCHAR(200) NOT NULL,
    SqlPasswordEncrypted  NVARCHAR(MAX) NOT NULL,   -- Data Protection API ciphertext, never plaintext
    SqlExtraOptions       NVARCHAR(500) NULL,       -- e.g. "Encrypt=True;TrustServerCertificate=True"
    IsActive              BIT NOT NULL DEFAULT 1,
    LastTestedAtUtc       DATETIME2 NULL,
    LastTestResult        NVARCHAR(20) NULL,        -- 'Success' | 'Failed' | NULL — never raw error detail
    CreatedAt             DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt             DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CreatedBy             NVARCHAR(200) NULL,
    UpdatedBy             NVARCHAR(200) NULL
);

-- One config row per portal company code. SQL Server's default collation is
-- case-insensitive, matching the OrdinalIgnoreCase lookups already used by
-- CompanyRegistry/CompanyConnectionFactory/SapServiceLayerSessionManager.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_ServerConfigurations_CompanyCode')
CREATE UNIQUE INDEX UQ_ServerConfigurations_CompanyCode ON dbo.ServerConfigurations(CompanyCode);

-- Deliberately NOT a unique constraint: two portal codes legitimately pointing
-- at the same SAP company DB (e.g. a DR/test alias) is a valid edge case, not
-- an error. SqlServerConfigurationService does a soft duplicate check on
-- Create/Update against this pair and surfaces a non-blocking warning instead.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ServerConfigurations_SapCompanyDb')
CREATE INDEX IX_ServerConfigurations_SapCompanyDb ON dbo.ServerConfigurations(SapCompanyDb, ServiceLayerUrl);

IF OBJECT_ID('dbo.ServerConfigurationAuditLog', 'U') IS NULL
CREATE TABLE dbo.ServerConfigurationAuditLog (
    Id                    INT IDENTITY(1,1) PRIMARY KEY,
    ServerConfigurationId INT NULL,                 -- no FK on purpose: row survives config deletion
    CompanyCode           NVARCHAR(50) NOT NULL,     -- snapshot, survives config deletion
    Action                NVARCHAR(30) NOT NULL,     -- Create|Update|Enable|Disable|Delete|TestSql|TestSap|TestAll
    PerformedBy           NVARCHAR(200) NOT NULL,
    PerformedAtUtc        DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    Success               BIT NOT NULL,
    Detail                NVARCHAR(1000) NULL        -- safe summary only — never a password, token, or raw exception
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ServerConfigurationAuditLog_CompanyCode_PerformedAtUtc')
CREATE INDEX IX_ServerConfigurationAuditLog_CompanyCode_PerformedAtUtc
    ON dbo.ServerConfigurationAuditLog(CompanyCode, PerformedAtUtc DESC);
