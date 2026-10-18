import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { getOrderExecution } from '../../api/sales';
import type { OrderExecutionReport } from '../../types';
import { EmptyState, ErrorState } from '../StateViews';
import { Skeleton } from '../ui/Skeleton';
import Pagination from '../Pagination';
import StatCard from '../StatCard';
import { SectionHeading } from './salesShared';
import { formatCount, formatLongDate } from './formatters';
import { useSalesFilters } from './salesFilters';
import { useSalesRefresh } from './salesRefresh';
import { downloadCsv } from './salesUtils';
import { usePermissions } from '../../permissions/usePermissions';

const PAGE = 25;
const qty = (v: number | null) => (v == null ? '–' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(v));

/**
 * Order Execution: for each sales order in the period, the days from the order date to each A/R invoice raised against it.
 * Invoices are linked through SAP's own document chain (order → invoice, or order → delivery → invoice), never by customer/item matching.
 * Orders with no invoice yet show as "Not invoiced". Unit, salesperson and customer group follow the shared filter bar.
 */
export default function OrderExecutionSection() {
  const { canExport } = usePermissions();
  const { applied } = useSalesFilters();
  const { tick, markUpdated } = useSalesRefresh();
  const seenTick = useRef(tick);
  const [search, setSearch] = useSearchParams();
  const status = search.get('status') || '';
  const customer = search.get('customer') || '';
  const page = Math.max(1, Number(search.get('page') ?? '1') || 1);
  const [data, setData] = useState<OrderExecutionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const set = (k: string, v: string) =>
    setSearch((cur) => { const n = new URLSearchParams(cur); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); return n; }, { replace: true });

  const query = useMemo(() => ({
    dateFrom: search.get('df') || applied.from,
    dateTo: search.get('dt') || applied.to,
    unit: applied.unit ? Number(applied.unit) : undefined,
    salesperson: applied.salesperson ? Number(applied.salesperson) : undefined,
    customer: customer || undefined,
    docType: status || undefined
  }), [applied, search, customer, status]);

  useEffect(() => {
    const silent = seenTick.current !== tick;
    seenTick.current = tick;
    if (!silent) { setLoading(true); setData(null); }
    setError(null);
    getOrderExecution({ ...query, page, pageSize: PAGE })
      .then((d) => { setData(d); markUpdated(); })
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load the order execution report.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, page, reload, tick]);

  async function exportCsv() {
    const all = await getOrderExecution({ ...query, page: 1, pageSize: 5000 });
    downloadCsv(
      `order-execution-${query.dateFrom}-to-${query.dateTo}.csv`,
      ['Order No', 'Order Date', 'Customer Code', 'Customer', 'Salesperson', 'Branch', 'Ordered Qty', 'Invoice No', 'Invoice Date', 'Invoiced Qty', 'Days to Invoice', 'Status'],
      all.rows.map((r) => [r.orderNo, r.orderDate.slice(0, 10), r.customerCode, r.customerName, r.salesperson, r.branch, r.orderedQuantity, r.invoiceNo, r.invoiceDate?.slice(0, 10), r.invoicedQuantity, r.daysToInvoice, r.status]),
      [['Report: Order Execution'], [`Orders dated ${query.dateFrom} to ${query.dateTo}`], []]
    );
  }

  const s = data?.summary;
  return (
    <section aria-labelledby="oe-h" className="space-y-3">
      <SectionHeading id="oe-h" title="Order Execution" />
      <p className="text-xs text-ink-tertiary -mt-1">
        Sales orders dated in the selected period and the days taken to invoice them (order date → invoice date). Invoices are linked through SAP's document chain
        (order → invoice, or order → delivery → invoice). An order billed in parts shows one row per invoice; summary figures use the first invoice per order.
      </p>

      <div className="panel px-3 py-2.5 flex flex-wrap items-end gap-3">
        <div>
          <label className="ctl-label" htmlFor="oe-st">Show</label>
          <select id="oe-st" className="ctl w-44" value={status} onChange={(e) => set('status', e.target.value)}>
            <option value="">All orders</option>
            <option value="invoiced">Invoiced only</option>
            <option value="pending">Not invoiced only</option>
          </select>
        </div>
        {customer && <button className="btn-secondary btn-compact" onClick={() => set('customer', '')}>Customer: {customer} ✕</button>}
        {canExport && (
          <button className="btn-secondary btn-compact ml-auto" onClick={exportCsv} disabled={!data || data.totalCount === 0}><Download className="h-4 w-4" /> CSV</button>
        )}
      </div>

      {error ? (
        <div className="panel p-4"><ErrorState message={error} onRetry={() => setReload((n) => n + 1)} /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-stretch">
            <StatCard variant="compact" label="Orders in period" value={s ? formatCount(s.orders) : '…'} hint={s ? `${formatCount(s.invoicedOrders)} invoiced` : undefined} basis="By order date" />
            <StatCard variant="compact" label="Awaiting invoice" value={s ? formatCount(s.awaitingInvoice) : '…'} hint="No invoice raised yet" basis="Current position" />
            <StatCard variant="compact" label="Average days to invoice" value={s?.averageDays != null ? `${s.averageDays}` : '–'} hint={s?.medianDays != null ? `Median ${s.medianDays} days` : undefined} basis="First invoice per order" />
            <StatCard variant="compact" label="Longest / shortest" value={s?.longestDays != null ? `${s.longestDays} / ${s.shortestDays} days` : '–'} basis="First invoice per order" />
          </div>

          {s && s.invoicedOrders > 0 && (
            <div className="panel px-3 py-2.5">
              <div className="text-xs font-medium text-ink-secondary mb-1.5">Invoiced orders by days to invoice</div>
              <div className="flex flex-wrap gap-2">
                {s.buckets.map((b) => (
                  <div key={b.label} className="border border-line rounded px-3 py-1.5 text-sm">
                    <div className="text-xs text-ink-tertiary">{b.label}</div>
                    <div className="font-semibold text-ink-primary tabular-nums">{formatCount(b.orders)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="panel p-0 overflow-hidden">
            <div className="sheet-wrap max-h-[36rem] border-0 rounded-none">
              <table className="sheet" aria-label="Order execution">
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col">Order date</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Salesperson</th>
                    <th scope="col" className="num">Ordered qty</th>
                    <th scope="col">Invoice</th>
                    <th scope="col">Invoice date</th>
                    <th scope="col" className="num">Invoiced qty</th>
                    <th scope="col" className="num">Days</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading || !data ? (
                    Array.from({ length: 6 }).map((_, i) => <tr key={i}><td colSpan={10}><Skeleton className="h-4 w-full" /></td></tr>)
                  ) : data.rows.length === 0 ? (
                    <tr><td colSpan={10}><EmptyState message="No sales orders for this selection." /></td></tr>
                  ) : data.rows.map((r, i) => (
                    <tr key={`${r.orderEntry}-${r.invoiceNo ?? 'n'}-${i}`}>
                      <td>{r.orderNo}</td>
                      <td className="whitespace-nowrap">{formatLongDate(r.orderDate.slice(0, 10))}</td>
                      <td className="whitespace-nowrap"><div className="text-ink-primary">{r.customerName ?? r.customerCode}</div><div className="text-xs text-ink-tertiary">{r.customerCode}</div></td>
                      <td>{r.salesperson ?? '–'}</td>
                      <td className="num">{qty(r.orderedQuantity)}</td>
                      <td>{r.invoiceNo ?? '–'}</td>
                      <td className="whitespace-nowrap">{r.invoiceDate ? formatLongDate(r.invoiceDate.slice(0, 10)) : '–'}</td>
                      <td className="num">{qty(r.invoicedQuantity)}</td>
                      <td className="num">{r.daysToInvoice ?? '–'}</td>
                      <td><span className={r.status === 'Not invoiced' ? 'badge-warning' : r.status === 'Partly invoiced' ? 'badge-neutral' : 'badge-success'}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data && data.totalCount > 0 && <Pagination page={page} totalPages={Math.max(1, Math.ceil(data.totalCount / PAGE))} onPageChange={(p) => set('page', p > 1 ? String(p) : '')} />}
          </div>
        </>
      )}
    </section>
  );
}
