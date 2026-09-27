import { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import { ClipboardList, Factory, TrendingUp, IndianRupee } from 'lucide-react';
import { getProductionAnalytics } from '../../api/production';
import type { ProductionAnalytics as ProductionAnalyticsType } from '../../types';
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

const STATUS_COLORS: Record<string, string> = {
  Planned: '#d97706',
  Released: '#3d60a5',
  Closed: '#64748b',
  Cancelled: '#dc2626'
};

export default function ProductionAnalytics() {
  const { theme } = useTheme();
  const [data, setData] = useState<ProductionAnalyticsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getProductionAnalytics()
      .then(setData)
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load production data.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const axisColor = theme === 'dark' ? '#a5b0c2' : '#4b5563';
  const gridColor = theme === 'dark' ? '#27303e' : '#e4e7ec';
  const barColor = theme === 'dark' ? '#6485c2' : '#3d60a5';
  const plannedColor = theme === 'dark' ? '#a5b0c2' : '#94a3b8';
  const producedColor = theme === 'dark' ? '#4ade80' : '#16a34a';
  const tooltipStyle = { background: theme === 'dark' ? '#111723' : '#ffffff', border: `1px solid ${gridColor}`, borderRadius: 10, fontSize: 13 };

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl sm:text-2xl font-semibold text-ink-primary">Production Analytics</h1>
        <div className="card">
          <ErrorState message={error} onRetry={load} />
        </div>
      </div>
    );
  }

  const monthData = data?.productionByMonth.map((p) => ({ ...p, label: formatMonth(p.period) })) ?? [];
  const completionPct = data && data.openPlannedQuantity > 0 ? Math.round((data.openProducedQuantity / data.openPlannedQuantity) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-ink-primary">Production Analytics</h1>
        <p className="text-ink-secondary text-sm mt-0.5">Manufacturing trends, top items and material consumption</p>
      </div>

      {loading ? (
        <CardGridSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Open Planned Quantity" value={data!.openPlannedQuantity.toLocaleString()} icon={ClipboardList} accent="blue" />
          <StatCard label="Open Produced Quantity" value={data!.openProducedQuantity.toLocaleString()} icon={Factory} accent="green" />
          <StatCard label="Open Completion" value={`${completionPct}%`} icon={TrendingUp} accent="amber" />
          <StatCard label="Open Production Value" value={formatCurrency(data!.openProductionValue)} icon={IndianRupee} accent="slate" />
        </div>
      )}

      <ChartCard title="Production Orders by Month" subtitle="Order count, last 12 months">
        {loading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : monthData.length === 0 ? (
          <p className="text-sm text-ink-tertiary py-16 text-center">No production order history in this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisColor }} />
              <YAxis tick={{ fontSize: 11, fill: axisColor }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="orderCount" name="Orders" stroke={barColor} fill={barColor} fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Planned vs Produced Quantity" subtitle="Last 12 months">
        {loading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : monthData.length === 0 ? (
          <p className="text-sm text-ink-tertiary py-16 text-center">No quantity history in this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisColor }} />
              <YAxis tick={{ fontSize: 11, fill: axisColor }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="plannedQty" name="Planned" fill={plannedColor} radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="producedQty" name="Produced" fill={producedColor} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Production Status Distribution" subtitle="All production orders">
          {loading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : !data || data.productionByStatus.length === 0 ? (
            <p className="text-sm text-ink-tertiary py-16 text-center">No production orders yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={data.productionByStatus} dataKey="count" nameKey="status" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {data.productionByStatus.map((s) => (
                    <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? barColor} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Production by Warehouse" subtitle="Produced quantity">
          {loading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : !data || data.productionByWarehouse.length === 0 ? (
            <p className="text-sm text-ink-tertiary py-16 text-center">No warehouse-level production history yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.productionByWarehouse}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                <XAxis
                  dataKey={(d: { warehouseName: string | null; warehouseCode: string }) => d.warehouseName || d.warehouseCode}
                  tick={{ fontSize: 11, fill: axisColor }}
                />
                <YAxis tick={{ fontSize: 11, fill: axisColor }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="producedQty" name="Produced" fill={barColor} radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Top Produced Finished Goods" subtitle="By produced quantity">
          {loading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : !data || data.topProducedItems.length === 0 ? (
            <p className="text-sm text-ink-tertiary py-16 text-center">No finished-goods production history yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(260, data.topProducedItems.length * 34)}>
              <BarChart data={data.topProducedItems} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                <XAxis type="number" tick={{ fontSize: 11, fill: axisColor }} />
                <YAxis
                  type="category"
                  dataKey={(d: { itemName: string | null; itemCode: string }) => d.itemName || d.itemCode}
                  width={110}
                  tick={{ fontSize: 11, fill: axisColor }}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="quantity" fill={producedColor} radius={[0, 6, 6, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Top Consumed Raw Materials" subtitle="By issued quantity">
          {loading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : !data || data.topConsumedMaterials.length === 0 ? (
            <p className="text-sm text-ink-tertiary py-16 text-center">No material consumption history yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(260, data.topConsumedMaterials.length * 34)}>
              <BarChart data={data.topConsumedMaterials} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                <XAxis type="number" tick={{ fontSize: 11, fill: axisColor }} />
                <YAxis
                  type="category"
                  dataKey={(d: { itemName: string | null; itemCode: string }) => d.itemName || d.itemCode}
                  width={110}
                  tick={{ fontSize: 11, fill: axisColor }}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="quantity" fill={barColor} radius={[0, 6, 6, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
