using System.Collections.Concurrent;
using SAPB1.Api.Interfaces;

namespace SAPB1.Api.Services;

/// <summary>
/// Pure in-memory, zero-I/O implementation of ICompanyConfigurationProvider.
/// See the interface's XML doc for the full design rationale (why this exists
/// as a separate Singleton rather than changing CompanyRegistry's lifetime).
/// </summary>
public class CompanyConfigurationProvider : ICompanyConfigurationProvider
{
    private readonly ConcurrentDictionary<string, CachedCompanyConfig> _entries = new(StringComparer.OrdinalIgnoreCase);

    public bool TryGet(string code, out CachedCompanyConfig entry)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            entry = null!;
            return false;
        }

        return _entries.TryGetValue(code, out entry!);
    }

    public IReadOnlyCollection<CachedCompanyConfig> GetAll() => _entries.Values.ToList();

    public void Set(string code, CachedCompanyConfig entry) => _entries[code] = entry;

    public void Remove(string code) => _entries.TryRemove(code, out _);
}
