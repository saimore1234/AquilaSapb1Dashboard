import { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';
import { ShoppingCart, Truck, FileText, Wallet } from 'lucide-react';
import { getSalesAnalytics } from '../../api/sales';
import type { SalesAnalytics as SalesAnalyticsType } from '../../types';
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

export default function SalesAnalytics() {
  const { theme } = useTheme();
  const [data, setData] = useState<SalesAnalyticsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getSalesAnalytics()
      .then(setData)
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load sales data.'))
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
        <h1 className="text-xl sm:text-2xl font-semibold text-ink-primary">Sales Analytics</h1>
        <div className="card">
          <ErrorState message={error} onRetry={load} />
        </div>
      </div>
    );
  }

  const monthData = data?.salesByMonth.map((p) => ({ ...p, label: formatMonth(p.period) })) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-ink-primary">Sales Analytics</h1>
        <p className="text-ink-secondary text-sm mt-0.5">A/R invoice value trends, top customers and items</p>
      </div>

      {loading ? (
        <CardGridSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Open Sales Order Value" value={formatCurrency(data!.openSalesOrderValue)} icon={ShoppingCart} accent="blue" />
          <StatCard label="Open Delivery Value" value={formatCurrency(data!.openDeliveryValue)} icon={Truck} accent="green" />
          <StatCard label="Open A/R Invoice Value" value={formatCurrency(data!.openArInvoiceValue)} icon={FileText} accent="amber" />
          <StatCard label="Outstanding Receivables" value={formatCurrency(data!.outstandingReceivables)} icon={Wallet} accent="red" />
        </div>
      )}

      <ChartCard title="Sales by Month" subtitle="A/R invoice value, last 12 months">
        {loading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : monthData.length === 0 ? (
          <p className="text-sm text-ink-tertiary py-16 text-center">No A/R invoice history in this period.</p>
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
        <ChartCard title="Top Customers" subtitle="By A/R invoice value">
          {loading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : !data || data.topCustomers.length === 0 ? (
            <p className="text-sm text-ink-tertiary py-16 text-center">No customer sales history yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(260, data.topCustomers.length * 34)}>
              <BarChart data={data.topCustomers} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                <XAxis type="number" tick={{ fontSize: 11, fill: axisColor }} />
                <YAxis
                  type="category"
                  dataKey={(d: { customerName: string | null; customerCode: string }) => d.customerName || d.customerCode}
                  width={110}
                  tick={{ fontSize: 11, fill: axisColor }}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="value" fill={barColor} radius={[0, 6, 6, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Top Selling Items" subtitle="By sold value">
          {loading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : !data || data.topItems.length === 0 ? (
            <p className="text-sm text-ink-tertiary py-16 text-center">No item sales history yet.</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Sales by Warehouse" subtitle="A/R invoice line value by shipping warehouse">
          {loading ? (
            <Skeleton className="h-[240px] w-full" />
          ) : !data || data.salesByWarehouse.length === 0 ? (
            <p className="text-sm text-ink-tertiary py-16 text-center">No warehouse-level sales history yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.salesByWarehouse}>
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

        <ChartCard title="Sales by Sales Employee" subtitle="By A/R invoice value">
          {loading ? (
            <Skeleton className="h-[240px] w-full" />
          ) : !data || data.salesBySalesEmployee.length === 0 ? (
            <p className="text-sm text-ink-tertiary py-16 text-center">No sales-employee history yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data.salesBySalesEmployee}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                <XAxis
                  dataKey={(d: { salesEmployeeName: string | null; salesEmployeeCode: number }) => d.salesEmployeeName || `#${d.salesEmployeeCode}`}
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
    </div>
  );
}
