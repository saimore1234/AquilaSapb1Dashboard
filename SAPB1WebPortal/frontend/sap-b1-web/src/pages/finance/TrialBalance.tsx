import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { getTrialBalance } from '../../api/finance';
import type { TrialBalance as TrialBalanceType } from '../../types';
import { ErrorState, EmptyState } from '../../components/StateViews';
import { TableSkeleton } from '../../components/ui/Skeleton';

function formatMoney(value: number) {
  return value === 0 ? '—' : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TrialBalance() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState<TrialBalanceType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getTrialBalance({ dateFrom: dateFrom || undefined, dateTo: dateTo || undefined })
      .then(setData)
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load financial data.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Trial Balance</h1>
          {data && (
            <p className="text-sm text-ink-secondary mt-0.5">
              {data.rows.length} accounts · <span className={data.isBalanced ? 'text-success font-medium' : 'text-danger font-medium'}>{data.isBalanced ? 'Balanced' : 'Not balanced'}</span>
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap items-end">
          <div>
            <label className="block text-xs font-medium text-ink-secondary mb-1">Date from</label>
            <input type="date" className="input-field" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-secondary mb-1">Date to</label>
            <input type="date" className="input-field" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={load}>
            Apply
          </button>
          <button className="btn-secondary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading && <TableSkeleton cols={7} />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}
        {!loading && !error && data && data.rows.length === 0 && (
          <EmptyState message="No ledger transactions found." description="Try a wider date range." />
        )}
        {!loading && !error && data && data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-secondary text-ink-secondary text-left sticky top-0">
                <tr>
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium text-right">Opening Debit</th>
                  <th className="px-4 py-3 font-medium text-right">Opening Credit</th>
                  <th className="px-4 py-3 font-medium text-right">Period Debit</th>
                  <th className="px-4 py-3 font-medium text-right">Period Credit</th>
                  <th className="px-4 py-3 font-medium text-right">Closing Debit</th>
                  <th className="px-4 py-3 font-medium text-right">Closing Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.rows.map((r) => (
                  <tr key={r.acctCode}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-ink-primary">{r.acctName}</p>
                      <p className="text-ink-tertiary text-xs">{r.acctCode}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(r.openingDebit)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(r.openingCredit)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(r.periodDebit)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(r.periodCredit)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatMoney(r.closingDebit)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatMoney(r.closingCredit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-surface-secondary font-semibold text-ink-primary">
                <tr>
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(data.totalOpeningDebit)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(data.totalOpeningCredit)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(data.totalPeriodDebit)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(data.totalPeriodCredit)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(data.totalClosingDebit)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(data.totalClosingCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
