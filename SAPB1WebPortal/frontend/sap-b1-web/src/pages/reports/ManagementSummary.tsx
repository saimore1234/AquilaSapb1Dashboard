import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Wallet, Landmark, Package, IndianRupee, ShoppingCart, ShoppingBag, Factory } from 'lucide-react';
import { getManagementSummary } from '../../api/reports';
import type { ManagementSummary as ManagementSummaryType } from '../../types';
import { ErrorState } from '../../components/StateViews';
import { CardGridSkeleton } from '../../components/ui/Skeleton';
import StatCard from '../../components/StatCard';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export default function ManagementSummary() {
  const [data, setData] = useState<ManagementSummaryType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getManagementSummary()
      .then((d) => {
        setData(d);
        setLastUpdated(new Date());
      })
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load report.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <div className="space-y-6">
      <Link to="/reports/management" className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" />
        Back to Management reports
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-ink-primary">Management Dashboard</h1>
          <p className="text-ink-secondary text-sm mt-0.5">Cross-module executive KPIs, composed live from Sales, Purchase, Production and Finance</p>
          {lastUpdated && <p className="text-xs text-ink-tertiary mt-1">Last updated: {lastUpdated.toLocaleTimeString()}</p>}
        </div>
        <button className="btn-secondary" onClick={load}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="card">
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {!error && (loading || !data ? (
        <CardGridSkeleton count={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label="Sales This Month" value={formatCurrency(data.salesThisMonth)} icon={TrendingUp} accent="green" />
            <StatCard label="Purchases This Month" value={formatCurrency(data.purchasesThisMonth)} icon={TrendingDown} accent="blue" />
            <StatCard label="Net Profit This Month" value={formatCurrency(data.netProfitThisMonth)} icon={IndianRupee} accent={data.netProfitThisMonth >= 0 ? 'green' : 'red'} />
            <StatCard label="Working Capital (est.)" value={formatCurrency(data.workingCapitalEstimate)} icon={Wallet} accent="amber" />
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label="Receivables" value={formatCurrency(data.receivables)} icon={IndianRupee} accent="blue" />
            <StatCard label="Payables" value={formatCurrency(data.payables)} icon={IndianRupee} accent="amber" />
            <StatCard label="Cash Balance" value={formatCurrency(data.cashBalance)} icon={Wallet} accent="green" />
            <StatCard label="Bank Balance" value={formatCurrency(data.bankBalance)} icon={Landmark} accent="slate" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label="Inventory Value" value={formatCurrency(data.inventoryValue)} icon={Package} accent="slate" />
            <StatCard label="Open Sales Orders" value={data.openSalesOrders} icon={ShoppingCart} accent="blue" />
            <StatCard label="Open Purchase Orders" value={data.openPurchaseOrders} icon={ShoppingBag} accent="amber" />
            <StatCard label="Open Production Orders" value={data.openProductionOrders} icon={Factory} accent="green" />
          </div>
        </>
      ))}
    </div>
  );
}
