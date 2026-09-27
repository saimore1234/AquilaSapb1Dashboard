-- Seed data: 12 roles, 72 permissions (12 modules x 6 actions), 10 users
-- (Manager2..Manager11), role assignments, and a default read-only
-- permission baseline mirroring today's actual (pre-RBAC) access reality.
-- Idempotent: safe to re-run.

SET NOCOUNT ON;

-- Roles
MERGE dbo.Roles AS target
USING (VALUES
    ('Administrator', 'Full access to every module and to Administration itself.', 1),
    ('Manager', 'Baseline manager role — view access to business modules.', 0),
    ('Manager2', 'Configurable manager role.', 0),
    ('Manager3', 'Configurable manager role.', 0),
    ('Manager4', 'Configurable manager role.', 0),
    ('Manager5', 'Configurable manager role.', 0),
    ('Manager6', 'Configurable manager role.', 0),
    ('Manager7', 'Configurable manager role.', 0),
    ('Manager8', 'Configurable manager role.', 0),
    ('Manager9', 'Configurable manager role.', 0),
    ('Manager10', 'Configurable manager role.', 0),
    ('Manager11', 'Configurable manager role.', 0)
) AS src (Name, Description, IsSystemRole)
ON target.Name = src.Name
WHEN NOT MATCHED THEN INSERT (Name, Description, IsSystemRole) VALUES (src.Name, src.Description, src.IsSystemRole);

-- Permissions: every Module x Action pair
DECLARE @Modules TABLE (Module NVARCHAR(50));
INSERT INTO @Modules VALUES ('Dashboard'),('Customers'),('Suppliers'),('Items'),('Inventory'),('Warehouses'),
    ('Sales'),('Purchase'),('Production'),('Finance'),('Reports'),('Administration');

DECLARE @Actions TABLE (Action NVARCHAR(50));
INSERT INTO @Actions VALUES ('View'),('Create'),('Edit'),('Delete'),('Export'),('Approve');

MERGE dbo.Permissions AS target
USING (
    SELECT m.Module, a.Action, m.Module + '.' + a.Action AS PermissionKey
    FROM @Modules m CROSS JOIN @Actions a
) AS src
ON target.PermissionKey = src.PermissionKey
WHEN NOT MATCHED THEN INSERT (Module, Action, PermissionKey, Description)
    VALUES (src.Module, src.Action, src.PermissionKey, src.Action + ' access to ' + src.Module);

-- Administrator: every permission
INSERT INTO dbo.RolePermissions (RoleId, PermissionId)
SELECT r.Id, p.Id
FROM dbo.Roles r CROSS JOIN dbo.Permissions p
WHERE r.Name = 'Administrator'
  AND NOT EXISTS (SELECT 1 FROM dbo.RolePermissions rp WHERE rp.RoleId = r.Id AND rp.PermissionId = p.Id);

-- Manager + Manager2..Manager11: View on every business module (matches
-- today's actual pre-RBAC reality — every existing role, including the
-- unused "Manager" string, only ever had read access). No Administration
-- permissions by default; no write permissions by default — grant those
-- explicitly per role afterward via Administration > Roles.
INSERT INTO dbo.RolePermissions (RoleId, PermissionId)
SELECT r.Id, p.Id
FROM dbo.Roles r
CROSS JOIN dbo.Permissions p
WHERE r.Name IN ('Manager','Manager2','Manager3','Manager4','Manager5','Manager6','Manager7','Manager8','Manager9','Manager10','Manager11')
  AND p.Action = 'View'
  AND p.Module <> 'Administration'
  AND NOT EXISTS (SELECT 1 FROM dbo.RolePermissions rp WHERE rp.RoleId = r.Id AND rp.PermissionId = p.Id);

-- Users: Manager2..Manager11, sharing the portal admin's current password
-- hash (PBKDF2, same format/mechanism as Auth:PortalPasswordHash).
MERGE dbo.Users AS target
USING (VALUES
    ('Manager2','Manager 2'),('Manager3','Manager 3'),('Manager4','Manager 4'),('Manager5','Manager 5'),
    ('Manager6','Manager 6'),('Manager7','Manager 7'),('Manager8','Manager 8'),('Manager9','Manager 9'),
    ('Manager10','Manager 10'),('Manager11','Manager 11')
) AS src (Username, DisplayName)
ON target.Username = src.Username
WHEN NOT MATCHED THEN INSERT (Username, DisplayName, PasswordHash, IsActive, CreatedAt, UpdatedAt)
    VALUES (src.Username, src.DisplayName, '100000.Hn9+aX1MRBACgWvQWostWg==.dV+XkHjzIzdzg+k9pXtnOhScYXMTOoFSVh0yUa41nos=', 1, SYSUTCDATETIME(), SYSUTCDATETIME());

-- UserRoles: each Manager{N} user -> the role of the same name
INSERT INTO dbo.UserRoles (UserId, RoleId)
SELECT u.Id, r.Id
FROM dbo.Users u
JOIN dbo.Roles r ON r.Name = u.Username
WHERE NOT EXISTS (SELECT 1 FROM dbo.UserRoles ur WHERE ur.UserId = u.Id AND ur.RoleId = r.Id);

PRINT 'RBAC seed complete.';
