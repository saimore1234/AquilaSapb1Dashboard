import { useEffect, useState } from 'react';
import { Plus, KeyRound, Trash2, Pencil, Copy } from 'lucide-react';
import { ErrorState, EmptyState } from '../../components/StateViews';
import { TableSkeleton } from '../../components/ui/Skeleton';
import ResponsiveTable, { type ColumnDef } from '../../components/ui/ResponsiveTable';
import Modal from '../../components/ui/Modal';
import { usePermissions } from '../../permissions/usePermissions';
import { useToast } from '../../context/ToastContext';
import { getUsers, getRoles, createUser, updateUser, resetUserPassword, deleteUser, getSalespersonLinks, setUserSalespersons, copyUserAccess } from '../../api/admin';
import { useAuth } from '../../context/AuthContext';
import type { AdminUser, AdminRole, UserSalespersonLinks } from '../../types';

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

export default function AdminUsersPage() {
  const { canCreate, canEdit, canDelete } = usePermissions();
  const { canCopyAccess } = useAuth();
  const [copyTarget, setCopyTarget] = useState<AdminUser | null>(null);
  const toast = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [links, setLinks] = useState<UserSalespersonLinks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([getUsers(), getRoles(), getSalespersonLinks().catch(() => null)])
      .then(([u, r, l]) => {
        setUsers(u);
        setRoles(r);
        setLinks(l);
      })
      .catch((err) => setError(err?.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);


  const columns: ColumnDef<AdminUser>[] = [
    { key: 'username', header: 'Username', render: (u) => <span className="font-medium text-ink-primary">{u.username}</span> },
    { key: 'displayName', header: 'Display Name', render: (u) => u.displayName },
    { key: 'roleName', header: 'Role', render: (u) => u.roleName || '—' },
    {
      key: 'salesperson',
      header: 'SAP Salesperson',
      render: (u) => {
        const codes = links?.links[String(u.id)] ?? [];
        if (codes.length === 0) return u.roleName === 'Sales' ? <span className="badge-warning" title="This login sees no data until it is linked to a salesperson">Not linked</span> : '—';
        return <span className="text-ink-primary">{codes.map((c) => links?.salespersons.find((p) => p.code === c)?.name ?? String(c)).join(', ')}</span>;
      }
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (u) => <span className={u.isActive ? 'badge-success' : 'badge-neutral'}>{u.isActive ? 'Active' : 'Disabled'}</span>
    },
    { key: 'createdAt', header: 'Created', className: 'hidden md:table-cell text-ink-secondary', render: (u) => formatDate(u.createdAt) },
    { key: 'lastLoginAt', header: 'Last Login', className: 'hidden lg:table-cell text-ink-secondary', render: (u) => formatDate(u.lastLoginAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (u) => (
        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {canEdit && (
            <button className="btn-ghost p-1.5" title="Edit / Enable-Disable" onClick={() => setEditUser(u)}>
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {canEdit && (
            <button className="btn-ghost p-1.5" title="Reset Password" onClick={() => setResetUser(u)}>
              <KeyRound className="h-4 w-4" />
            </button>
          )}
          {canCopyAccess && canEdit && (
            <button className="btn-ghost p-1.5" title="Copy access from another user" onClick={() => setCopyTarget(u)}>
              <Copy className="h-4 w-4" />
            </button>
          )}
          {canDelete && (
            <button className="btn-ghost p-1.5 text-danger" title="Delete" onClick={() => setDeleteTarget(u)}>
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Users</h1>
          <p className="text-sm text-ink-secondary mt-0.5">Administration &gt; Users</p>
        </div>
        {canCreate && (
          <button className="btn-primary text-sm py-2 px-3.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add User
          </button>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        {loading && <TableSkeleton cols={columns.length} />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}
        {!loading && !error && users.length === 0 && <EmptyState message="No users found." />}
        {!loading && !error && users.length > 0 && (
          <ResponsiveTable
            columns={columns}
            rows={users}
            keyField={(u) => String(u.id)}
            renderMobileCard={(u) => (
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="min-w-0">
                  <p className="font-medium text-ink-primary">{u.username}</p>
                  <p className="text-ink-tertiary text-xs">{u.roleName || '—'}</p>
                </div>
                <span className={u.isActive ? 'badge-success' : 'badge-neutral'}>{u.isActive ? 'Active' : 'Disabled'}</span>
              </div>
            )}
          />
        )}
      </div>

      {addOpen && (
        <AddUserModal
          roles={roles}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            toast.show({ variant: 'success', title: 'User created' });
            load();
          }}
        />
      )}

      {editUser && (
        <EditUserModal
          user={editUser}
          roles={roles}
          links={links}
          onClose={() => setEditUser(null)}
          onSaved={() => {
            setEditUser(null);
            toast.show({ variant: 'success', title: 'User updated' });
            load();
          }}
        />
      )}

      {copyTarget && (
        <CopyAccessModal
          target={copyTarget}
          users={users}
          onClose={() => setCopyTarget(null)}
          onDone={(message) => {
            setCopyTarget(null);
            toast.show({ variant: 'success', title: 'Access copied', description: message });
            load();
          }}
        />
      )}

      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onDone={() => {
            setResetUser(null);
            toast.show({ variant: 'success', title: 'Password reset' });
          }}
        />
      )}

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} variant="sheet">
        {deleteTarget && (
          <div className="p-6">
            <h2 className="text-lg font-semibold text-ink-primary mb-2">Delete {deleteTarget.username}?</h2>
            <p className="text-sm text-ink-secondary mb-5">This cannot be undone.</p>
            <div className="flex gap-2.5">
              <button className="btn-secondary flex-1" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                className="btn-primary flex-1 !bg-danger hover:!bg-danger/90"
                onClick={async () => {
                  try {
                    await deleteUser(deleteTarget.id);
                    toast.show({ variant: 'success', title: 'User deleted' });
                    setDeleteTarget(null);
                    load();
                  } catch (err: any) {
                    toast.show({ variant: 'error', title: 'Failed to delete', description: err?.response?.data?.message || err.message });
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function AddUserModal({ roles, onClose, onCreated }: { roles: AdminRole[]; onClose: () => void; onCreated: () => void }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState(roles[0]?.id ?? 0);
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
            await createUser({ username, displayName: displayName || username, password, roleId });
            onCreated();
          } catch (err: any) {
            setError(err?.response?.data?.message || err.message);
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <h2 className="text-lg font-semibold text-ink-primary">Add User</h2>
        {error && <div className="bg-danger-bg text-danger text-sm rounded-lg px-3.5 py-2.5">{error}</div>}
        <div>
          <label className="block text-sm font-medium text-ink-secondary mb-1.5">Username</label>
          <input className="input-field" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-secondary mb-1.5">Display Name</label>
          <input className="input-field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={username} />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-secondary mb-1.5">Password</label>
          <input className="input-field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          <p className="text-xs text-ink-tertiary mt-1">At least 8 characters with a letter and a number. The user must change it at their next sign-in.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-secondary mb-1.5">Role</label>
          <select className="input-field appearance-none" value={roleId} onChange={(e) => setRoleId(Number(e.target.value))}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2.5 pt-1">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create User'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserModal({
  user,
  roles,
  links,
  onClose,
  onSaved
}: {
  user: AdminUser;
  roles: AdminRole[];
  links: UserSalespersonLinks | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [isActive, setIsActive] = useState(user.isActive);
  const [roleId, setRoleId] = useState(roles.find((r) => r.name === user.roleName)?.id ?? roles[0]?.id ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [slps, setSlps] = useState<number[]>(links?.links[String(user.id)] ?? []);
  const [slpSearch, setSlpSearch] = useState('');
  const shownSlps = (links?.salespersons ?? []).filter((p) => !slpSearch.trim() || p.name.toLowerCase().includes(slpSearch.trim().toLowerCase()));

  return (
    <Modal open onClose={onClose} variant="sheet">
      <form
        className="p-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setSubmitting(true);
          setError(null);
          try {
            await updateUser(user.id, { displayName, isActive, roleId });
            if (links) await setUserSalespersons(user.id, slps);
            onSaved();
          } catch (err: any) {
            setError(err?.response?.data?.message || err.message);
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <h2 className="text-lg font-semibold text-ink-primary">Edit {user.username}</h2>
        {error && <div className="bg-danger-bg text-danger text-sm rounded-lg px-3.5 py-2.5">{error}</div>}
        <div>
          <label className="block text-sm font-medium text-ink-secondary mb-1.5">Display Name</label>
          <input className="input-field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-secondary mb-1.5">Role</label>
          <select className="input-field appearance-none" value={roleId} onChange={(e) => setRoleId(Number(e.target.value))}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        {links && (
          <div>
            <label className="block text-sm font-medium text-ink-secondary mb-1.5">SAP salesperson(s) this login may see</label>
            <p className="text-xs text-ink-tertiary mb-1.5">
              A login with the <strong>Sales</strong> role (or any login linked here) only sees these salespersons' customers, orders, invoices and targets. Leave empty for a login that should see everything
              (not for the Sales role: an unlinked Sales login sees nothing).
            </p>
            <input className="input-field mb-1.5" placeholder="Search salespersons…" value={slpSearch} onChange={(e) => setSlpSearch(e.target.value)} />
            <div className="max-h-44 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {shownSlps.map((p) => (
                <label key={p.code} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-surface-tertiary">
                  <input type="checkbox" className="h-4 w-4" checked={slps.includes(p.code)} onChange={(e) => setSlps((cur) => (e.target.checked ? [...cur, p.code] : cur.filter((c) => c !== p.code)))} />
                  <span className="text-ink-primary">{p.name}</span><span className="text-xs text-ink-tertiary ml-auto">#{p.code}</span>
                </label>
              ))}
              {shownSlps.length === 0 && <p className="px-3 py-2 text-sm text-ink-tertiary">No match.</p>}
            </div>
            <p className="text-xs text-ink-tertiary mt-1">{slps.length} selected</p>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-ink-secondary cursor-pointer select-none">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-border-strong text-brand-600" />
          Active (unchecked disables this account — they will not be able to log in)
        </label>
        <div className="flex gap-2.5 pt-1">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: () => void }) {
  const [newPassword, setNewPassword] = useState('');
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
            await resetUserPassword(user.id, newPassword);
            onDone();
          } catch (err: any) {
            setError(err?.response?.data?.message || err.message);
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <h2 className="text-lg font-semibold text-ink-primary">Reset password for {user.username}</h2>
        {error && <div className="bg-danger-bg text-danger text-sm rounded-lg px-3.5 py-2.5">{error}</div>}
        <div>
          <label className="block text-sm font-medium text-ink-secondary mb-1.5">New Password</label>
          <input className="input-field" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
        </div>
        <div className="flex gap-2.5 pt-1">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={submitting}>
            {submitting ? 'Resetting…' : 'Reset Password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CopyAccessModal({ target, users, onClose, onDone }: { target: AdminUser; users: AdminUser[]; onClose: () => void; onDone: (message: string) => void }) {
  const [sourceId, setSourceId] = useState('');
  const [copyLinks, setCopyLinks] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const source = users.find((x) => x.id === Number(sourceId));

  return (
    <Modal open onClose={onClose} variant="sheet">
      <form
        className="p-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!source) return;
          setSubmitting(true);
          setError(null);
          try {
            await copyUserAccess(target.id, source.id, copyLinks);
            onDone(`${target.username.trim()} now has the same access as ${source.username.trim()}.`);
          } catch (err: any) {
            setError(err?.response?.data?.message || err.message);
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <h2 className="text-lg font-semibold text-ink-primary">Copy access to {target.username.trim()}</h2>
        {error && <div className="bg-danger-bg text-danger text-sm rounded-lg px-3.5 py-2.5">{error}</div>}
        <div>
          <label className="block text-sm font-medium text-ink-secondary mb-1.5">Copy from user</label>
          <select className="input-field" value={sourceId} onChange={(e) => setSourceId(e.target.value)} required>
            <option value="">Select a user…</option>
            {users.filter((x) => x.id !== target.id).map((x) => <option key={x.id} value={x.id}>{x.username.trim()} ({x.roleName ?? 'no role'})</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          <input type="checkbox" checked={copyLinks} onChange={(e) => setCopyLinks(e.target.checked)} />
          Also copy the linked SAP salespersons (what data they see)
        </label>
        <p className="text-xs text-ink-tertiary">{target.username.trim()} gets {source ? `${source.username.trim()}'s role (${source.roleName ?? 'none'})` : 'the selected user\'s role'}. The password is not copied and nothing else about the account changes.</p>
        <div className="flex gap-2.5 pt-1">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary flex-1" disabled={submitting || !source}>{submitting ? 'Copying…' : 'Copy access'}</button>
        </div>
      </form>
    </Modal>
  );
}
