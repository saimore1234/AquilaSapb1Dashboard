-- Permissions for the new Server / Company Configuration admin module.
-- Flat Module.Action keys, matching the existing RBAC convention (see
-- 002_SeedRbacData.sql) — NOT nested like "Administration.ServerConfig.View".
-- Idempotent: safe to re-run.

SET NOCOUNT ON;

MERGE dbo.Permissions AS target
USING (VALUES
    ('ServerConfiguration', 'View',           'ServerConfiguration.View',           'View SAP B1 server/company configuration'),
    ('ServerConfiguration', 'Create',         'ServerConfiguration.Create',         'Add a new SAP B1 server/company configuration'),
    ('ServerConfiguration', 'Edit',           'ServerConfiguration.Edit',           'Edit/enable/disable a SAP B1 server/company configuration'),
    ('ServerConfiguration', 'Delete',         'ServerConfiguration.Delete',         'Delete a SAP B1 server/company configuration'),
    ('ServerConfiguration', 'TestConnection', 'ServerConfiguration.TestConnection', 'Test SQL/SAP Service Layer connections for a server/company configuration')
) AS src (Module, Action, PermissionKey, Description)
ON target.PermissionKey = src.PermissionKey
WHEN NOT MATCHED THEN
    INSERT (Module, Action, PermissionKey, Description)
    VALUES (src.Module, src.Action, src.PermissionKey, src.Description);

-- Administrator gets every ServerConfiguration permission, same as every
-- other module (see 002_SeedRbacData.sql "Administrator: every permission").
INSERT INTO dbo.RolePermissions (RoleId, PermissionId)
SELECT r.Id, p.Id
FROM dbo.Roles r
CROSS JOIN dbo.Permissions p
WHERE r.Name = 'Administrator'
  AND p.Module = 'ServerConfiguration'
  AND NOT EXISTS (SELECT 1 FROM dbo.RolePermissions rp WHERE rp.RoleId = r.Id AND rp.PermissionId = p.Id);

-- Deliberately no default grant to Manager/Manager2..11: this module holds
-- SAP/SQL credentials for every company and is more sensitive than plain
-- Administration.View. Grant explicitly per role via Administration > Roles
-- if a non-Administrator role should ever manage it.

PRINT 'ServerConfiguration permission seed complete.';
