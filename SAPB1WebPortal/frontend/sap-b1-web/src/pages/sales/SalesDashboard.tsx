import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Truck, FileText, Wallet, TrendingUp, Calendar, ArrowRight, FileSpreadsheet, Landmark } from 'lucide-react';
import { getSalesDashboard } from '../../api/sales';
import type { SalesDashboard as SalesDashboardType } from '../../types';
import { ErrorState } from '../../components/StateViews';
import { CardGridSkeleton } from '../../components/ui/Skeleton';
import StatCard from '../../components/StatCard';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export default function SalesDashboard() {
  const [data, setData] = useState<SalesDashboardType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getSalesDashboard()
      .then(setData)
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load sales data.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-ink-primary">Sales Dashboard</h1>
        <p className="text-ink-secondary text-sm mt-0.5">Live snapshot of your sales activity</p>
      </div>
      <Link to="/sales/analytics" className="btn-secondary">
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
          <StatCard label="Open Quotations" value={data!.openQuotations} hint={`${data!.totalQuotations} total`} icon={FileSpreadsheet} accent="slate" />
          <StatCard label="Open Sales Orders" value={data!.openSalesOrders} hint={`${data!.totalSalesOrders} total`} icon={ShoppingCart} accent="blue" />
          <StatCard label="Pending Deliveries" value={data!.pendingDeliveries} hint={`${data!.totalDeliveries} total`} icon={Truck} accent="green" />
          <StatCard label="Open A/R Invoices" value={data!.openArInvoices} hint={`${data!.overdueArInvoices} overdue`} icon={FileText} accent={data!.overdueArInvoices > 0 ? 'red' : 'slate'} />
        </div>
      )}

      {!loading && data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Sales This Month" value={formatCurrency(data.monthlySalesValue)} hint={`${data.salesOrdersThisMonth} orders`} icon={Calendar} accent="blue" />
          <StatCard label="Sales This Year" value={formatCurrency(data.yearlySalesValue)} hint={`${data.salesOrdersThisYear} orders`} icon={Calendar} accent="slate" />
          <StatCard label="Outstanding Receivables" value={formatCurrency(data.outstandingReceivables)} icon={Wallet} accent="amber" />
          <StatCard label="Incoming Payments (Month)" value={formatCurrency(data.incomingPaymentsThisMonth)} icon={Landmark} accent="green" />
        </div>
      )}

      {!loading && data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard label="Open Sales Order Value" value={formatCurrency(data.openSalesOrderValue)} icon={ShoppingCart} accent="blue" />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <QuickLink to="/sales/quotations" label="Sales Quotations" />
        <QuickLink to="/sales/orders" label="Sales Orders" />
        <QuickLink to="/sales/deliveries" label="Deliveries" />
        <QuickLink to="/sales/invoices" label="A/R Invoices" />
        <QuickLink to="/sales/credit-memos" label="A/R Credit Memos" />
        <QuickLink to="/sales/payments" label="Incoming Payments" />
        <QuickLink to="/sales/analytics" label="Sales Analytics" />
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
