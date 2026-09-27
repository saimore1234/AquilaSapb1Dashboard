import { useEffect, useMemo, useState } from 'react';
import { Plus, ShieldCheck, Check, X } from 'lucide-react';
import { ErrorState } from '../../components/StateViews';
import { LoadingState } from '../../components/StateViews';
import Modal from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getRoles, createRole, getPermissions, getRolePermissions, updateRolePermissions } from '../../api/admin';
import type { AdminRole, Permission } from '../../types';

const ACTIONS = ['View', 'Create', 'Edit', 'Delete', 'Export', 'Approve'] as const;

export default function AdminRolesPage() {
  const { can } = useAuth();
  const toast = useToast();
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const canEdit = can('Administration.Edit');
  const canCreate = can('Administration.Create');

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([getRoles(), getPermissions()])
      .then(([r, p]) => {
        setRoles(r);
        setPermissions(p);
        if (!selectedRoleId && r.length > 0) setSelectedRoleId(r[0].id);
      })
      .catch((err) => setError(err?.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  useEffect(() => {
    if (!selectedRoleId) return;
    setMatrixLoading(true);
    getRolePermissions(selectedRoleId)
      .then((r) => setCheckedKeys(new Set(r.permissionKeys)))
      .catch((err) => toast.show({ variant: 'error', title: 'Failed to load permissions', description: err.message }))
      .finally(() => setMatrixLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoleId]);

  const modules = useMemo(() => Array.from(new Set(permissions.map((p) => p.module))), [permissions]);
  const selectedRole = roles.find((r) => r.id === selectedRoleId) || null;
  const matrixLocked = !canEdit || !!selectedRole?.isSystemRole;

  function keyFor(module: string, action: string) {
    return `${module}.${action}`;
  }

  function toggle(key: string) {
    if (matrixLocked) return;
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    if (!selectedRoleId) return;
    setSaving(true);
    try {
      await updateRolePermissions(selectedRoleId, Array.from(checkedKeys));
      toast.show({ variant: 'success', title: 'Permissions saved' });
      load();
    } catch (err: any) {
      toast.show({ variant: 'error', title: 'Failed to save', description: err?.response?.data?.message || err.message });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Roles</h1>
          <p className="text-sm text-ink-secondary mt-0.5">Administration &gt; Roles</p>
        </div>
        {canCreate && (
          <button className="btn-primary text-sm py-2 px-3.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Role
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        <div className="card p-2">
          {roles.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedRoleId(r.id)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                r.id === selectedRoleId ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 font-medium' : 'text-ink-secondary hover:bg-surface-tertiary'
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                {r.isSystemRole && <ShieldCheck className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{r.name}</span>
              </span>
              <span className="text-xs text-ink-tertiary shrink-0">{r.userCount}</span>
            </button>
          ))}
        </div>

        <div className="card">
          {!selectedRole ? (
            <p className="text-sm text-ink-secondary">Select a role.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <h2 className="font-semibold text-ink-primary">{selectedRole.name}</h2>
                  {selectedRole.description && <p className="text-sm text-ink-secondary">{selectedRole.description}</p>}
                </div>
                {selectedRole.isSystemRole && <span className="badge-info">Always full access</span>}
              </div>

              {!matrixLocked && (
                <div className="flex gap-2 mt-4 mb-2">
                  <button className="btn-secondary text-xs py-1.5 px-3" onClick={() => setCheckedKeys(new Set(permissions.map((p) => p.permissionKey)))}>
                    Select All
                  </button>
                  <button className="btn-secondary text-xs py-1.5 px-3" onClick={() => setCheckedKeys(new Set())}>
                    Clear All
                  </button>
                </div>
              )}

              {matrixLoading ? (
                <LoadingState />
              ) : (
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-ink-tertiary">
                        <th className="py-2 pr-4 font-medium">Module</th>
                        {ACTIONS.map((a) => (
                          <th key={a} className="py-2 px-2 font-medium text-center">
                            {a}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {modules.map((m) => (
                        <tr key={m}>
                          <td className="py-2 pr-4 font-medium text-ink-primary">{m}</td>
                          {ACTIONS.map((a) => {
                            const key = keyFor(m, a);
                            const exists = permissions.some((p) => p.permissionKey === key);
                            const checked = selectedRole.isSystemRole ? exists : checkedKeys.has(key);
                            return (
                              <td key={a} className="py-2 px-2 text-center">
                                {exists ? (
                                  <button
                                    type="button"
                                    disabled={matrixLocked}
                                    onClick={() => toggle(key)}
                                    className={`h-6 w-6 rounded-md border inline-flex items-center justify-center transition-colors ${
                                      checked ? 'bg-brand-600 border-brand-600 text-white' : 'border-border-strong text-transparent'
                                    } ${matrixLocked ? 'opacity-60' : 'cursor-pointer'}`}
                                  >
                                    {checked ? <Check className="h-3.5 w-3.5" /> : <X className="h-3 w-3 opacity-0" />}
                                  </button>
                                ) : (
                                  <span className="text-ink-tertiary">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!matrixLocked && (
                <div className="flex justify-end mt-5">
                  <button className="btn-primary" onClick={save} disabled={saving}>
                    {saving ? 'Saving…' : 'Save Permissions'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {addOpen && (
        <AddRoleModal
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            toast.show({ variant: 'success', title: 'Role created' });
            load();
          }}
        />
      )}
    </div>
  );
}

function AddRoleModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <Modal open onClose={onClose} variant="sheet">
      <form
        className="p-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setSubmitting(true);
          setError(null);
          try {
            await createRole({ name, description: description || undefined });
            onCreated();
          } catch (err: any) {
            setError(err?.response?.data?.message || err.message);
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <h2 className="text-lg font-semibold text-ink-primary">Add Role</h2>
        {error && <div className="bg-danger-bg text-danger text-sm rounded-lg px-3.5 py-2.5">{error}</div>}
        <div>
          <label className="block text-sm font-medium text-ink-secondary mb-1.5">Name</label>
          <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-secondary mb-1.5">Description</label>
          <input className="input-field" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex gap-2.5 pt-1">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Role'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
