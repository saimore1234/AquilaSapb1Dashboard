import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet, Landmark, TrendingUp, TrendingDown, Receipt, BookText, ArrowRight, IndianRupee, ArrowDownCircle, ArrowUpCircle
} from 'lucide-react';
import { getFinanceDashboard } from '../../api/finance';
import type { FinanceDashboard as FinanceDashboardType } from '../../types';
import { ErrorState } from '../../components/StateViews';
import { CardGridSkeleton } from '../../components/ui/Skeleton';
import StatCard from '../../components/StatCard';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export default function FinanceDashboard() {
  const [data, setData] = useState<FinanceDashboardType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getFinanceDashboard()
      .then(setData)
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load financial data.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-ink-primary">Finance Dashboard</h1>
        <p className="text-ink-secondary text-sm mt-0.5">Live snapshot of your accounting activity</p>
      </div>
      <Link to="/finance/analytics" className="btn-secondary">
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
          <StatCard label="Receivables" value={formatCurrency(data!.totalReceivables)} hint={`Outstanding A/R`} icon={Receipt} accent="blue" />
          <StatCard label="Payables" value={formatCurrency(data!.totalPayables)} hint={`Outstanding A/P`} icon={Receipt} accent="amber" />
          <StatCard label="Cash" value={formatCurrency(data!.cashBalance)} icon={Wallet} accent="green" />
          <StatCard label="Bank" value={formatCurrency(data!.bankBalance)} icon={Landmark} accent="slate" />
        </div>
      )}

      {!loading && data && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Sales This Month" value={formatCurrency(data.salesThisMonth)} icon={TrendingUp} accent="green" />
          <StatCard label="Purchases This Month" value={formatCurrency(data.purchasesThisMonth)} icon={TrendingDown} accent="blue" />
          <StatCard label="Net Profit This Month" value={formatCurrency(data.netProfitThisMonth)} icon={IndianRupee} accent={data.netProfitThisMonth >= 0 ? 'green' : 'red'} />
          <StatCard label="Tax Payable" value={formatCurrency(data.taxPayable)} icon={Receipt} accent="amber" />
        </div>
      )}

      {!loading && data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Journal Entries This Month" value={data.journalEntriesThisMonth} icon={BookText} accent="slate" />
          <StatCard label="Incoming Payments (Month)" value={formatCurrency(data.incomingPaymentsThisMonth)} icon={ArrowDownCircle} accent="green" />
          <StatCard label="Outgoing Payments (Month)" value={formatCurrency(data.outgoingPaymentsThisMonth)} icon={ArrowUpCircle} accent="blue" />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <QuickLink to="/finance/chart-of-accounts" label="Chart of Accounts" />
        <QuickLink to="/finance/ledger" label="General Ledger" />
        <QuickLink to="/finance/journal-entries" label="Journal Entries" />
        <QuickLink to="/finance/bp-ledger" label="BP Ledger" />
        <QuickLink to="/finance/receivables" label="Receivables" />
        <QuickLink to="/finance/payables" label="Payables" />
        <QuickLink to="/finance/incoming-payments" label="Incoming Payments" />
        <QuickLink to="/finance/outgoing-payments" label="Outgoing Payments" />
        <QuickLink to="/finance/bank-cash" label="Bank / Cash" />
        <QuickLink to="/finance/trial-balance" label="Trial Balance" />
        <QuickLink to="/finance/profit-loss" label="Profit & Loss" />
        <QuickLink to="/finance/balance-sheet" label="Balance Sheet" />
        <QuickLink to="/finance/tax" label="Tax / GST" />
        <QuickLink to="/finance/analytics" label="Financial Analytics" />
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
