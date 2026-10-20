-- Company-level and unit-level targets (portal database SAPB1PortalAdmin). ADDITIVE ONLY: nothing is dropped or rewritten.
-- Existing rows become Scope = 'Salesperson' (the default), so the current Salesperson Targets data and page are unchanged.
-- Applied automatically at API start-up by PortalSchemaBootstrapper when the login has DDL rights; otherwise run once in SSMS
-- against SAPB1PortalAdmin (as sa / db_owner).
--   Scope = 'Salesperson' : SapSlpCode > 0 (a real SAP salesperson), UnitCode = a unit or -1 (all units)
--   Scope = 'Unit'        : SapSlpCode = 0 (no salesperson), UnitCode = the unit's OLCT.Code
--   Scope = 'Company'     : SapSlpCode = 0, UnitCode = -1
-- The existing unique index (CompanyCode, SapSlpCode, UnitCode, TargetPeriodType, PeriodStartDate, LiveSlot) therefore also prevents duplicate
-- live company / unit targets for the same period; overlapping periods are refused by the service.
-- ROLLBACK (only if no company/unit targets exist, or export them first):
--   ALTER TABLE dbo.SalespersonTargets DROP CONSTRAINT CK_SalespersonTargets_Scope;
--   ALTER TABLE dbo.SalespersonTargets DROP CONSTRAINT DF_SalespersonTargets_Scope;
--   ALTER TABLE dbo.SalespersonTargets DROP COLUMN Scope;

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

IF OBJECT_ID('dbo.SalespersonTargets', 'U') IS NOT NULL AND COL_LENGTH('dbo.SalespersonTargets', 'Scope') IS NULL
    ALTER TABLE dbo.SalespersonTargets ADD Scope NVARCHAR(12) NOT NULL CONSTRAINT DF_SalespersonTargets_Scope DEFAULT ('Salesperson');
GO

IF OBJECT_ID('dbo.SalespersonTargets', 'U') IS NOT NULL AND COL_LENGTH('dbo.SalespersonTargets', 'Scope') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_SalespersonTargets_Scope')
    ALTER TABLE dbo.SalespersonTargets ADD CONSTRAINT CK_SalespersonTargets_Scope
        CHECK (Scope IN ('Company','Unit','Salesperson') AND ((Scope = 'Salesperson' AND SapSlpCode > 0) OR (Scope <> 'Salesperson' AND SapSlpCode = 0)));
GO
