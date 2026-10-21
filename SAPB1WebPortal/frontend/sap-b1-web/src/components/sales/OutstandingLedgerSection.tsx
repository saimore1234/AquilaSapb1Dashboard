import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { getOutstandingLedger, getOutstandingLedgerLines } from '../../api/sales';
import type { OutstandingLedger, OutstandingLinesReport } from '../../types';
import { EmptyState, ErrorState } from '../StateViews';
import { Skeleton } from '../ui/Skeleton';
import Pagination from '../Pagination';
import { SectionHeading, formatDate } from './salesShared';
import { dmy, useSalesFilters } from './salesFilters';
import { useSalesRefresh } from './salesRefresh';
import { downloadCsv } from './salesUtils';
import { formatAmount } from './formatters';
import { usePermissions } from '../../permissions/usePermissions';

const rupees = { format: (v: number | null | undefined) => formatAmount(v, { zero: true }) };
const PAGE = 25;

/**
 * Total Outstanding exactly as the client's journal-based ageing report defines it, measured AS OF the selected To Date
 * (rebuilt from journal entries and reconciliation history, so a past date gives that date's balance).
 * Click a branch or a customer to drill into the journal lines behind the figure.
 */
export default function OutstandingLedgerSection() {
  const { canExport } = usePermissions();
  const { applied } = useSalesFilters();
  const asOf = applied.to;
  const { tick, markUpdated } = useSalesRefresh();
  const seenTick = useRef(tick);
  const [search, setSearch] = useSearchParams();
  const customer = search.get('customer') ?? '';
  const branch = search.get('branch') ?? '';
  const page = Math.max(1, Number(search.get('page') ?? '1') || 1);

  const [data, setData] = useState<OutstandingLedger | null>(null);
  const [lines, setLines] = useState<OutstandingLinesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [linePage, setLinePage] = useState(1);

  const setParam = (key: string, value: string) =>
    setSearch((cur) => {
      const next = new URLSearchParams(cur);
      if (value) next.set(key, value); else next.delete(key);
      if (key !== 'page') next.delete('page');
      return next;
    }, { replace: true });

  useEffect(() => {
    const silent = seenTick.current !== tick;
    seenTick.current = tick;
    if (!silent) { setLoading(true); setData(null); }
    setError(null);
    const q = { asOf, customer: customer || undefined, branch: branch ? Number(branch) : undefined };
    let live = true;
    getOutstandingLedger({ ...q, page, pageSize: PAGE })
      .then((d) => { if (!live) return; setData(d); markUpdated(); })
      .catch((err) => { if (live) setError(err?.response?.data?.message || err.message || 'Unable to load total outstanding.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOf, customer, branch, page, reload, tick]);

  // Journal lines for the current drill-down (a customer and/or a branch must be chosen).
  useEffect(() => {
    setLinePage(1);
  }, [asOf, customer, branch]);
  useEffect(() => {
    if (!customer && !branch) { setLines(null); return; }
    let live = true;
    getOutstandingLedgerLines({ asOf, customer: customer || undefined, branch: branch ? Number(branch) : undefined, page: linePage, pageSize: PAGE })
      .then((l) => { if (live) setLines(l); })
      .catch(() => { if (live) setLines(null); });
    return () => { live = false; };
  }, [asOf, customer, branch, linePage, reload]);

  async function exportCustomers() {
    const all = await getOutstandingLedger({ asOf, customer: customer || undefined, branch: branch ? Number(branch) : undefined, page: 1, pageSize: 5000 });
    downloadCsv(
      `total-outstanding-as-of-${asOf}.csv`,
      ['Customer Code', 'Customer', 'Sales Person', 'Overdue Days (oldest open item)', 'Balance', '0-30', '31-60', '61-90', '91-120', '121-150', '151-180', '181-210', '211+'],
      [...all.customers.map((c) => [c.customerCode, c.customerName, c.salesPerson, c.overdueDays, c.balance, c.days0To30, c.days31To60, c.days61To90, c.days91To120, c.days121To150, c.days151To180, c.days181To210, c.days211Plus]),
        ['TOTAL', `${all.customerCount} customers`, '', '', all.totalOutstanding, ...all.ageing.map((b) => b.amount)]],
      [['Report: Total Outstanding (journal-based ageing)'], [`As of: ${dmy(asOf)} (selected To Date)`], [`Filters: ${[customer && `customer=${customer}`, branch && `branch=${branch}`].filter(Boolean).join('; ') || 'none'}`], []]
    );
  }

  const th = 'px-3 py-2.5 font-medium text-right whitespace-nowrap';
  const diff = data ? data.totalOutstanding - data.unpaidInvoicesToday : 0;

  return (
    <section aria-labelledby="out-h" className="space-y-3">
      <SectionHeading id="out-h" title="Total Outstanding — as of selected To Date" note={<>as of {dmy(asOf)}</>} />
      <p className="text-xs text-ink-tertiary -mt-1">
        Customer balances from journal entries, netting credit memos and payments on account, measured as of the selected To Date using reconciliation history
        (the client's ageing report). This is not “unpaid invoices”; that older figure is shown below for reconciliation only.
      </p>

      {error ? (
        <div className="card"><ErrorState message={error} onRetry={() => setReload((n) => n + 1)} /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="card">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Total Outstanding · as of {dmy(asOf)}</p>
              {loading || !data ? <Skeleton className="h-10 w-56 mt-2" /> : (
                <p className="text-3xl font-semibold text-ink-primary tabular-nums mt-1">₹ {rupees.format(data.totalOutstanding)}</p>
              )}
              {data && <p className="text-sm text-ink-secondary mt-1">{rupees.format(data.customerCount)} customers with a balance</p>}
              {(customer || branch) && (
                <button className="mt-2 text-xs text-brand-600 dark:text-brand-400 hover:underline" onClick={() => setSearch(new URLSearchParams(), { replace: true })}>
                  Clear filters ({[customer && `customer ${customer}`, branch && 'branch'].filter(Boolean).join(', ')})
                </button>
              )}
            </div>

            <div className="card lg:col-span-2">
              <h3 className="font-semibold text-ink-primary mb-2">By branch <span className="text-xs font-normal text-ink-tertiary">(click to drill down)</span></h3>
              {loading || !data ? <Skeleton className="h-24 w-full" /> : data.byBranch.length === 0 ? (
                <p className="text-sm text-ink-tertiary">No outstanding balance.</p>
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                  {data.byBranch.map((b) => (
                    <li key={`${b.branchCode}`}>
                      <button className={`w-full flex justify-between gap-3 py-1 text-sm rounded px-2 hover:bg-surface-tertiary ${branch === String(b.branchCode) ? 'bg-surface-tertiary' : ''}`}
                        onClick={() => b.branchCode !== null && setParam('branch', branch === String(b.branchCode) ? '' : String(b.branchCode))}>
                        <span className="text-ink-primary">{b.branch}</span>
                        <span className="tabular-nums text-ink-secondary">₹ {rupees.format(b.amount)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold text-ink-primary mb-2">Ageing by posting date</h3>
            {loading || !data ? <Skeleton className="h-10 w-full" /> : (
              <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
                {data.ageing.map((b) => (
                  <div key={b.label} className="rounded-lg border border-border px-3 py-2">
                    <div className="text-xs text-ink-tertiary">{b.label} days</div>
                    <div className="tabular-nums text-sm font-medium text-ink-primary">₹ {rupees.format(b.amount)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {data && (
            <div className="card text-sm">
              <h3 className="font-semibold text-ink-primary mb-1">Reconciliation with the earlier portal figure</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-ink-secondary">
                <div>Journal-based (as of {dmy(asOf)}): <strong className="text-ink-primary tabular-nums">₹ {rupees.format(data.totalOutstanding)}</strong></div>
                <div>Unpaid invoices (as of today): <strong className="text-ink-primary tabular-nums">₹ {rupees.format(data.unpaidInvoicesToday)}</strong></div>
                <div>Difference: <strong className="text-ink-primary tabular-nums">₹ {rupees.format(diff)}</strong></div>
              </div>
              {data.noBillToCustomers > 0 && (
                <p className="text-xs text-ink-secondary mt-2">
                  <strong className="text-ink-primary">Included here, dropped by the client's own report:</strong> {rupees.format(data.noBillToBalance)} across {rupees.format(data.noBillToCustomers)} customer(s) that have no default bill-to address
                  (the client's query joins to the address and silently omits them). The client's report would therefore show ₹ {rupees.format(data.totalOutstanding - data.noBillToBalance)}.
                </p>
              )}
              <p className="text-xs text-ink-tertiary mt-1">
                The difference comes from credit memos and payments on account (netted here, ignored by the invoice figure), journal adjustments, and the as-of date
                (today's unpaid invoices vs. the balance at {dmy(asOf)}).
              </p>
            </div>
          )}

          <div className="card p-0 overflow-hidden">
            <div className="flex items-center justify-between gap-2 p-4 border-b border-border">
              <h3 className="font-semibold text-ink-primary">Customer-wise balance &amp; ageing <span className="text-xs font-normal text-ink-tertiary">(click a customer for its journal lines)</span></h3>
              {canExport && (
                <button className="btn-secondary" onClick={exportCustomers} disabled={!data || data.totalCount === 0}><Download className="h-4 w-4" /> Download CSV</button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink-tertiary border-b border-border">
                    <th className="px-3 py-2.5 font-medium">Customer</th>
                    <th className="px-3 py-2.5 font-medium">Sales person</th>
                    <th className={th} title="Days from the due date to the As-on date, for the customer's oldest owed item">Overdue days</th>
                    <th className={th}>Balance</th><th className={th}>0–30</th><th className={th}>31–60</th><th className={th}>61–90</th>
                    <th className={th}>91–120</th><th className={th}>121–150</th><th className={th}>151–180</th><th className={th}>181–210</th><th className={th}>211+</th>
                  </tr>
                </thead>
                <tbody>
                  {loading || !data ? (
                    Array.from({ length: 6 }).map((_, i) => <tr key={i} className="border-b border-border last:border-0"><td colSpan={12} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td></tr>)
                  ) : data.customers.length === 0 ? (
                    <tr><td colSpan={12}><EmptyState message="No outstanding balances for the selection." /></td></tr>
                  ) : data.customers.map((c) => (
                    <tr key={c.customerCode} className={`border-b border-border last:border-0 hover:bg-surface-tertiary/60 cursor-pointer ${customer === c.customerCode ? 'bg-surface-tertiary/60' : ''}`}
                      onClick={() => setParam('customer', customer === c.customerCode ? '' : c.customerCode)}>
                      <td className="px-3 py-2"><div className="text-ink-primary">{c.customerName ?? c.customerCode}</div><div className="text-xs text-ink-tertiary">{c.customerCode}</div></td>
                      <td className="px-3 py-2">{c.salesPerson ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.overdueDays === null || c.overdueDays === undefined ? '—' : c.overdueDays}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{rupees.format(c.balance)}</td>
                      {[c.days0To30, c.days31To60, c.days61To90, c.days91To120, c.days121To150, c.days151To180, c.days181To210, c.days211Plus].map((v, i) => (
                        <td key={i} className="px-3 py-2 text-right tabular-nums">{v ? rupees.format(v) : ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {data && data.customers.length > 0 && (
                  <tfoot>
                    <tr className="font-semibold bg-surface-tertiary/60 border-t border-border-strong">
                      <td className="px-3 py-2.5" colSpan={3}>Total · {rupees.format(data.customerCount)} customers (all pages)</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{rupees.format(data.totalOutstanding)}</td>
                      {data.ageing.map((b) => <td key={b.label} className="px-3 py-2.5 text-right tabular-nums">{rupees.format(b.amount)}</td>)}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {data && data.totalCount > 0 && (
              <Pagination page={page} totalPages={Math.max(1, Math.ceil(data.totalCount / PAGE))} onPageChange={(p) => setParam('page', p > 1 ? String(p) : '')} />
            )}
          </div>

          {(customer || branch) && (
            <div className="card p-0 overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-ink-primary">Journal lines behind the figure {lines && <span className="text-xs font-normal text-ink-tertiary">· total ₹ {rupees.format(lines.total)}</span>}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-ink-tertiary border-b border-border">
                      <th className="px-3 py-2.5 font-medium">Trans #</th><th className="px-3 py-2.5 font-medium">Document</th><th className="px-3 py-2.5 font-medium">Reference</th>
                      <th className="px-3 py-2.5 font-medium">Customer</th><th className="px-3 py-2.5 font-medium">Branch</th>
                      <th className="px-3 py-2.5 font-medium">Posting</th><th className="px-3 py-2.5 font-medium">Due</th>
                      <th className={th}>Days</th><th className={th} title="Days from the due date to the As-on date (negative = not yet due)">Overdue days</th><th className={th}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!lines ? (
                      <tr><td colSpan={10} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td></tr>
                    ) : lines.rows.length === 0 ? (
                      <tr><td colSpan={10}><EmptyState message="No open journal lines for this selection." /></td></tr>
                    ) : lines.rows.map((r, i) => (
                      <tr key={`${r.transId}-${i}`} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 tabular-nums">{r.transId}</td>
                        <td className="px-3 py-2">{r.documentType}</td>
                        <td className="px-3 py-2">{[r.baseRef, r.ref1].filter(Boolean).join(' / ') || '—'}</td>
                        <td className="px-3 py-2">{r.customerName ?? r.customerCode}</td>
                        <td className="px-3 py-2">{r.branch ?? '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.postingDate)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.dueDate ? formatDate(r.dueDate) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.daysOutstanding}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.overdueDays === null || r.overdueDays === undefined ? '—' : r.overdueDays}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{rupees.format(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {lines && lines.rows.length > 0 && (
                    <tfoot><tr className="font-semibold bg-surface-tertiary/60 border-t border-border-strong"><td className="px-3 py-2.5" colSpan={9}>Total ({rupees.format(lines.totalCount)} lines, all pages)</td><td className="px-3 py-2.5 text-right tabular-nums">{rupees.format(lines.total)}</td></tr></tfoot>
                  )}
                </table>
              </div>
              {lines && lines.totalCount > 0 && (
                <Pagination page={linePage} totalPages={Math.max(1, Math.ceil(lines.totalCount / PAGE))} onPageChange={setLinePage} />
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
