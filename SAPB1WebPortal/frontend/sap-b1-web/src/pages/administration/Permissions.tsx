import { useEffect, useState } from 'react';
import { ErrorState, LoadingState } from '../../components/StateViews';
import { getPermissions } from '../../api/admin';
import type { Permission } from '../../types';

export default function AdminPermissionsPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getPermissions()
      .then(setPermissions)
      .catch((err) => setError(err?.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const byModule = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Permissions</h1>
        <p className="text-sm text-ink-secondary mt-0.5">Administration &gt; Permissions — reference catalog. Assign these to roles under Administration &gt; Roles.</p>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-secondary text-ink-secondary text-left">
            <tr>
              <th className="px-4 py-2.5 font-medium">Module</th>
              <th className="px-4 py-2.5 font-medium">Action</th>
              <th className="px-4 py-2.5 font-medium">Permission Key</th>
              <th className="px-4 py-2.5 font-medium hidden md:table-cell">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {Object.entries(byModule).map(([module, perms]) =>
              perms.map((p, i) => (
                <tr key={p.id}>
                  {i === 0 && (
                    <td className="px-4 py-2.5 font-medium text-ink-primary align-top" rowSpan={perms.length}>
                      {module}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-ink-secondary">{p.action}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-primary">{p.permissionKey}</td>
                  <td className="px-4 py-2.5 hidden md:table-cell text-ink-tertiary">{p.description || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
