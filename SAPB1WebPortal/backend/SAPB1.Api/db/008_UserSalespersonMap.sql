-- Links portal users to SAP salespersons (portal database SAPB1PortalAdmin). ADDITIVE ONLY.
-- A user with a role listed in SalesScope:RestrictedRoles (default: Sales) — or any user who has a row here — only sees THEIR salesperson's
-- customers (Business Partner master), sales quotations / orders / deliveries / invoices / credit memos, reports and targets.
-- A restricted user with no row here sees NOTHING until an administrator links them (Administration > Users, or the script
-- Link-Users-To-Salespersons.sql). One user can be linked to several SAP salesperson records (several rows).
-- Applied automatically at API start-up when the login may alter tables; otherwise run this file once in SSMS against SAPB1PortalAdmin.
-- ROLLBACK:  DROP TABLE dbo.UserSalespersonMap;

IF OBJECT_ID('dbo.UserSalespersonMap', 'U') IS NULL
CREATE TABLE dbo.UserSalespersonMap (
    UserId      INT           NOT NULL,
    CompanyCode NVARCHAR(50)  NOT NULL,          -- portal company (from the login token)
    SapSlpCode  INT           NOT NULL,          -- SAP OSLP.SlpCode
    CreatedBy   NVARCHAR(100) NULL,
    CreatedAt   DATETIME2     NOT NULL CONSTRAINT DF_UserSalespersonMap_At DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_UserSalespersonMap PRIMARY KEY (UserId, CompanyCode, SapSlpCode),
    CONSTRAINT FK_UserSalespersonMap_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(Id) ON DELETE CASCADE
);
