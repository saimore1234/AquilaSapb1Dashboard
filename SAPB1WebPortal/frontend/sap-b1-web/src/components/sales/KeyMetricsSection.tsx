import { useEffect, useState } from 'react';
import { Users, ShoppingCart, FileText, Wallet } from 'lucide-react';
import { getOpenSalesOrderLines, getOutstandingLedger } from '../../api/sales';
import type { OpenOrderTotals, OutstandingLedger } from '../../types';
import { useSalesFilters } from './salesFilters';
import { formatCount, formatInr, formatLongDate, formatPeriod, formatQty } from './formatters';
import { salesReportLink } from '../../data/salesReports';
import { ErrorState } from '../StateViews';
import { CardGridSkeleton } from '../ui/Skeleton';
import StatCard from '../StatCard';
import { SectionHeading, useSalesOverview } from './salesShared';

/**
 * Key metrics. Each tile says what it measures:
 *  - Selected period  → follows From/To (Open Sales Orders: lines of orders dated in the period).
 *  - Current position → a live snapshot that ignores the period (customers, deliveries awaiting invoicing).
 *  - As of date       → a balance measured at the selected To Date (Total Outstanding).
 * `reportTo` set = dashboard use (heading links to the full report).
 */
export default function KeyMetricsSection({ reportTo }: { reportTo?: string }) {
  const { data, loading, error, reload } = useSalesOverview();
  const { applied } = useSalesFilters();
  // Period-aware tiles: open order LINES for the selected period, and the journal-based outstanding as of the To Date.
  const [openSo, setOpenSo] = useState<OpenOrderTotals | null>(null);
  const [openSoErr, setOpenSoErr] = useState(false);
  const [ledger, setLedger] = useState<OutstandingLedger | null>(null);
  const [ledgerErr, setLedgerErr] = useState(false);
  useEffect(() => {
    setOpenSo(null); setOpenSoErr(false); setLedger(null); setLedgerErr(false);
    let live = true;
    getOpenSalesOrderLines({ dateFrom: applied.from, dateTo: applied.to, page: 1, pageSize: 1 }).then((r) => { if (live) setOpenSo(r.totals); }).catch(() => { if (live) setOpenSoErr(true); });
    getOutstandingLedger({
      asOf: applied.to,
      unit: applied.unit ? Number(applied.unit) : undefined,
      customerGroup: applied.customerGroup ? Number(applied.customerGroup) : undefined,
      salesperson: applied.salesperson ? Number(applied.salesperson) : undefined,
      page: 1, pageSize: 1
    }).then((l) => { if (live) setLedger(l); }).catch(() => { if (live) setLedgerErr(true); });
    return () => { live = false; };
  }, [applied.from, applied.to, applied.unit, applied.customerGroup, applied.salesperson]);

  if (error) return <div className="panel p-4"><ErrorState message={error} onRetry={reload} /></div>;
  return (
    <section aria-labelledby="kpi-h" className="space-y-2">
      <SectionHeading id="kpi-h" title="Key Metrics" note="each tile states its basis" reportTo={reportTo} />
      {loading || !data ? (
        <CardGridSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-stretch">
          <StatCard
            variant="compact"
            label="Total Customers"
            value={formatCount(data.totalCustomers)}
            hint={`+${formatCount(data.newCustomersThisQuarter)} new this quarter`}
            icon={Users}
            basis="Current position"
            definition="Active customer accounts in SAP right now. Not affected by the selected period."
            to={salesReportLink('customers')}
          />
          <StatCard
            variant="compact"
            label="Open Sales Orders"
            value={openSoErr ? '–' : openSo ? `${formatCount(openSo.openLines)} lines` : '…'}
            hint={
              openSoErr
                ? 'Unable to load — open the report to retry'
                : openSo
                  ? `${formatCount(openSo.distinctOrders)} orders · ${formatQty(openSo.openQuantity)} open qty · ${formatInr(openSo.lineTotal)} line value`
                  : 'Loading…'
            }
            icon={ShoppingCart}
            basis={`Selected period · ${formatPeriod(applied.from, applied.to)}`}
            definition="Open order lines (line status Open, order not cancelled) for orders dated in the selected period. Value is the full line total; quantity is the undelivered balance."
            to={salesReportLink('open-sales-order-lines')}
          />
          <StatCard
            variant="compact"
            label="Pending Billing (open deliveries)"
            value={formatCount(data.pendingInvoices)}
            hint={`${formatInr(data.pendingInvoiceValue)} dispatched, yet to be invoiced`}
            icon={FileText}
            basis="Current position"
            definition="Open deliveries: goods dispatched that are not yet invoiced. This is pending billing, not pending payment. Not affected by the selected period."
            to={salesReportLink('pending-deliveries')}
          />
          <StatCard
            variant="compact"
            label="Total Outstanding"
            value={ledgerErr ? '–' : ledger ? (ledger.available ? formatInr(ledger.totalOutstanding) : 'Not available') : '…'}
            hint={
              ledgerErr
                ? 'Unable to load — open the report to retry'
                : ledger
                  ? (ledger.available ? (ledger.note ?? `Journal-based ageing · unpaid invoices today: ${formatInr(ledger.unpaidInvoicesToday)}`) : (ledger.note ?? 'Not available for this unit'))
                  : 'Loading…'
            }
            icon={Wallet}
            basis={`As of ${formatLongDate(applied.to)}`}
            definition="Customer balances from journal entries, netting credit memos and payments on account, measured as of the selected To Date (the client's ageing report)."
            to={salesReportLink('total-outstanding')}
          />
        </div>
      )}
    </section>
  );
}
