import { useEffect, useState } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getFinanceAnalytics } from '../../api/finance';
import type { FinanceAnalytics as FinanceAnalyticsType, FinanceByPeriod } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { ErrorState } from '../../components/StateViews';
import { Skeleton } from '../../components/ui/Skeleton';
import ChartCard from '../../components/ui/ChartCard';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function formatMonth(period: string) {
  const [year, month] = period.split('-');
  if (!year || !month) return period;
  return new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit' }).format(new Date(Number(year), Number(month) - 1, 1));
}

export default function FinanceAnalytics() {
  const { theme } = useTheme();
  const [data, setData] = useState<FinanceAnalyticsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getFinanceAnalytics()
      .then(setData)
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load financial data.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const axisColor = theme === 'dark' ? '#a5b0c2' : '#4b5563';
  const gridColor = theme === 'dark' ? '#27303e' : '#e4e7ec';
  const barColor = theme === 'dark' ? '#6485c2' : '#3d60a5';
  const greenColor = theme === 'dark' ? '#4ade80' : '#16a34a';
  const redColor = theme === 'dark' ? '#f87171' : '#dc2626';
  const tooltipStyle = { background: theme === 'dark' ? '#111723' : '#ffffff', border: `1px solid ${gridColor}`, borderRadius: 10, fontSize: 13 };

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-ink-primary">Financial Analytics</h1>
        <div className="card">
          <ErrorState message={error} onRetry={load} />
        </div>
      </div>
    );
  }

  function TrendArea(title: string, subtitle: string, series: FinanceByPeriod[] | undefined, color: string) {
    const chartData = (series ?? []).map((p) => ({ ...p, label: formatMonth(p.period) }));
    return (
      <ChartCard title={title} subtitle={subtitle}>
        {loading ? (
          <Skeleton className="h-[220px] w-full" />
        ) : chartData.length === 0 ? (
          <p className="text-sm text-ink-tertiary py-14 text-center">No data in this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisColor }} />
              <YAxis tick={{ fontSize: 11, fill: axisColor }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
              <Area type="monotone" dataKey="value" stroke={color} fill={color} fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    );
  }

  function TopBar(title: string, subtitle: string, rows: { value: number }[] | undefined, dataKeyFn: (d: unknown) => string) {
    const chartData = rows ?? [];
    return (
      <ChartCard title={title} subtitle={subtitle}>
        {loading ? (
          <Skeleton className="h-[220px] w-full" />
        ) : chartData.length === 0 ? (
          <p className="text-sm text-ink-tertiary py-14 text-center">No data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 32)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
              <XAxis type="number" tick={{ fontSize: 11, fill: axisColor }} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <YAxis type="category" dataKey={dataKeyFn as any} width={120} tick={{ fontSize: 11, fill: axisColor }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="value" fill={barColor} radius={[0, 6, 6, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-ink-primary">Financial Analytics</h1>
        <p className="text-ink-secondary text-sm mt-0.5">Trends across revenue, expenses, receivables, payables, cash flow and tax</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {TrendArea('Revenue Trend', 'A/R invoice value, last 12 months', data?.revenueTrend, greenColor)}
        {TrendArea('Purchase Trend', 'A/P invoice value, last 12 months', data?.purchaseTrend, barColor)}
        {TrendArea('Gross Profit Trend', 'Revenue - COGS, last 12 months', data?.grossProfitTrend, greenColor)}
        {TrendArea('Net Profit Trend', 'Revenue - all expenses, last 12 months', data?.netProfitTrend, barColor)}
        {TrendArea('Receivables Trend', 'Open A/R balance by due month', data?.receivablesTrend, barColor)}
        {TrendArea('Payables Trend', 'Open A/P balance by due month', data?.payablesTrend, redColor)}
        {TrendArea('Cash Flow', 'Incoming minus outgoing payments, last 12 months', data?.cashFlow, greenColor)}
        {TrendArea('Expense Trend', 'COGS + operating expenses, last 12 months', data?.expenseTrend, redColor)}
        {TrendArea('Tax Trend', 'Output + input tax, last 12 months', data?.taxTrend, barColor)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {TopBar('Top Customers by Revenue', 'By A/R invoice value', data?.topCustomersByRevenue, (d) => {
          const p = d as { name: string | null; code: string };
          return p.name || p.code;
        })}
        {TopBar('Top Vendors by Purchase', 'By A/P invoice value', data?.topVendorsByPurchase, (d) => {
          const p = d as { name: string | null; code: string };
          return p.name || p.code;
        })}
      </div>

      {TopBar('Top Expense Accounts', 'By net monthly expense activity', data?.topExpenseAccounts, (d) => {
        const p = d as { acctName: string | null; acctCode: string };
        return p.acctName || p.acctCode;
      })}
    </div>
  );
}
