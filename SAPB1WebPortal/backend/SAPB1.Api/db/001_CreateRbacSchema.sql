-- RBAC schema for the portal's own database (SAPB1PortalAdmin).
-- This database is separate from every SAP B1 company database; it holds
-- only portal Users/Roles/Permissions, never SAP B1 business data.
-- Run once with: sqlcmd -S <server> -d SAPB1PortalAdmin -E -C -i 001_CreateRbacSchema.sql

IF OBJECT_ID('dbo.RolePermissions', 'U') IS NULL
CREATE TABLE dbo.RolePermissions (
    RoleId INT NOT NULL,
    PermissionId INT NOT NULL,
    CONSTRAINT PK_RolePermissions PRIMARY KEY (RoleId, PermissionId)
);

IF OBJECT_ID('dbo.UserRoles', 'U') IS NULL
CREATE TABLE dbo.UserRoles (
    UserId INT NOT NULL,
    RoleId INT NOT NULL,
    CONSTRAINT PK_UserRoles PRIMARY KEY (UserId, RoleId)
);

IF OBJECT_ID('dbo.Users', 'U') IS NULL
CREATE TABLE dbo.Users (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Username NVARCHAR(100) NOT NULL UNIQUE,
    DisplayName NVARCHAR(200) NOT NULL,
    PasswordHash NVARCHAR(200) NOT NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    LastLoginAt DATETIME2 NULL
);

IF OBJECT_ID('dbo.Roles', 'U') IS NULL
CREATE TABLE dbo.Roles (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL UNIQUE,
    Description NVARCHAR(400) NULL,
    IsSystemRole BIT NOT NULL DEFAULT 0
);

IF OBJECT_ID('dbo.Permissions', 'U') IS NULL
CREATE TABLE dbo.Permissions (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Module NVARCHAR(50) NOT NULL,
    Action NVARCHAR(50) NOT NULL,
    PermissionKey NVARCHAR(120) NOT NULL UNIQUE,
    Description NVARCHAR(400) NULL
);

IF OBJECT_ID('dbo.FK_UserRoles_Users', 'F') IS NULL
ALTER TABLE dbo.UserRoles ADD CONSTRAINT FK_UserRoles_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(Id) ON DELETE CASCADE;

IF OBJECT_ID('dbo.FK_UserRoles_Roles', 'F') IS NULL
ALTER TABLE dbo.UserRoles ADD CONSTRAINT FK_UserRoles_Roles FOREIGN KEY (RoleId) REFERENCES dbo.Roles(Id) ON DELETE CASCADE;

IF OBJECT_ID('dbo.FK_RolePermissions_Roles', 'F') IS NULL
ALTER TABLE dbo.RolePermissions ADD CONSTRAINT FK_RolePermissions_Roles FOREIGN KEY (RoleId) REFERENCES dbo.Roles(Id) ON DELETE CASCADE;

IF OBJECT_ID('dbo.FK_RolePermissions_Permissions', 'F') IS NULL
ALTER TABLE dbo.RolePermissions ADD CONSTRAINT FK_RolePermissions_Permissions FOREIGN KEY (PermissionId) REFERENCES dbo.Permissions(Id) ON DELETE CASCADE;
