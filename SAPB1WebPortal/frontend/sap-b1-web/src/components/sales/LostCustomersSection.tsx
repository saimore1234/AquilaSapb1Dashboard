import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Download } from 'lucide-react';
import { getLostCustomers } from '../../api/sales';
import type { LostCustomerReport } from '../../types';
import { EmptyState, ErrorState } from '../StateViews';
import { Skeleton } from '../ui/Skeleton';
import Pagination from '../Pagination';
import StatCard from '../StatCard';
import { SectionHeading } from './salesShared';
import { amountTone, formatAmount, formatCount, formatInr, formatLongDate, formatPct } from './formatters';
import { taxLabel, useSalesFilters } from './salesFilters';
import { useSalesRefresh } from './salesRefresh';
import { downloadCsv } from './salesUtils';
import { salesReportLink } from '../../data/salesReports';
import { usePermissions } from '../../permissions/usePermissions';

const PAGE = 25;
const fyOptions = (iso: string) => {
  const y = Number(iso.slice(0, 4));
  const start = Number(iso.slice(5, 7)) >= 4 ? y : y - 1;
  return [start, start - 1, start - 2, start - 3].map((s) => `${s}-${String((s + 1) % 100).padStart(2, '0')}`);
};

/**
 * Lost Customer Analysis: customers invoiced in the previous financial year (April–March) but not at all in the current one, measured
 * up to the selected To Date. The unit, customer group and salesperson come from the shared filter bar (salesperson = the customer's
 * ASSIGNED salesperson). While the current year is still running the page says so: those customers may yet buy.
 */
