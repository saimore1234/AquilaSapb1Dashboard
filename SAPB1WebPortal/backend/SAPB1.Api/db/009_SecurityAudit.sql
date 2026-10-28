-- Security hardening: audit log + "must change password" flag. Safe to run more than once. Run on database SAPB1PortalAdmin.
-- The portal keeps working without this script (the new features simply stay off until it is run).
IF COL_LENGTH('dbo.Users', 'MustChangePassword') IS NULL
    ALTER TABLE dbo.Users ADD MustChangePassword BIT NOT NULL CONSTRAINT DF_Users_MustChangePassword DEFAULT 0;
GO
IF OBJECT_ID('dbo.AuditLog', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuditLog (
        Id        BIGINT IDENTITY(1,1) CONSTRAINT PK_AuditLog PRIMARY KEY,
        At        DATETIME2 NOT NULL CONSTRAINT DF_AuditLog_At DEFAULT SYSUTCDATETIME(),
        Company   NVARCHAR(50)  NULL,
        Username  NVARCHAR(100) NULL,   -- who did it (or who tried to log in)
        Action    NVARCHAR(60)  NOT NULL,
        Target    NVARCHAR(200) NULL,   -- who/what it was done to
        Detail    NVARCHAR(1000) NULL,
        Success   BIT NOT NULL CONSTRAINT DF_AuditLog_Success DEFAULT 1,
        Ip        NVARCHAR(64)  NULL
    );
    CREATE INDEX IX_AuditLog_At ON dbo.AuditLog (At DESC);
    CREATE INDEX IX_AuditLog_Username ON dbo.AuditLog (Username, At DESC);
END
GO
