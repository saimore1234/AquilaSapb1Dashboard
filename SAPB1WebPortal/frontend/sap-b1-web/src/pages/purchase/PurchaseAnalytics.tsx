import { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { ShoppingBag, PackageCheck, FileText, Wallet } from 'lucide-react';
import { getPurchaseAnalytics } from '../../api/purchase';
import type { PurchaseAnalytics as PurchaseAnalyticsType } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { ErrorState } from '../../components/StateViews';
import { CardGridSkeleton, Skeleton } from '../../components/ui/Skeleton';
import StatCard from '../../components/StatCard';
import ChartCard from '../../components/ui/ChartCard';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function formatMonth(period: string) {
  const [year, month] = period.split('-');
  if (!year || !month) return period;
  return new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit' }).format(new Date(Number(year), Number(month) - 1, 1));
}

export default function PurchaseAnalytics() {
  const { theme } = useTheme();
  const [data, setData] = useState<PurchaseAnalyticsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getPurchaseAnalytics()
      .then(setData)
      .catch((err) => setError(err?.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const axisColor = theme === 'dark' ? '#a5b0c2' : '#4b5563';
  const gridColor = theme === 'dark' ? '#27303e' : '#e4e7ec';
  const barColor = theme === 'dark' ? '#6485c2' : '#3d60a5';
  const areaColor = theme === 'dark' ? '#6485c2' : '#3d60a5';
  const tooltipStyle = { background: theme === 'dark' ? '#111723' : '#ffffff', border: `1px solid ${gridColor}`, borderRadius: 10, fontSize: 13 };

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-ink-primary">Purchase Analytics</h1>
        <div className="card">
          <ErrorState message={error} onRetry={load} />
        </div>
      </div>
    );
  }

  const monthData = data?.purchaseByMonth.map((p) => ({ ...p, label: formatMonth(p.period) })) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-ink-primary">Purchase Analytics</h1>
        <p className="text-ink-secondary text-sm mt-0.5">A/P invoice value trends, top vendors and items</p>
      </div>

      {loading ? (
        <CardGridSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Open PO Value" value={formatCurrency(data!.openPurchaseOrderValue)} icon={ShoppingBag} accent="blue" />
          <StatCard label="Open GRPO Value" value={formatCurrency(data!.openGrpoValue)} icon={PackageCheck} accent="green" />
          <StatCard label="Open A/P Invoice Value" value={formatCurrency(data!.openApInvoiceValue)} icon={FileText} accent="amber" />
          <StatCard label="Outstanding Payables" value={formatCurrency(data!.outstandingPayables)} icon={Wallet} accent="red" />
        </div>
      )}

      <ChartCard title="Purchase by Month" subtitle="A/P invoice value, last 12 months">
        {loading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : monthData.length === 0 ? (
          <p className="text-sm text-ink-tertiary py-16 text-center">No A/P invoice history in this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisColor }} />
              <YAxis tick={{ fontSize: 11, fill: axisColor }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
              <Area type="monotone" dataKey="value" stroke={areaColor} fill={areaColor} fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Top Vendors" subtitle="By A/P invoice value">
          {loading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : !data || data.topVendors.length === 0 ? (
            <p className="text-sm text-ink-tertiary py-16 text-center">No vendor purchase history yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(260, data.topVendors.length * 34)}>
              <BarChart data={data.topVendors} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                <XAxis type="number" tick={{ fontSize: 11, fill: axisColor }} />
                <YAxis
                  type="category"
                  dataKey={(d: { vendorName: string | null; vendorCode: string }) => d.vendorName || d.vendorCode}
                  width={110}
                  tick={{ fontSize: 11, fill: axisColor }}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="value" fill={barColor} radius={[0, 6, 6, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Top Purchased Items" subtitle="By purchased value">
          {loading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : !data || data.topItems.length === 0 ? (
            <p className="text-sm text-ink-tertiary py-16 text-center">No item purchase history yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(260, data.topItems.length * 34)}>
              <BarChart data={data.topItems} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                <XAxis type="number" tick={{ fontSize: 11, fill: axisColor }} />
                <YAxis
                  type="category"
                  dataKey={(d: { itemName: string | null; itemCode: string }) => d.itemName || d.itemCode}
                  width={110}
                  tick={{ fontSize: 11, fill: axisColor }}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="value" fill={barColor} radius={[0, 6, 6, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Purchase by Warehouse" subtitle="A/P invoice line value by receiving warehouse">
        {loading ? (
          <Skeleton className="h-[240px] w-full" />
        ) : !data || data.purchaseByWarehouse.length === 0 ? (
          <p className="text-sm text-ink-tertiary py-16 text-center">No warehouse-level purchase history yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.purchaseByWarehouse}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis
                dataKey={(d: { warehouseName: string | null; warehouseCode: string }) => d.warehouseName || d.warehouseCode}
                tick={{ fontSize: 11, fill: axisColor }}
              />
              <YAxis tick={{ fontSize: 11, fill: axisColor }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="value" fill={barColor} radius={[6, 6, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}
