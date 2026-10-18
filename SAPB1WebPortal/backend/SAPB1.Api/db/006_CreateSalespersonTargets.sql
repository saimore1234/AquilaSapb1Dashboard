-- Salesperson Targets (portal database SAPB1PortalAdmin). Target PLANS live here; actual sales stay in SAP B1.
-- Header = SalespersonTargets (one salesperson / unit / period); optional item-wise rows = SalespersonTargetLines.
-- Applied automatically (idempotently) at API start-up by PortalSchemaBootstrapper when the login has DDL rights;
-- otherwise run this file once in SSMS against SAPB1PortalAdmin (as sa / db_owner).
-- ROLLBACK (removes all target data - export first!):
--   DROP TABLE dbo.SalespersonTargetLines; DROP TABLE dbo.SalespersonTargetAudit; DROP TABLE dbo.SalespersonTargets;

-- Required for the computed-column index (sqlcmd needs -I; SSMS/SqlClient already default to ON).
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

-- A previous (header-only) version of this script created tables without HasItems / the line table. If those tables are
-- still EMPTY they are dropped and recreated below; if they already hold data this stops so nothing is lost silently.
IF OBJECT_ID('dbo.SalespersonTargets', 'U') IS NOT NULL AND COL_LENGTH('dbo.SalespersonTargets', 'HasItems') IS NULL
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.SalespersonTargets)
        THROW 50001, 'dbo.SalespersonTargets holds data from the older version; ask for the upgrade script instead of running this one.', 1;
    DROP TABLE IF EXISTS dbo.SalespersonTargetAudit;
    DROP TABLE dbo.SalespersonTargets;
END;

IF OBJECT_ID('dbo.SalespersonTargets', 'U') IS NULL
CREATE TABLE dbo.SalespersonTargets (
    Id               INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SalespersonTargets PRIMARY KEY,
    CompanyCode      NVARCHAR(50)  NOT NULL,                  -- portal company (from the JWT), never from the client
    SapSlpCode       INT           NOT NULL,                  -- SAP OSLP.SlpCode (stable id, not the name)
    SalespersonName  NVARCHAR(200) NOT NULL,                  -- snapshot for history/display
    UnitCode         INT           NOT NULL CONSTRAINT DF_SalespersonTargets_Unit DEFAULT (-1), -- SAP OLCT.Code; -1 = all units
    UnitName         NVARCHAR(100) NULL,
    FinancialYear    NVARCHAR(9)   NOT NULL,                  -- e.g. 2026-27 (April-March); for Custom = FY of the start date
    TargetPeriodType NVARCHAR(10)  NOT NULL,                  -- Monthly | Quarterly | Annual | Custom (explicit From/To dates)
    PeriodStartDate  DATE          NOT NULL,
    PeriodEndDate    DATE          NOT NULL,
    TargetAmount     DECIMAL(19,2) NOT NULL,                  -- for item-wise targets = sum of the line amounts
    CurrencyCode     NVARCHAR(3)   NOT NULL CONSTRAINT DF_SalespersonTargets_Cur DEFAULT ('INR'),
    HasItems         BIT           NOT NULL CONSTRAINT DF_SalespersonTargets_HasItems DEFAULT (0), -- 1 = item-wise (rows in SalespersonTargetLines)
    Remarks          NVARCHAR(500) NULL,
    Status           NVARCHAR(12)  NOT NULL,                  -- Draft | Submitted | Approved | Rejected | Superseded
    RevisionOfId     INT           NULL,                      -- set when this draft revises an approved target
    ReviewRemarks    NVARCHAR(500) NULL,                      -- approver's comment on approve/reject
    CreatedBy        NVARCHAR(100) NOT NULL,
    CreatedAt        DATETIME2     NOT NULL CONSTRAINT DF_SalespersonTargets_Created DEFAULT (SYSUTCDATETIME()),
    UpdatedBy        NVARCHAR(100) NULL,
    UpdatedAt        DATETIME2     NULL,
    SubmittedBy      NVARCHAR(100) NULL,
    SubmittedAt      DATETIME2     NULL,
    ReviewedBy       NVARCHAR(100) NULL,
    ReviewedAt       DATETIME2     NULL,
    ApprovedBy       NVARCHAR(100) NULL,
    ApprovedAt       DATETIME2     NULL,
    CONSTRAINT CK_SalespersonTargets_Amount CHECK (TargetAmount >= 0),
    CONSTRAINT CK_SalespersonTargets_Period CHECK (TargetPeriodType IN ('Monthly','Quarterly','Annual','Custom') AND PeriodEndDate >= PeriodStartDate),
    CONSTRAINT CK_SalespersonTargets_Status CHECK (Status IN ('Draft','Submitted','Approved','Rejected','Superseded'))
);

