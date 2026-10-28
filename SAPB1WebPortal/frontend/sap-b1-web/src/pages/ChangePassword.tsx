import { FormEvent, useState } from 'react';
import { AlertCircle, KeyRound, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const input = 'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-brand-600';

/** Shown instead of the app while the account still has a temporary password. Same rules as the server: 8+ characters, a letter and a number. */
export default function ChangePassword() {
  const { user, changePassword, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError(null);
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) { setError('The new password needs at least 8 characters, with a letter and a number.'); return; }
    if (next !== confirm) { setError('The two new passwords do not match.'); return; }
    if (next === current) { setError('The new password must be different from the temporary one.'); return; }
    setSaving(true);
    try {
      await changePassword(current, next);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Could not change the password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4">
      <form onSubmit={submit} className="panel w-full max-w-sm p-6 space-y-4" aria-labelledby="cp-h">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-brand-600" />
          <h1 id="cp-h" className="text-lg font-semibold text-ink-primary">Set a new password</h1>
        </div>
        <p className="text-sm text-ink-secondary">
          {user?.username ? <>Hello <strong>{user.username}</strong>. </> : null}Your account is using a temporary password. Choose your own to continue.
        </p>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> <span>{error}</span>
          </div>
        )}
        <div>
          <label className="ctl-label" htmlFor="cp-cur">Temporary (current) password</label>
          <input id="cp-cur" type="password" autoComplete="current-password" className={input} value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div>
          <label className="ctl-label" htmlFor="cp-new">New password</label>
          <input id="cp-new" type="password" autoComplete="new-password" className={input} value={next} onChange={(e) => setNext(e.target.value)} required />
        </div>
        <div>
          <label className="ctl-label" htmlFor="cp-conf">Confirm new password</label>
          <input id="cp-conf" type="password" autoComplete="new-password" className={input} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        <button type="submit" className="btn-primary w-full justify-center" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save and continue'}
        </button>
        <button type="button" className="btn-secondary w-full justify-center" onClick={() => void logout()}>Sign out</button>
      </form>
    </div>
  );
}
