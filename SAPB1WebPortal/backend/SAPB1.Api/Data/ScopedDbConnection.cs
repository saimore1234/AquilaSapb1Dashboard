using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;

namespace SAPB1.Api.Data;

/// <summary>
/// A connection handed out ONLY to restricted (salesperson) logins. It behaves exactly like the underlying SQL connection, except that every command's
/// text is passed through <see cref="SqlScopeRewriter"/> just before it runs. Read-only reporting use only (no transactions).
/// </summary>
internal sealed class ScopedDbConnection : DbConnection
{
    private readonly DbConnection _inner;
    private readonly int[] _codes;

    public ScopedDbConnection(DbConnection inner, int[] codes)
    {
        _inner = inner;
        _codes = codes;
    }

    internal DbConnection Inner => _inner;

    [AllowNull]
    public override string ConnectionString { get => _inner.ConnectionString; set => _inner.ConnectionString = value; }
    public override string Database => _inner.Database;
    public override string DataSource => _inner.DataSource;
    public override string ServerVersion => _inner.ServerVersion;
    public override ConnectionState State => _inner.State;
    public override void ChangeDatabase(string databaseName) => _inner.ChangeDatabase(databaseName);
    public override void Close() => _inner.Close();
    public override void Open() => _inner.Open();
    public override Task OpenAsync(CancellationToken cancellationToken) => _inner.OpenAsync(cancellationToken);
    protected override DbTransaction BeginDbTransaction(IsolationLevel isolationLevel) => _inner.BeginTransaction(isolationLevel);
    protected override DbCommand CreateDbCommand() => new ScopedDbCommand(_inner.CreateCommand(), this, _codes);

    protected override void Dispose(bool disposing)
    {
        if (disposing) _inner.Dispose();
        base.Dispose(disposing);
    }
}

internal sealed class ScopedDbCommand : DbCommand
{
    private readonly DbCommand _inner;
    private readonly int[] _codes;
    private DbConnection? _connection;
    private string _text = "";

    public ScopedDbCommand(DbCommand inner, ScopedDbConnection connection, int[] codes)
    {
        _inner = inner;
        _connection = connection;
        _codes = codes;
        _inner.Connection = connection.Inner;
    }

    [AllowNull]
    public override string CommandText { get => _text; set => _text = value ?? ""; }
    public override int CommandTimeout { get => _inner.CommandTimeout; set => _inner.CommandTimeout = value; }
    public override CommandType CommandType { get => _inner.CommandType; set => _inner.CommandType = value; }
    public override bool DesignTimeVisible { get => _inner.DesignTimeVisible; set => _inner.DesignTimeVisible = value; }
    public override UpdateRowSource UpdatedRowSource { get => _inner.UpdatedRowSource; set => _inner.UpdatedRowSource = value; }

    protected override DbConnection? DbConnection
    {
        get => _connection;
        set
        {
            _connection = value;
            _inner.Connection = value is ScopedDbConnection s ? s.Inner : value;
        }
    }
    protected override DbParameterCollection DbParameterCollection => _inner.Parameters;
    protected override DbTransaction? DbTransaction { get => _inner.Transaction; set => _inner.Transaction = value; }

    public override void Cancel() => _inner.Cancel();
    public override void Prepare() { Apply(); _inner.Prepare(); }
    protected override DbParameter CreateDbParameter() => _inner.CreateParameter();

    private void Apply() => _inner.CommandText = SqlScopeRewriter.Rewrite(_text, _codes);

    public override int ExecuteNonQuery() { Apply(); return _inner.ExecuteNonQuery(); }
    public override Task<int> ExecuteNonQueryAsync(CancellationToken cancellationToken) { Apply(); return _inner.ExecuteNonQueryAsync(cancellationToken); }
    public override object? ExecuteScalar() { Apply(); return _inner.ExecuteScalar(); }
    public override Task<object?> ExecuteScalarAsync(CancellationToken cancellationToken) { Apply(); return _inner.ExecuteScalarAsync(cancellationToken); }
    protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior) { Apply(); return _inner.ExecuteReader(behavior); }
    protected override Task<DbDataReader> ExecuteDbDataReaderAsync(CommandBehavior behavior, CancellationToken cancellationToken) { Apply(); return _inner.ExecuteReaderAsync(behavior, cancellationToken); }

    protected override void Dispose(bool disposing)
    {
        if (disposing) _inner.Dispose();
        base.Dispose(disposing);
    }
}
