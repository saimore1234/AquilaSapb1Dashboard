import { useAuth } from '../../context/AuthContext';
import { useShell } from './ShellContext';

export const APP_VERSION: string = __APP_VERSION__;

export default function StatusBar() {
  const { user } = useAuth();
  const { connected, lastRefresh } = useShell();
  const dot = connected === false ? 'bg-danger' : connected ? 'bg-success' : 'bg-ink-tertiary';
  const label = connected === false ? 'Disconnected' : connected ? 'Connected' : 'Checking…';

  return (
    <footer className="hidden md:flex h-7 shrink-0 items-center gap-4 px-3 bg-surface border-t border-border text-[11px] text-ink-secondary overflow-hidden whitespace-nowrap">
      <span>
        Company: <b className="font-medium text-ink-primary">{user?.companyName || user?.company}</b>
      </span>
      <span>
        User: <b className="font-medium text-ink-primary">{user?.username}</b>
      </span>
      <span className="flex items-center gap-1.5" role="status">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        Server: {label}
      </span>
      {connected === false && <span className="text-danger">SAP B1 data service is currently unavailable.</span>}
      <span className="flex-1" />
      <span>Database: SQL Server</span>
      <span>Last refresh: {lastRefresh ? lastRefresh.toLocaleTimeString() : '—'}</span>
      <span>v{APP_VERSION}</span>
    </footer>
  );
}
