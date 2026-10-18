import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Truck, FileText, Wallet, TrendingUp, Calendar, ArrowRight, FileSpreadsheet, Landmark } from 'lucide-react';
import { getSalesDashboard } from '../../api/sales';
import type { SalesDashboard as SalesDashboardType } from '../../types';
import { ErrorState } from '../../components/StateViews';
import { CardGridSkeleton } from '../../components/ui/Skeleton';
import StatCard from '../../components/StatCard';
import SalesPerformanceSection from '../../components/sales/SalesPerformanceSection';
import { GlobalSalesFilterBar, SalesFilterProvider, useSalesFilters } from '../../components/sales/salesFilters';
import { RefreshBar, SalesRefreshProvider } from '../../components/sales/salesRefresh';
import { formatFy, formatInr, formatPeriod } from '../../components/sales/formatters';
import { SALES_REPORTS_PATH, salesReportLink } from '../../data/salesReports';

/**
 * Sales Dashboard — the default Sales landing page. Head of the page: Sales Turnover vs Target, the named units and the key
 * position metrics, driven by the shared filter bar. Below, the original document-activity counters are kept unchanged.
 */
export default function SalesDashboard() {
  return (
    <SalesRefreshProvider>
      <SalesFilterProvider>
        <Dashboard />
      </SalesFilterProvider>
    </SalesRefreshProvider>
  );
}

function Dashboard() {
  const { applied } = useSalesFilters();
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink-primary leading-tight">Sales Dashboard</h1>
          <p className="text-sm text-ink-secondary mt-0.5">
            {formatFy(applied.to)} · {formatPeriod(applied.from, applied.to)} · Live from SAP Business One
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <RefreshBar />
          <Link to="/sales/overview" className="btn-secondary btn-compact">Sales Overview</Link>
          <Link to={SALES_REPORTS_PATH} className="btn-secondary btn-compact">All Reports</Link>
          <Link to="/sales/analytics" className="btn-secondary btn-compact"><TrendingUp className="h-4 w-4" /> Analytics</Link>
        </div>
      </header>

      <GlobalSalesFilterBar />
      <SalesPerformanceSection />
      <DocumentActivity />
    </div>
  );
}

/** The original Sales Dashboard counters (document activity), unchanged in meaning; current position, not period-based. */
function DocumentActivity() {
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

  if (error) return <div className="panel p-4"><ErrorState message={error} onRetry={load} /></div>;

  return (
    <section aria-labelledby="doc-h" className="space-y-2">
      <h2 id="doc-h" className="text-sm font-semibold text-ink-primary">Document activity <span className="font-normal text-ink-tertiary text-xs">current position — not period-based</span></h2>
      {loading || !data ? (
        <CardGridSkeleton count={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <StatCard variant="compact" label="Open Quotations" value={data.openQuotations} hint={`${data.totalQuotations} total`} icon={FileSpreadsheet} basis="Current position" />
            <StatCard variant="compact" label="Open Sales Orders (documents)" value={data.openSalesOrders} hint={`${data.totalSalesOrders} total · ${formatInr(data.openSalesOrderValue)} document value`} icon={ShoppingCart} basis="Current position" definition="Whole open orders at document value including tax — a different measure from the line-level Open Sales Orders above." />
            <StatCard variant="compact" label="Pending Deliveries" value={data.pendingDeliveries} hint={`${data.totalDeliveries} total`} icon={Truck} basis="Current position" />
            <StatCard variant="compact" label="Open A/R Invoices" value={data.openArInvoices} hint={`${data.overdueArInvoices} overdue`} icon={FileText} basis="Current position" definition="Invoices not yet fully paid — payment status, not billing status." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <StatCard variant="compact" label="Sales This Month" value={formatInr(data.monthlySalesValue)} hint={`${data.salesOrdersThisMonth} orders`} icon={Calendar} basis="Calendar month to date" />
            <StatCard variant="compact" label="Sales This Year" value={formatInr(data.yearlySalesValue)} hint={`${data.salesOrdersThisYear} orders`} icon={Calendar} basis="Calendar year to date" />
            <StatCard variant="compact" label="Outstanding Customer Invoices" value={formatInr(data.outstandingReceivables)} icon={Wallet} basis="Unpaid invoices today" definition="Unpaid A/R invoices (DocTotal − PaidToDate). The journal-based Total Outstanding above is the client's ageing definition." to={salesReportLink('unpaid-invoices')} />
            <StatCard variant="compact" label="Incoming Payments (Month)" value={formatInr(data.incomingPaymentsThisMonth)} icon={Landmark} basis="Calendar month to date" />
          </div>
        </>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2">
        <QuickLink to="/sales/quotations" label="Quotations" />
        <QuickLink to="/sales/orders" label="Sales Orders" />
        <QuickLink to="/sales/deliveries" label="Deliveries" />
        <QuickLink to="/sales/invoices" label="A/R Invoices" />
        <QuickLink to="/sales/credit-memos" label="Credit Memos" />
        <QuickLink to="/sales/payments" label="Incoming Payments" />
        <QuickLink to="/sales/analytics" label="Analytics" />
      </div>
    </section>
  );
}

function QuickLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="panel flex items-center justify-between px-3 py-2 hover:border-brand-400 transition-colors">
      <span className="text-sm font-medium text-ink-primary">{label}</span>
      <ArrowRight className="h-4 w-4 text-ink-tertiary" />
    </Link>
  );
}
