import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Factory, CheckCircle2, XCircle, TrendingUp, Calendar, ArrowRight, PackageMinus, IndianRupee } from 'lucide-react';
import { getProductionDashboard } from '../../api/production';
import type { ProductionDashboard as ProductionDashboardType } from '../../types';
import { ErrorState } from '../../components/StateViews';
import { CardGridSkeleton } from '../../components/ui/Skeleton';
import StatCard from '../../components/StatCard';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export default function ProductionDashboard() {
  const [data, setData] = useState<ProductionDashboardType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getProductionDashboard()
      .then(setData)
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load production data.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-ink-primary">Production Dashboard</h1>
        <p className="text-ink-secondary text-sm mt-0.5">Live snapshot of your manufacturing activity</p>
      </div>
      <Link to="/production/analytics" className="btn-secondary">
        <TrendingUp className="h-4 w-4" />
        View Analytics
      </Link>
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

  return (
    <div className="space-y-6">
      {header}

      {loading ? (
        <CardGridSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Open Production Orders" value={data!.openProductionOrders} hint={`${data!.totalProductionOrders} total`} icon={ClipboardList} accent="blue" />
          <StatCard label="Released" value={data!.releasedProductionOrders} hint={`${data!.inProgressProductionOrders} in progress`} icon={Factory} accent="amber" />
          <StatCard label="Completed" value={data!.completedProductionOrders} hint={`${data!.closedProductionOrders} closed`} icon={CheckCircle2} accent="green" />
          <StatCard label="Cancelled" value={data!.cancelledProductionOrders} icon={XCircle} accent={data!.cancelledProductionOrders > 0 ? 'red' : 'slate'} />
        </div>
      )}

      {!loading && data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Total Planned Quantity" value={data.totalPlannedQuantity.toLocaleString()} icon={ClipboardList} accent="slate" />
          <StatCard label="Total Produced Quantity" value={data.totalProducedQuantity.toLocaleString()} icon={Factory} accent="green" />
          <StatCard label="Pending Production Quantity" value={data.pendingProductionQuantity.toLocaleString()} icon={PackageMinus} accent="amber" />
          <StatCard label="Production Value (Month)" value={formatCurrency(data.productionValueThisMonth)} icon={IndianRupee} accent="blue" />
        </div>
      )}

      {!loading && data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Production Orders This Month" value={data.productionOrdersThisMonth} icon={Calendar} accent="blue" />
          <StatCard label="Production Orders This Year" value={data.productionOrdersThisYear} icon={Calendar} accent="slate" />
          <StatCard label="Material Consumption (Month)" value={data.materialConsumptionThisMonth.toLocaleString()} icon={PackageMinus} accent="amber" />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <QuickLink to="/production/boms" label="Bill of Materials" />
        <QuickLink to="/production/orders" label="Production Orders" />
        <QuickLink to="/production/material-requirements" label="Material Requirements" />
        <QuickLink to="/production/consumption" label="Component Consumption" />
        <QuickLink to="/production/receipts" label="Receipt from Production" />
        <QuickLink to="/production/analytics" label="Production Analytics" />
      </div>
    </div>
  );
}

function QuickLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="card flex items-center justify-between hover:shadow-elevated transition-shadow duration-200">
      <span className="text-sm font-medium text-ink-primary">{label}</span>
      <ArrowRight className="h-4 w-4 text-ink-tertiary" />
    </Link>
  );
}
