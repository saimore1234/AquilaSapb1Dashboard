import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, PackageCheck, FileText, Wallet, TrendingUp, Calendar, ArrowRight } from 'lucide-react';
import { getPurchaseDashboard } from '../../api/purchase';
import type { PurchaseDashboard as PurchaseDashboardType } from '../../types';
import { ErrorState } from '../../components/StateViews';
import { CardGridSkeleton } from '../../components/ui/Skeleton';
import StatCard from '../../components/StatCard';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export default function PurchaseDashboard() {
  const [data, setData] = useState<PurchaseDashboardType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getPurchaseDashboard()
      .then(setData)
      .catch((err) => setError(err?.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-ink-primary">Purchase Dashboard</h1>
        <p className="text-ink-secondary text-sm mt-0.5">Live snapshot of your purchasing activity</p>
      </div>
      <Link to="/purchase/analytics" className="btn-secondary">
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
          <StatCard label="Open Purchase Orders" value={data!.openPurchaseOrders} hint={`${data!.totalPurchaseOrders} total`} icon={ShoppingBag} accent="blue" />
          <StatCard label="Open GRPO" value={data!.openGrpo} hint={`${data!.totalGrpo} total`} icon={PackageCheck} accent="green" />
          <StatCard label="Open A/P Invoices" value={data!.openApInvoices} hint={`${data!.overdueApInvoices} overdue`} icon={FileText} accent={data!.overdueApInvoices > 0 ? 'red' : 'slate'} />
          <StatCard label="Outstanding Payables" value={formatCurrency(data!.outstandingPayables)} icon={Wallet} accent="amber" />
        </div>
      )}

      {!loading && data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Purchases This Month" value={formatCurrency(data.monthlyPurchaseValue)} hint={`${data.purchaseOrdersThisMonth} orders`} icon={Calendar} accent="blue" />
          <StatCard label="Purchases This Year" value={formatCurrency(data.yearlyPurchaseValue)} hint={`${data.purchaseOrdersThisYear} orders`} icon={Calendar} accent="slate" />
          <StatCard label="Open PO Value" value={formatCurrency(data.openPurchaseOrderValue)} icon={ShoppingBag} accent="green" />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <QuickLink to="/purchase/requests" label="Purchase Requests" />
        <QuickLink to="/purchase/quotations" label="Purchase Quotations" />
        <QuickLink to="/purchase/orders" label="Purchase Orders" />
        <QuickLink to="/purchase/grpo" label="Goods Receipt PO" />
        <QuickLink to="/purchase/invoices" label="A/P Invoices" />
        <QuickLink to="/purchase/credit-memos" label="A/P Credit Memos" />
        <QuickLink to="/purchase/payments" label="Outgoing Payments" />
        <QuickLink to="/purchase/analytics" label="Purchase Analytics" />
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
