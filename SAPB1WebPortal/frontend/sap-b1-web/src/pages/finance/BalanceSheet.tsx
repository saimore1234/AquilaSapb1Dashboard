import { useEffect, useState } from 'react';
import { getBalanceSheet } from '../../api/finance';
import type { BalanceSheet as BalanceSheetType, BalanceSheetAccount } from '../../types';
import { ErrorState } from '../../components/StateViews';
import { DetailSkeleton } from '../../components/ui/Skeleton';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export default function BalanceSheet() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<BalanceSheetType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getBalanceSheet(asOfDate)
      .then(setData)
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load financial data.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-ink-primary">Balance Sheet</h1>
          <p className="text-ink-secondary text-sm mt-0.5">As of a point in time, from your chart of accounts' real Asset/Liability/Equity hierarchy</p>
        </div>
        <div className="flex gap-2 flex-wrap items-end">
          <div>
            <label className="block text-xs font-medium text-ink-secondary mb-1">As of</label>
            <input type="date" className="input-field" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={load}>
            Apply
          </button>
        </div>
      </div>

      {loading && <DetailSkeleton />}
      {!loading && error && (
        <div className="card">
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className={`card flex items-center justify-between ${data.isBalanced ? '' : 'border-danger'}`}>
            <span className="font-medium text-ink-primary">Assets = Liabilities + Equity</span>
            <span className={data.isBalanced ? 'badge-success' : 'badge-danger'}>{data.isBalanced ? 'Balanced' : 'Not Balanced'}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h2 className="text-lg font-semibold text-ink-primary mb-4">Assets</h2>
              <Group title="Cash" accounts={data.cash} />
              <Group title="Bank" accounts={data.bank} />
              {data.accountsReceivable !== 0 && <LineItem label="Accounts Receivable" value={data.accountsReceivable} hint="Informational — from open A/R invoices" />}
              {data.inventory !== 0 && <LineItem label="Inventory" value={data.inventory} hint="Informational — from warehouse stock valuation" />}
              <Group title="Other Current Assets" accounts={data.otherCurrentAssets} />
              <Group title="Non-Current Assets" accounts={data.nonCurrentAssets} />
              <div className="flex items-center justify-between pt-3 mt-2 border-t-2 border-ink-primary">
                <span className="font-semibold text-ink-primary">Total Assets</span>
                <span className="font-semibold tabular-nums text-ink-primary">{formatCurrency(data.totalAssets)}</span>
              </div>
            </div>

            <div className="space-y-6">
              <div className="card">
                <h2 className="text-lg font-semibold text-ink-primary mb-4">Liabilities</h2>
                {data.accountsPayable !== 0 && <LineItem label="Accounts Payable" value={data.accountsPayable} hint="Informational — from open A/P invoices" />}
                {data.taxLiabilities !== 0 && <LineItem label="Tax Liabilities" value={data.taxLiabilities} />}
                <Group title="Other Current Liabilities" accounts={data.otherCurrentLiabilities} />
                <Group title="Non-Current Liabilities" accounts={data.nonCurrentLiabilities} />
                <div className="flex items-center justify-between pt-3 mt-2 border-t-2 border-ink-primary">
                  <span className="font-semibold text-ink-primary">Total Liabilities</span>
                  <span className="font-semibold tabular-nums text-ink-primary">{formatCurrency(data.totalLiabilities)}</span>
                </div>
              </div>

              <div className="card">
                <h2 className="text-lg font-semibold text-ink-primary mb-4">Equity</h2>
                <Group title="Capital" accounts={data.capital} />
                {data.retainedEarnings !== 0 && <LineItem label="Retained Earnings" value={data.retainedEarnings} />}
                <LineItem label="Current Year Result" value={data.currentYearResult} />
                <div className="flex items-center justify-between pt-3 mt-2 border-t-2 border-ink-primary">
                  <span className="font-semibold text-ink-primary">Total Equity</span>
                  <span className="font-semibold tabular-nums text-ink-primary">{formatCurrency(data.totalEquity)}</span>
                </div>
              </div>

              <div className="card bg-surface-secondary">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink-primary">Total Liabilities + Equity</span>
                  <span className="font-semibold tabular-nums text-ink-primary">{formatCurrency(data.totalLiabilitiesAndEquity)}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Group({ title, accounts }: { title: string; accounts: BalanceSheetAccount[] }) {
  if (accounts.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="text-xs font-medium text-ink-tertiary uppercase tracking-wide mb-1.5">{title}</p>
      <div className="divide-y divide-border">
        {accounts.map((a) => (
          <div key={a.acctCode} className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-ink-secondary truncate pr-2">{a.acctName}</span>
            <span className="tabular-nums text-ink-primary shrink-0">{formatCurrency(a.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineItem({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-secondary">{label}</span>
        <span className="tabular-nums text-ink-primary font-medium">{formatCurrency(value)}</span>
      </div>
      {hint && <p className="text-[11px] text-ink-tertiary mt-0.5">{hint}</p>}
    </div>
  );
}
