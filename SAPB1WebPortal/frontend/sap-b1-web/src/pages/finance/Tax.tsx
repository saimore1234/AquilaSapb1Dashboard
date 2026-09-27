import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { getTax } from '../../api/finance';
import type { TaxSummary } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { ErrorState, EmptyState } from '../../components/StateViews';
import { DetailSkeleton } from '../../components/ui/Skeleton';
import StatCard from '../../components/StatCard';
import ChartCard from '../../components/ui/ChartCard';
import { ReceiptText, ArrowUpCircle, ArrowDownCircle, Scale } from 'lucide-react';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function formatMonth(period: string) {
  const [year, month] = period.split('-');
  if (!year || !month) return period;
  return new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit' }).format(new Date(Number(year), Number(month) - 1, 1));
}

export default function Tax() {
  const { theme } = useTheme();
  const [dateFrom, setDateFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<TaxSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getTax({ dateFrom, dateTo })
      .then(setData)
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load financial data.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const axisColor = theme === 'dark' ? '#a5b0c2' : '#4b5563';
  const gridColor = theme === 'dark' ? '#27303e' : '#e4e7ec';
  const outputColor = theme === 'dark' ? '#4ade80' : '#16a34a';
  const inputColor = theme === 'dark' ? '#f87171' : '#dc2626';
  const tooltipStyle = { background: theme === 'dark' ? '#111723' : '#ffffff', border: `1px solid ${gridColor}`, borderRadius: 10, fontSize: 13 };

  const monthData = data?.taxByMonth.map((p) => ({ ...p, label: formatMonth(p.period) })) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-ink-primary">Tax / GST</h1>
          <p className="text-ink-secondary text-sm mt-0.5">From real invoice tax fields — this company's tax code master (OVTG) is empty, so rates show only where configured</p>
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
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label="Output Tax (Sales)" value={formatCurrency(data.outputTax)} icon={ArrowUpCircle} accent="green" />
            <StatCard label="Input Tax (Purchases)" value={formatCurrency(data.inputTax)} icon={ArrowDownCircle} accent="blue" />
            <StatCard label="Net Tax" value={formatCurrency(data.netTax)} icon={Scale} accent={data.netTax >= 0 ? 'amber' : 'slate'} />
            <StatCard label="Taxable Sales" value={formatCurrency(data.taxableSales)} icon={ReceiptText} accent="slate" />
          </div>

          <ChartCard title="Tax by Month" subtitle="Output vs input tax, last 12 months">
            {monthData.length === 0 ? (
              <p className="text-sm text-ink-tertiary py-16 text-center">No tax history in this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={monthData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisColor }} />
                  <YAxis tick={{ fontSize: 11, fill: axisColor }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="outputTax" name="Output Tax" stroke={outputColor} fill={outputColor} fillOpacity={0.15} strokeWidth={2} />
                  <Area type="monotone" dataKey="inputTax" name="Input Tax" stroke={inputColor} fill={inputColor} fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TaxCodeTable title="Sales Tax by Code" rows={data.salesTaxByCode} />
            <TaxCodeTable title="Purchase Tax by Code" rows={data.purchaseTaxByCode} />
          </div>
        </>
      )}
    </div>
  );
}

function TaxCodeTable({ title, rows }: { title: string; rows: TaxSummary['salesTaxByCode'] }) {
  return (
    <div className="card p-0 overflow-hidden">
      <h2 className="font-semibold text-ink-primary px-5 pt-5 mb-3">{title}</h2>
      {rows.length === 0 ? (
        <div className="pb-5">
          <EmptyState message="No tax records found." description="No matching transactions in this period." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-secondary text-ink-secondary text-left">
              <tr>
                <th className="px-4 py-2.5 font-medium">Tax Code</th>
                <th className="px-4 py-2.5 font-medium hidden sm:table-cell">Rate</th>
                <th className="px-4 py-2.5 font-medium text-right">Taxable Amount</th>
                <th className="px-4 py-2.5 font-medium text-right">Tax Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.taxCode}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-ink-primary">{r.taxCodeName || r.taxCode}</p>
                    <p className="text-ink-tertiary text-xs">{r.taxCode}</p>
                  </td>
                  <td className="px-4 py-2.5 hidden sm:table-cell text-ink-secondary">{r.taxRate != null ? `${r.taxRate}%` : '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.taxableAmount.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{r.taxAmount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
