using System.Collections.Concurrent;

namespace SAPB1.Api.Auth;

/// <summary>
/// Locks a username after repeated wrong passwords so a password cannot be guessed by trying again and again.
/// Held in memory (no database change needed): a restart clears every lock, and the window is short either way. Keyed by username only — keying by
/// network address would be easy to dodge from behind a proxy. Settings: Security:MaxFailedLogins (default 5), Security:LockoutMinutes (default 15).
/// </summary>
public sealed class LoginAttemptTracker
{
    private sealed record Entry(int Failures, DateTime FirstFailureUtc, DateTime? LockedUntilUtc);

    private readonly ConcurrentDictionary<string, Entry> _entries = new();
    private readonly int _max;
    private readonly TimeSpan _lockout;

    public LoginAttemptTracker(IConfiguration config)
    {
        _max = Math.Max(1, config.GetValue("Security:MaxFailedLogins", 5));
        _lockout = TimeSpan.FromMinutes(Math.Max(1, config.GetValue("Security:LockoutMinutes", 15)));
    }

    private static string Key(string username) => (username ?? "").Trim().ToLowerInvariant();

    /// <summary>Minutes left on an active lock, or 0 when the username may try.</summary>
    public int MinutesLocked(string username)
    {
        if (!_entries.TryGetValue(Key(username), out var e) || e.LockedUntilUtc is not { } until) return 0;
        var left = until - DateTime.UtcNow;
        if (left <= TimeSpan.Zero) { _entries.TryRemove(Key(username), out _); return 0; }
        return (int)Math.Ceiling(left.TotalMinutes);
    }

    /// <summary>Records a wrong password; returns true when this attempt locked the username.</summary>
    public bool RecordFailure(string username)
    {
        var now = DateTime.UtcNow;
        var locked = false;
        _entries.AddOrUpdate(Key(username),
            _ => { locked = _max <= 1; return new Entry(1, now, locked ? now + _lockout : null); },
            (_, e) =>
            {
                // Failures older than the lockout window no longer count.
                var failures = now - e.FirstFailureUtc > _lockout ? 1 : e.Failures + 1;
                var first = failures == 1 ? now : e.FirstFailureUtc;
                locked = failures >= _max;
                return new Entry(failures, first, locked ? now + _lockout : null);
            });
        if (_entries.Count > 5000) Prune(now);
        return locked;
    }

    public void RecordSuccess(string username) => _entries.TryRemove(Key(username), out _);

    private void Prune(DateTime now)
    {
        foreach (var kv in _entries)
            if (now - kv.Value.FirstFailureUtc > _lockout && (kv.Value.LockedUntilUtc ?? DateTime.MinValue) < now) _entries.TryRemove(kv.Key, out _);
    }
}
