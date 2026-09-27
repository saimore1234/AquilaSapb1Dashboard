using Dapper;
using SAPB1.Api.DTOs.Admin;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Services;

/// <summary>
/// Dapper-based CRUD over the portal's own Users/Roles/Permissions tables
/// (SAPB1PortalAdmin), following the same query style as SqlSapB1Service —
/// parameterized SQL, explicit column lists, never string concatenation.
/// </summary>
public class SqlAdminService : IAdminService
{
    private readonly IPortalConnectionFactory _connectionFactory;

    public SqlAdminService(IPortalConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public async Task<PortalUserRecord?> GetUserByUsernameAsync(string username, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        const string sql = @"
            SELECT u.Id, u.Username, u.DisplayName, u.PasswordHash, u.IsActive, r.Name AS RoleName
            FROM Users u
            LEFT JOIN UserRoles ur ON ur.UserId = u.Id
            LEFT JOIN Roles r ON r.Id = ur.RoleId
            WHERE u.Username = @Username";

        return await db.QuerySingleOrDefaultAsync<PortalUserRecord>(
            new CommandDefinition(sql, new { Username = username }, cancellationToken: ct));
    }

    public async Task RecordLoginAsync(int userId, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        await db.ExecuteAsync(new CommandDefinition(
            "UPDATE Users SET LastLoginAt = SYSUTCDATETIME() WHERE Id = @Id", new { Id = userId }, cancellationToken: ct));
    }

    public async Task<List<UserListItemDto>> GetUsersAsync(CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        const string sql = @"
            SELECT u.Id, u.Username, u.DisplayName, r.Name AS RoleName, u.IsActive, u.CreatedAt, u.LastLoginAt
            FROM Users u
            LEFT JOIN UserRoles ur ON ur.UserId = u.Id
            LEFT JOIN Roles r ON r.Id = ur.RoleId
            ORDER BY u.Username";

        return (await db.QueryAsync<UserListItemDto>(new CommandDefinition(sql, cancellationToken: ct))).ToList();
    }

    public async Task<int> CreateUserAsync(CreateUserDto dto, string passwordHash, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        const string insertSql = @"
            INSERT INTO Users (Username, DisplayName, PasswordHash, IsActive, CreatedAt, UpdatedAt)
            OUTPUT INSERTED.Id
            VALUES (@Username, @DisplayName, @PasswordHash, 1, SYSUTCDATETIME(), SYSUTCDATETIME())";

        var id = await db.ExecuteScalarAsync<int>(new CommandDefinition(
            insertSql, new { dto.Username, dto.DisplayName, PasswordHash = passwordHash }, cancellationToken: ct));

        await db.ExecuteAsync(new CommandDefinition(
            "INSERT INTO UserRoles (UserId, RoleId) VALUES (@UserId, @RoleId)",
            new { UserId = id, dto.RoleId }, cancellationToken: ct));

        return id;
    }

    public async Task<bool> UpdateUserAsync(int id, UpdateUserDto dto, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var rows = await db.ExecuteAsync(new CommandDefinition(
            "UPDATE Users SET DisplayName = @DisplayName, IsActive = @IsActive, UpdatedAt = SYSUTCDATETIME() WHERE Id = @Id",
            new { Id = id, dto.DisplayName, dto.IsActive }, cancellationToken: ct));

        if (rows == 0) return false;

        await db.ExecuteAsync(new CommandDefinition("DELETE FROM UserRoles WHERE UserId = @Id", new { Id = id }, cancellationToken: ct));
        await db.ExecuteAsync(new CommandDefinition(
            "INSERT INTO UserRoles (UserId, RoleId) VALUES (@UserId, @RoleId)",
            new { UserId = id, dto.RoleId }, cancellationToken: ct));

        return true;
    }

    public async Task<bool> ResetPasswordAsync(int id, string passwordHash, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var rows = await db.ExecuteAsync(new CommandDefinition(
            "UPDATE Users SET PasswordHash = @PasswordHash, UpdatedAt = SYSUTCDATETIME() WHERE Id = @Id",
            new { Id = id, PasswordHash = passwordHash }, cancellationToken: ct));
        return rows > 0;
    }

    public async Task<bool> DeleteUserAsync(int id, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var rows = await db.ExecuteAsync(new CommandDefinition("DELETE FROM Users WHERE Id = @Id", new { Id = id }, cancellationToken: ct));
        return rows > 0;
    }

    public async Task<List<RoleListItemDto>> GetRolesAsync(CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        const string sql = @"
            SELECT r.Id, r.Name, r.Description, r.IsSystemRole,
                   (SELECT COUNT(*) FROM UserRoles ur WHERE ur.RoleId = r.Id) AS UserCount
            FROM Roles r
            ORDER BY r.Name";

        return (await db.QueryAsync<RoleListItemDto>(new CommandDefinition(sql, cancellationToken: ct))).ToList();
    }

    public async Task<int> CreateRoleAsync(CreateRoleDto dto, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        const string sql = @"
            INSERT INTO Roles (Name, Description, IsSystemRole)
            OUTPUT INSERTED.Id
            VALUES (@Name, @Description, 0)";

        return await db.ExecuteScalarAsync<int>(new CommandDefinition(sql, dto, cancellationToken: ct));
    }

    public async Task<bool> UpdateRoleAsync(int id, CreateRoleDto dto, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        // IsSystemRole = 0 guard: the seeded Administrator role can't be renamed/redescribed.
        var rows = await db.ExecuteAsync(new CommandDefinition(
            "UPDATE Roles SET Name = @Name, Description = @Description WHERE Id = @Id AND IsSystemRole = 0",
            new { Id = id, dto.Name, dto.Description }, cancellationToken: ct));
        return rows > 0;
    }

    public async Task<List<PermissionDto>> GetPermissionsAsync(CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        const string sql = "SELECT Id, Module, Action, PermissionKey, Description FROM Permissions ORDER BY Module, Action";
        return (await db.QueryAsync<PermissionDto>(new CommandDefinition(sql, cancellationToken: ct))).ToList();
    }

    public async Task<RolePermissionsDto?> GetRolePermissionsAsync(int roleId, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        var role = await db.QuerySingleOrDefaultAsync<(int Id, string Name)>(
            new CommandDefinition("SELECT Id, Name FROM Roles WHERE Id = @Id", new { Id = roleId }, cancellationToken: ct));
        if (role.Name is null) return null;

        var keys = await db.QueryAsync<string>(new CommandDefinition(@"
            SELECT p.PermissionKey
            FROM RolePermissions rp
            JOIN Permissions p ON p.Id = rp.PermissionId
            WHERE rp.RoleId = @RoleId", new { RoleId = roleId }, cancellationToken: ct));

        return new RolePermissionsDto { RoleId = role.Id, RoleName = role.Name, PermissionKeys = keys.ToList() };
    }

    public async Task<bool> UpdateRolePermissionsAsync(int roleId, List<string> permissionKeys, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        db.Open();
        using var tx = db.BeginTransaction();

        // Administrator (IsSystemRole = 1) always keeps every permission — never editable.
        var isSystemRole = await db.ExecuteScalarAsync<bool>(new CommandDefinition(
            "SELECT IsSystemRole FROM Roles WHERE Id = @Id", new { Id = roleId }, transaction: tx, cancellationToken: ct));
        if (isSystemRole)
        {
            tx.Rollback();
            return false;
        }

        await db.ExecuteAsync(new CommandDefinition(
            "DELETE FROM RolePermissions WHERE RoleId = @RoleId", new { RoleId = roleId }, transaction: tx, cancellationToken: ct));

        if (permissionKeys.Count > 0)
        {
            await db.ExecuteAsync(new CommandDefinition(@"
                INSERT INTO RolePermissions (RoleId, PermissionId)
                SELECT @RoleId, p.Id FROM Permissions p WHERE p.PermissionKey IN @Keys",
                new { RoleId = roleId, Keys = permissionKeys }, transaction: tx, cancellationToken: ct));
        }

        tx.Commit();
        return true;
    }

    public async Task<HashSet<string>> GetPermissionsForRoleNameAsync(string roleName, CancellationToken ct = default)
    {
        using var db = _connectionFactory.CreateConnection();
        const string sql = @"
            SELECT p.PermissionKey
            FROM Roles r
            JOIN RolePermissions rp ON rp.RoleId = r.Id
            JOIN Permissions p ON p.Id = rp.PermissionId
            WHERE r.Name = @RoleName";

        var keys = await db.QueryAsync<string>(new CommandDefinition(sql, new { RoleName = roleName }, cancellationToken: ct));
        return keys.ToHashSet(StringComparer.OrdinalIgnoreCase);
    }
}
