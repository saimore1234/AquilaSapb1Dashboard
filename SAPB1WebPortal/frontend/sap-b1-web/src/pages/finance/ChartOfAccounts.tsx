import { useEffect, useState } from 'react';
import { List, GitBranch } from 'lucide-react';
import { getChartOfAccounts } from '../../api/finance';
import type { Account } from '../../types';
import SearchBar from '../../components/SearchBar';
import { ErrorState, EmptyState } from '../../components/StateViews';
import { TableSkeleton } from '../../components/ui/Skeleton';
import ResponsiveTable, { type ColumnDef } from '../../components/ui/ResponsiveTable';
import AccountTree from '../../components/finance/AccountTree';

function formatCurrency(value: number, currency: string | null) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0 }).format(value);
  } catch {
    return value.toLocaleString();
  }
}

function classificationBadge(classification: string) {
  const map: Record<string, string> = {
    Assets: 'badge-success',
    Liabilities: 'badge-danger',
    Equity: 'badge-neutral',
    Revenue: 'badge-success',
    Expenses: 'badge-warning'
  };
  return map[classification] || 'badge-neutral';
}

const columns: ColumnDef<Account>[] = [
  {
    key: 'account',
    header: 'Account',
    render: (r) => (
      <div className="min-w-0">
        <p className="font-medium text-ink-primary truncate">{r.acctName}</p>
        <p className="text-ink-tertiary text-xs">{r.acctCode}</p>
      </div>
    )
  },
  { key: 'classification', header: 'Type', render: (r) => <span className={classificationBadge(r.classification)}>{r.classification}</span> },
  { key: 'group', header: 'Group', render: (r) => r.groupName || '—', className: 'hidden lg:table-cell text-ink-secondary' },
  { key: 'level', header: 'Level', align: 'right', render: (r) => r.level, className: 'hidden md:table-cell' },
  { key: 'active', header: 'Active', render: (r) => <span className={r.active ? 'badge-success' : 'badge-neutral'}>{r.active ? 'Active' : 'Inactive'}</span>, className: 'hidden md:table-cell' },
  { key: 'currency', header: 'Currency', render: (r) => r.currency || '—', className: 'hidden lg:table-cell text-ink-secondary' },
  { key: 'balance', header: 'Balance', align: 'right', render: (r) => <span className="tabular-nums font-medium">{formatCurrency(r.balance, r.currency)}</span> }
];

export default function ChartOfAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'table' | 'tree'>('table');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getChartOfAccounts({ page: 1, pageSize: 2000 })
      .then((r) => setAccounts(r.items))
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load financial data.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const filtered = search
    ? accounts.filter((a) => a.acctCode.toLowerCase().includes(search.toLowerCase()) || a.acctName.toLowerCase().includes(search.toLowerCase()))
    : accounts;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Chart of Accounts</h1>
          {!loading && <p className="text-sm text-ink-secondary mt-0.5">{accounts.length.toLocaleString()} accounts</p>}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <SearchBar value={search} onChange={setSearch} placeholder="Account code or name…" />
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              className={`px-3 py-2 text-sm flex items-center gap-1.5 ${view === 'table' ? 'bg-brand-600 text-white' : 'bg-surface text-ink-secondary hover:bg-surface-tertiary'}`}
              onClick={() => setView('table')}
            >
              <List className="h-4 w-4" /> Table
            </button>
            <button
              className={`px-3 py-2 text-sm flex items-center gap-1.5 ${view === 'tree' ? 'bg-brand-600 text-white' : 'bg-surface text-ink-secondary hover:bg-surface-tertiary'}`}
              onClick={() => setView('tree')}
            >
              <GitBranch className="h-4 w-4" /> Tree
            </button>
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading && <TableSkeleton cols={columns.length} />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}
        {!loading && !error && filtered.length === 0 && <EmptyState message="No accounts found." description="Try a different search." />}

        {!loading && !error && filtered.length > 0 && view === 'table' && (
          <ResponsiveTable
            columns={columns}
            rows={filtered}
            keyField={(r) => r.acctCode}
            renderMobileCard={(r) => (
              <div className="px-4 py-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink-primary truncate">{r.acctName}</p>
                  <p className="text-ink-tertiary text-xs">{r.acctCode}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium tabular-nums text-ink-primary">{formatCurrency(r.balance, r.currency)}</p>
                  <span className={classificationBadge(r.classification)}>{r.classification}</span>
                </div>
              </div>
            )}
          />
        )}

        {!loading && !error && filtered.length > 0 && view === 'tree' && (
          <div className="p-3 overflow-x-auto">
            <AccountTree accounts={filtered} />
          </div>
        )}
      </div>
    </div>
  );
}
