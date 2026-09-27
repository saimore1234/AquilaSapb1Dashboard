import { useEffect, useState } from 'react';
import { Landmark, Wallet } from 'lucide-react';
import { getBankCash } from '../../api/finance';
import type { BankCashSummary } from '../../types';
import { ErrorState, EmptyState } from '../../components/StateViews';
import { CardGridSkeleton, TableSkeleton } from '../../components/ui/Skeleton';
import StatCard from '../../components/StatCard';
import ResponsiveTable, { type ColumnDef } from '../../components/ui/ResponsiveTable';
import type { BankCashAccount } from '../../types';

function formatCurrency(value: number, currency: string | null) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 2 }).format(value);
  } catch {
    return value.toLocaleString();
  }
}

const columns: ColumnDef<BankCashAccount>[] = [
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
  { key: 'kind', header: 'Type', render: (r) => <span className={r.kind === 'Cash' ? 'badge-success' : 'badge-neutral'}>{r.kind}</span> },
  { key: 'currency', header: 'Currency', render: (r) => r.currency || '—', className: 'hidden lg:table-cell text-ink-secondary' },
  { key: 'balance', header: 'Closing Balance', align: 'right', render: (r) => <span className="tabular-nums font-medium">{formatCurrency(r.closingBalance, r.currency)}</span> }
];

export default function BankCash() {
  const [data, setData] = useState<BankCashSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getBankCash()
      .then(setData)
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load financial data.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-ink-primary">Bank / Cash</h1>
        <p className="text-ink-secondary text-sm mt-0.5">Live balances from your chart of accounts' bank and cash accounts</p>
      </div>

      {error && (
        <div className="card">
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {!error && (loading ? (
        <CardGridSkeleton count={2} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard label="Cash Balance" value={formatCurrency(data!.cashBalance, null)} icon={Wallet} accent="green" />
          <StatCard label="Bank Balance" value={formatCurrency(data!.bankBalance, null)} icon={Landmark} accent="blue" />
        </div>
      ))}

      <div className="card p-0 overflow-hidden">
        {loading && <TableSkeleton cols={columns.length} />}
        {!loading && !error && data && data.accounts.length === 0 && (
          <EmptyState message="No bank or cash accounts found." description="This company's chart of accounts has no accounts recognizable as bank or cash." />
        )}
        {!loading && !error && data && data.accounts.length > 0 && (
          <ResponsiveTable
            columns={columns}
            rows={data.accounts}
            keyField={(r) => r.acctCode}
            renderMobileCard={(r) => (
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="min-w-0">
                  <p className="font-medium text-ink-primary truncate">{r.acctName}</p>
                  <p className="text-ink-tertiary text-xs">{r.acctCode}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium tabular-nums text-ink-primary">{formatCurrency(r.closingBalance, r.currency)}</p>
                  <span className={r.kind === 'Cash' ? 'badge-success' : 'badge-neutral'}>{r.kind}</span>
                </div>
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}