export default function LostCustomersSection() {
  const { canExport } = usePermissions();
  const { applied } = useSalesFilters();
  const { tick, markUpdated } = useSalesRefresh();
  const seenTick = useRef(tick);
  const [search, setSearch] = useSearchParams();
  const fy = search.get('fy') || fyOptions(applied.to)[0];
  const minPrev = search.get('min') || '';
  const page = Math.max(1, Number(search.get('page') ?? '1') || 1);
  const [term, setTerm] = useState(search.get('q') ?? '');
  const [data, setData] = useState<LostCustomerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const set = (k: string, v: string) =>
    setSearch((cur) => { const n = new URLSearchParams(cur); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); return n; }, { replace: true });

  useEffect(() => {
    const t = setTimeout(() => { if (term !== (search.get('q') ?? '')) set('q', term.trim()); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const query = useMemo(() => ({
    financialYear: fy,
    asOf: applied.to,
    unit: applied.unit ? Number(applied.unit) : undefined,
    customerGroup: applied.customerGroup ? Number(applied.customerGroup) : undefined,
    salesperson: applied.salesperson ? Number(applied.salesperson) : undefined,
    minPreviousSales: minPrev && Number.isFinite(Number(minPrev)) ? Number(minPrev) : undefined,
    search: search.get('q') || undefined,
    includeTax: applied.includeTax
  }), [fy, applied, minPrev, search]);

  useEffect(() => {
    const silent = seenTick.current !== tick;
    seenTick.current = tick;
    if (!silent) { setLoading(true); setData(null); }
    setError(null);
    getLostCustomers({ ...query, page, pageSize: PAGE })
      .then((d) => { setData(d); markUpdated(); })
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load the lost-customer analysis.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, page, reload, tick]);

  async function exportCsv() {
    const all = await getLostCustomers({ ...query, page: 1, pageSize: 5000 });
    downloadCsv(
      `lost-customers-fy-${all.financialYear}-as-of-${applied.to}.csv`,
      ['Customer Code', 'Customer', 'Customer Group', 'Assigned Salesperson', 'Previous-year Sales', 'Current-year Sales (to date)', 'Last Sales Date', 'Previous-year Invoice Lines', 'Frozen'],
      [...all.rows.map((r) => [r.customerCode, r.customerName, r.customerGroup, r.salesperson, r.previousYearSales, r.currentYearSales, r.lastSalesDate?.slice(0, 10), r.previousInvoiceLines, r.frozen ? 'Yes' : 'No']),
        ['TOTAL', `${all.summary.lostCustomers} customers`, '', '', all.summary.lostPreviousSales, '', '', '', '']],
      [['Report: Lost Customer Analysis'], [`Previous year: ${all.previousFrom.slice(0, 10)} to ${all.previousTo.slice(0, 10)}`], [`Current year: ${all.currentFrom.slice(0, 10)} to ${all.currentTo.slice(0, 10)}${all.currentYearComplete ? '' : ' (year not complete)'}`], [`Amounts ${taxLabel(applied.includeTax)}, net of credit notes`], []]
    );
  }

  const s = data?.summary;
  const input = 'ctl';
  return (
    <section aria-labelledby="lost-h" className="space-y-3">
      <SectionHeading id="lost-h" title="Lost Customer Analysis" note={data ? <>FY {data.financialYear} vs FY {fyOptions(data.previousFrom.slice(0, 10))[0]}</> : undefined} />
      <p className="text-xs text-ink-tertiary -mt-1">
        Customers with A/R invoices in the previous financial year (1 April – 31 March) and none in the current one. “Sales” means A/R invoices; amounts are net of credit notes.
        The current year is measured up to the selected To Date. Unit, customer group and salesperson (the customer's assigned salesperson) follow the filter bar above.
      </p>

      <div className="panel px-3 py-2.5 flex flex-wrap items-end gap-3">
        <div>
          <label className="ctl-label" htmlFor="lc-fy">Financial year (current)</label>
          <select id="lc-fy" className={`${input} w-40`} value={fy} onChange={(e) => set('fy', e.target.value)}>
            {fyOptions(applied.to).map((o) => <option key={o} value={o}>FY {o}</option>)}
          </select>
        </div>
        <div>
          <label className="ctl-label" htmlFor="lc-min">Min. previous-year sales (₹)</label>
          <input id="lc-min" className={`${input} w-44`} inputMode="numeric" placeholder="e.g. 100000" value={minPrev} onChange={(e) => set('min', e.target.value.replace(/[^\d]/g, ''))} />
        </div>
        <div className="grow min-w-[10rem]">
          <label className="ctl-label" htmlFor="lc-q">Search</label>
          <input id="lc-q" className={`${input} w-full`} placeholder="Customer code or name" value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
        {canExport && (
          <button className="btn-secondary btn-compact ml-auto" onClick={exportCsv} disabled={!data || data.totalCount === 0}><Download className="h-4 w-4" /> CSV</button>
        )}
      </div>

      {data && !data.currentYearComplete && (
        <div role="note" className="panel px-3 py-2 flex items-start gap-2 text-sm border-warning">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
          <p className="text-ink-secondary">
            The current financial year is not complete: it runs to {formatLongDate(data.currentFyEnd.slice(0, 10))} and is measured only up to <strong className="text-ink-primary">{formatLongDate(data.currentTo.slice(0, 10))}</strong>.
            Customers listed have not been invoiced <em>so far</em> this year and may still buy before it ends.
          </p>
        </div>
      )}

      {error ? (
        <div className="panel p-4"><ErrorState message={error} onRetry={() => setReload((n) => n + 1)} /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-stretch">
            <StatCard variant="compact" label="Lost customers" value={s ? formatCount(s.lostCustomers) : '…'} hint="Invoiced last year, not this year" basis="Selected year" />
            <StatCard variant="compact" label="Customers invoiced last year" value={s ? formatCount(s.previousYearCustomers) : '…'} hint={s && s.previousYearCustomers ? `${formatPct((s.lostCustomers / s.previousYearCustomers) * 100)} of them are lost` : undefined} basis="Starting population" />
            <StatCard variant="compact" label="Previous-year sales of lost customers" value={s ? formatInr(s.lostPreviousSales) : '…'} hint={s && s.previousYearSales ? `${formatPct((s.lostPreviousSales / s.previousYearSales) * 100)} of previous-year sales` : undefined} basis="Previous financial year" />
            <StatCard variant="compact" label="Analysis period" value={data ? `FY ${data.financialYear}` : '…'} hint={data ? `Previous: ${formatLongDate(data.previousFrom.slice(0, 10))} – ${formatLongDate(data.previousTo.slice(0, 10))}` : undefined} basis={data ? `Current to ${formatLongDate(data.currentTo.slice(0, 10))}` : undefined} />
          </div>

          <div className="panel p-0 overflow-hidden">
            <div className="sheet-wrap max-h-[36rem] border-0 rounded-none">
              <table className="sheet" aria-label="Lost customers">
                <thead>
                  <tr>
                    <th scope="col">Customer</th>
                    <th scope="col">Customer group</th>
                    <th scope="col">Assigned salesperson</th>
                    <th scope="col" className="num">Previous-year sales</th>
                    <th scope="col" className="num">Current-year sales</th>
                    <th scope="col">Last sale</th>
                    <th scope="col" className="num">Invoice lines (prev.)</th>
                    <th scope="col">History</th>
                  </tr>
                </thead>
                <tbody>
                  {loading || !data ? (
                    Array.from({ length: 6 }).map((_, i) => <tr key={i}><td colSpan={8}><Skeleton className="h-4 w-full" /></td></tr>)
                  ) : data.rows.length === 0 ? (
                    <tr><td colSpan={8}><EmptyState message="No lost customers for this selection." /></td></tr>
                  ) : data.rows.map((r) => (
                    <tr key={r.customerCode}>
                      <td className="whitespace-nowrap"><div className="text-ink-primary">{r.customerName ?? r.customerCode}{r.frozen && <span className="ml-2 badge-neutral">Frozen</span>}</div><div className="text-xs text-ink-tertiary">{r.customerCode}</div></td>
                      <td>{r.customerGroup ?? '–'}</td>
                      <td>{r.salesperson ?? '–'}</td>
                      <td className="num">{formatAmount(r.previousYearSales, { zero: true })}</td>
                      <td className="num"><span className={amountTone(r.currentYearSales)}>{formatAmount(r.currentYearSales)}</span></td>
                      <td className="whitespace-nowrap">{r.lastSalesDate ? formatLongDate(r.lastSalesDate.slice(0, 10)) : '–'}</td>
                      <td className="num">{formatCount(r.previousInvoiceLines)}</td>
                      <td>
                        <Link className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline" to={salesReportLink('sales-register', { customer: r.customerCode, df: data.previousFrom.slice(0, 10), dt: data.currentTo.slice(0, 10) })}>
                          Sales history →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {data && data.rows.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={3}>Total · {formatCount(data.summary.lostCustomers)} lost customers (all pages)</td>
                      <td className="num">{formatAmount(data.summary.lostPreviousSales, { zero: true })}</td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {data && data.totalCount > 0 && <Pagination page={page} totalPages={Math.max(1, Math.ceil(data.totalCount / PAGE))} onPageChange={(p) => set('page', p > 1 ? String(p) : '')} />}
          </div>
        </>
      )}
    </section>
  );
}
