import { useEffect, useState } from 'react';
import { getProfitLoss } from '../../api/finance';
import type { ProfitLoss as ProfitLossType, ProfitLossAccount } from '../../types';
import { ErrorState } from '../../components/StateViews';
import { DetailSkeleton } from '../../components/ui/Skeleton';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export default function ProfitLoss() {
  const [dateFrom, setDateFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<ProfitLossType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getProfitLoss({ dateFrom, dateTo })
      .then(setData)
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load financial data.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-ink-primary">Profit &amp; Loss</h1>
          <p className="text-ink-secondary text-sm mt-0.5">Derived from your chart of accounts' real Direct/Indirect Income &amp; Expense grouping</p>
        </div>
        <div className="flex gap-2 flex-wrap items-end">
          <div>
            <label className="block text-xs font-medium text-ink-secondary mb-1">From</label>
            <input type="date" className="input-field" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-secondary mb-1">To</label>
            <input type="date" className="input-field" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
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
        <div className="card max-w-3xl">
          <Section title="Revenue" accounts={data.revenue} total={data.totalRevenue} emptyLabel="No revenue accounts had activity in this period." />
          <Section title="Cost of Goods Sold" accounts={data.costOfGoodsSold} total={data.totalCostOfGoodsSold} negative emptyLabel="No COGS accounts had activity in this period." />
          <TotalLine label="Gross Profit" value={data.grossProfit} strong hint={`${data.grossMarginPercent.toFixed(1)}% margin`} />

          <Section title="Operating Expenses" accounts={data.operatingExpenses} total={data.totalOperatingExpenses} negative emptyLabel="No operating expense accounts had activity in this period." />
          <TotalLine label="Operating Profit" value={data.operatingProfit} />

          <Section title="Other Income" accounts={data.otherIncome} total={data.totalOtherIncome} emptyLabel="No other-income accounts had activity in this period." />
          {data.totalOtherExpenses !== 0 && <TotalLine label="Other Expenses" value={-data.totalOtherExpenses} />}

          <div className="mt-6 pt-4 border-t-2 border-ink-primary flex items-center justify-between">
            <span className="text-lg font-semibold text-ink-primary">Net Profit</span>
            <div className="text-right">
              <span className={`text-lg font-semibold tabular-nums ${data.netProfit >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(data.netProfit)}</span>
              <p className="text-xs text-ink-tertiary">{data.netMarginPercent.toFixed(1)}% margin</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  accounts,
  total,
  negative,
  emptyLabel
}: {
  title: string;
  accounts: ProfitLossAccount[];
  total: number;
  negative?: boolean;
  emptyLabel: string;
}) {
  return (
    <div className="mb-5">
      <h2 className="font-semibold text-ink-primary mb-2">{title}</h2>
      {accounts.length === 0 ? (
        <p className="text-sm text-ink-tertiary py-2">{emptyLabel}</p>
      ) : (
        <div className="divide-y divide-border">
          {accounts.map((a) => (
            <div key={a.acctCode} className="flex items-center justify-between py-1.5 text-sm">
              <span className="text-ink-secondary">{a.acctName}</span>
              <span className="tabular-nums text-ink-primary">
                {negative ? '-' : ''}
                {formatCurrency(a.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between pt-2 mt-1 border-t border-border text-sm font-semibold text-ink-primary">
        <span>Total {title}</span>
        <span className="tabular-nums">
          {negative ? '-' : ''}
          {formatCurrency(total)}
        </span>
      </div>
    </div>
  );
}

function TotalLine({ label, value, strong, hint }: { label: string; value: number; strong?: boolean; hint?: string }) {
  return (
    <div className={`flex items-center justify-between py-2.5 ${strong ? 'border-y border-border my-3' : ''}`}>
      <span className={`text-ink-primary ${strong ? 'font-semibold' : 'font-medium'}`}>{label}</span>
      <div className="text-right">
        <span className={`tabular-nums ${strong ? 'font-semibold' : 'font-medium'} ${value >= 0 ? 'text-ink-primary' : 'text-danger'}`}>{formatCurrency(value)}</span>
        {hint && <p className="text-xs text-ink-tertiary">{hint}</p>}
      </div>
    </div>
  );
}