-- LiveSlot is 0 for a "live" amount-only target (Approved, or an in-progress ORIGINAL draft/submission) and the row's own Id
-- otherwise (Rejected, Superseded, revision drafts, and ALL item-wise targets), so the unique index below only ever collides
-- live amount-only rows. Item-wise targets are protected by an item-level overlap check in the service instead.
-- (SQL Server filtered indexes can't express this OR, hence the persisted computed column.)
IF COL_LENGTH('dbo.SalespersonTargets', 'LiveSlot') IS NULL
ALTER TABLE dbo.SalespersonTargets ADD LiveSlot AS (CASE WHEN HasItems = 0 AND (Status = 'Approved' OR (Status IN ('Draft','Submitted') AND RevisionOfId IS NULL)) THEN 0 ELSE Id END) PERSISTED;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_SalespersonTargets_Live' AND object_id = OBJECT_ID('dbo.SalespersonTargets'))
CREATE UNIQUE INDEX UX_SalespersonTargets_Live
    ON dbo.SalespersonTargets (CompanyCode, SapSlpCode, UnitCode, TargetPeriodType, PeriodStartDate, LiveSlot);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_SalespersonTargets_OpenRevision' AND object_id = OBJECT_ID('dbo.SalespersonTargets'))
CREATE UNIQUE INDEX UX_SalespersonTargets_OpenRevision
    ON dbo.SalespersonTargets (CompanyCode, RevisionOfId)
    WHERE RevisionOfId IS NOT NULL AND Status IN ('Draft','Submitted');

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SalespersonTargets_Company_FY' AND object_id = OBJECT_ID('dbo.SalespersonTargets'))
CREATE INDEX IX_SalespersonTargets_Company_FY ON dbo.SalespersonTargets (CompanyCode, FinancialYear, Status);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SalespersonTargets_Company_Slp' AND object_id = OBJECT_ID('dbo.SalespersonTargets'))
CREATE INDEX IX_SalespersonTargets_Company_Slp ON dbo.SalespersonTargets (CompanyCode, SapSlpCode, PeriodStartDate, PeriodEndDate);

-- Item-wise rows: one row per SAP item per target. Name/group/UOM are snapshots so history survives item master changes.
IF OBJECT_ID('dbo.SalespersonTargetLines', 'U') IS NULL
CREATE TABLE dbo.SalespersonTargetLines (
    Id             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SalespersonTargetLines PRIMARY KEY,
    TargetId       INT           NOT NULL,
    ItemCode       NVARCHAR(50)  NOT NULL,                    -- SAP OITM.ItemCode
    ItemName       NVARCHAR(200) NULL,
    ItemGroup      NVARCHAR(100) NULL,
    Uom            NVARCHAR(50)  NULL,
    TargetQuantity DECIMAL(19,3) NOT NULL CONSTRAINT DF_SalespersonTargetLines_Qty DEFAULT (0),
    TargetAmount   DECIMAL(19,2) NOT NULL CONSTRAINT DF_SalespersonTargetLines_Amt DEFAULT (0),
    Remarks        NVARCHAR(300) NULL,
    CONSTRAINT FK_SalespersonTargetLines_Target FOREIGN KEY (TargetId) REFERENCES dbo.SalespersonTargets(Id) ON DELETE CASCADE,
    CONSTRAINT UQ_SalespersonTargetLines_Item UNIQUE (TargetId, ItemCode),
    CONSTRAINT CK_SalespersonTargetLines_NonNegative CHECK (TargetQuantity >= 0 AND TargetAmount >= 0 AND (TargetQuantity > 0 OR TargetAmount > 0))
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SalespersonTargetLines_Item' AND object_id = OBJECT_ID('dbo.SalespersonTargetLines'))
CREATE INDEX IX_SalespersonTargetLines_Item ON dbo.SalespersonTargetLines (ItemCode, TargetId);

IF OBJECT_ID('dbo.SalespersonTargetAudit', 'U') IS NULL
CREATE TABLE dbo.SalespersonTargetAudit (
    Id            BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SalespersonTargetAudit PRIMARY KEY,
    TargetId      INT           NOT NULL,
    CompanyCode   NVARCHAR(50)  NOT NULL,
    Action        NVARCHAR(30)  NOT NULL,                     -- Created | Updated | Submitted | Approved | Rejected | Revised | Superseded | Deleted
    PerformedBy   NVARCHAR(100) NOT NULL,
    PerformedAt   DATETIME2     NOT NULL CONSTRAINT DF_SalespersonTargetAudit_At DEFAULT (SYSUTCDATETIME()),
    Detail        NVARCHAR(1000) NULL
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SalespersonTargetAudit_Target' AND object_id = OBJECT_ID('dbo.SalespersonTargetAudit'))
CREATE INDEX IX_SalespersonTargetAudit_Target ON dbo.SalespersonTargetAudit (TargetId, PerformedAt);
