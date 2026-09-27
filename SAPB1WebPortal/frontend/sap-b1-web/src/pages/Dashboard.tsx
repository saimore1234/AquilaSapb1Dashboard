import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Users, Truck, Package, Wallet, AlertTriangle, ArrowRight } from 'lucide-react';
import { getDashboardSummary } from '../api/dashboard';
import type { DashboardSummary } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import StatCard from '../components/StatCard';
import { ErrorState } from '../components/StateViews';
import { CardGridSkeleton, Skeleton } from '../components/ui/Skeleton';

export default function Dashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getDashboardSummary()
      .then(setData)
      .catch((err) => setError(err?.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  const today = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

  const header = (
    <div>
      <h1 className="text-xl sm:text-2xl font-semibold text-ink-primary">
        {greeting}, {user?.username}
      </h1>
      <p className="text-ink-secondary text-sm mt-0.5">
        {user?.companyName || user?.company} Company Overview · {today}
      </p>
    </div>
  );

  if (error) {
    return (
      <div className="space-y-6">
        {header}
        <div className="card">
          <ErrorState message={error} onRetry={load} />
        </div>
      </div>
    );
  }

  const openDocsChart = data
    ? [
        { name: 'Sales Orders', value: data.openSalesOrders },
        { name: 'Purchase Orders', value: data.openPurchaseOrders },
        { name: 'Deliveries', value: data.openDeliveries },
        { name: 'A/R Invoices', value: data.openArInvoices },
        { name: 'A/P Invoices', value: data.openApInvoices }
      ]
    : [];

  const axisColor = theme === 'dark' ? '#a5b0c2' : '#4b5563';
  const gridColor = theme === 'dark' ? '#27303e' : '#e4e7ec';
  const barColor = theme === 'dark' ? '#6485c2' : '#3d60a5';

  return (
    <div className="space-y-6">
      {header}

      {loading ? (
        <CardGridSkeleton count={5} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
          <StatCard label="Customers" value={data!.totalCustomers} icon={Users} accent="blue" />
          <StatCard label="Vendors" value={data!.totalVendors} icon={Truck} accent="slate" />
          <StatCard label="Items" value={data!.totalItems} icon={Package} accent="green" />
          <StatCard label="Stock Value" value={formatCurrency(data!.currentStockValue)} icon={Wallet} accent="amber" />
          <StatCard label="Low Stock" value={data!.lowStockItemsCount} icon={AlertTriangle} accent="red" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2">
          <h2 className="font-semibold text-ink-primary mb-1">Open Documents</h2>
          <p className="text-xs text-ink-tertiary mb-4">Count of currently open documents by type</p>
          {loading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={openDocsChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: axisColor }} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: axisColor }} />
                <Tooltip
                  contentStyle={{
                    background: theme === 'dark' ? '#111723' : '#ffffff',
                    border: `1px solid ${gridColor}`,
                    borderRadius: 10,
                    fontSize: 13
                  }}
                  labelStyle={{ color: axisColor }}
                  cursor={{ fill: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}
                />
                <Bar dataKey="value" fill={barColor} radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card flex flex-col">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-ink-primary">Low Stock Items</h2>
          </div>
          <p className="text-xs text-ink-tertiary mb-3">Items at or below their minimum stock level</p>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : data!.lowStockItems.length === 0 ? (
            <p className="text-sm text-ink-tertiary py-6 text-center flex-1">No items are below their minimum stock level.</p>
          ) : (
            <ul className="divide-y divide-border flex-1 -mx-1">
              {data!.lowStockItems.map((item) => (
                <li key={item.itemCode}>
                  <Link
                    to={`/items/${item.itemCode}`}
                    className="flex justify-between items-center gap-3 py-2.5 px-1 text-sm hover:bg-surface-tertiary rounded-lg transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-ink-primary truncate">{item.itemName}</p>
                      <p className="text-ink-tertiary text-xs">{item.itemCode}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-danger font-medium tabular-nums">{item.available} avail.</p>
                      <p className="text-ink-tertiary text-xs tabular-nums">{item.onHand} on hand</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Link
            to="/inventory"
            className="flex items-center justify-center gap-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline pt-3 mt-1 border-t border-border"
          >
            View all inventory
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}
