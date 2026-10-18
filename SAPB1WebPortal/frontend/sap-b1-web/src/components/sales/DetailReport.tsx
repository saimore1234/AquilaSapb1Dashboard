import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import type { DetailReportQuery } from '../../types';
import { useReportFilterOptions } from './reportOptions';
import { EmptyState, ErrorState } from '../StateViews';
import { Skeleton } from '../ui/Skeleton';
import Pagination from '../Pagination';
import { SectionHeading } from './salesShared';
import { dmy, taxLabel, useSalesFilters } from './salesFilters';
import { useSalesRefresh } from './salesRefresh';
import { downloadCsv } from './salesUtils';
import { usePermissions } from '../../permissions/usePermissions';

export type FilterKey = 'warehouse' | 'unit' | 'branch' | 'salesperson' | 'customer' | 'customerGroup' | 'category' | 'item' | 'docType' | 'search' | 'newOnly' | 'allDates';

export interface Col<T> {
  key: string;
  header: string;
  align?: 'right';
  render: (row: T) => React.ReactNode;
  /** Plain value for the CSV export (defaults to the rendered value when it is text/number). */
  csv: (row: T) => string | number | null | undefined;
  nowrap?: boolean;
}

const FILTER_PARAMS: Record<FilterKey, string> = {
  warehouse: 'warehouse', unit: 'unit', branch: 'branch', salesperson: 'salesperson', customer: 'customer',
  customerGroup: 'customerGroup', category: 'category', item: 'item', docType: 'docType', search: 'q', newOnly: 'new', allDates: 'all'
};

interface Props<T, R extends { rows: T[]; totalCount: number }> {
  id: string;
  title: string;
  note?: React.ReactNode;
  fetcher: (q: DetailReportQuery) => Promise<R>;
  columns: Col<T>[];
  filters: FilterKey[];
  rowKey: (row: T, index: number) => string;
  /** Footer <tr> built from the report's totals (the totals come from the same filtered set as the rows). */
  footer?: (report: R) => React.ReactNode;
  /** The same footer for the CSV export. */
  footerCsv?: (report: R) => (string | number | null | undefined)[];
  /** One-line plain-text metric definition shown under the heading. */
  definition?: string;
  csvName: string;
  pageSize?: number;
  /** Include the global Include Tax flag in the "amounts" line of the header. */
  showTaxBasis?: boolean;
  /** Fixed query values for this report (e.g. the grouping of a sales analysis). */
  extra?: Partial<DetailReportQuery>;
}

/**
 * Generic line-level report: global period + this report's own filters (kept in the URL so drill-downs from the dashboard
 * arrive pre-filtered and the link can be shared), server-side paging, a footer built from the same filtered set, and a CSV
 * export that uses exactly the same filters as the visible grid.
 */
export default function DetailReport<T, R extends { rows: T[]; totalCount: number }>({
  id, title, note, fetcher, columns, filters, rowKey, footer, footerCsv, definition, csvName, pageSize = 25, showTaxBasis = false, extra
}: Props<T, R>) {
  const { canExport } = usePermissions();
  const { applied } = useSalesFilters();
  const { tick, markUpdated } = useSalesRefresh();
  const [search, setSearch] = useSearchParams();
  const options = useReportFilterOptions();
  const [data, setData] = useState<R | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const seenTick = useRef(tick);

  // The four shared dimensions come from the global filter unless this report was opened (or changed) with its own value.
  // In the URL, '*' means an explicit "All" for that report.
  const GLOBAL: Partial<Record<FilterKey, string>> = { unit: applied.unit, salesperson: applied.salesperson, customerGroup: applied.customerGroup, category: applied.category };
  const get = (k: FilterKey) => {
    const v = search.get(FILTER_PARAMS[k]);
    if (v === null) return GLOBAL[k] ?? '';
    return v === '*' ? '' : v;
  };
  const SHARED: FilterKey[] = ['unit', 'salesperson', 'customerGroup', 'category'];
  const setFilter = (k: FilterKey, value: string) => setParam(FILTER_PARAMS[k], value === '' && SHARED.includes(k) ? '*' : value);
  const page = Math.max(1, Number(search.get('page') ?? '1') || 1);

  const setParam = useCallback((key: string, value: string) => {
    setSearch((cur) => {
      const next = new URLSearchParams(cur);
      if (value) next.set(key, value); else next.delete(key);
      if (key !== 'page') next.delete('page');
      return next;
    }, { replace: true });
  }, [setSearch]);

  const [itemText, setItemText] = useState(get('item'));
  const [customerText, setCustomerText] = useState(get('customer'));
  const [searchText, setSearchText] = useState(get('search'));
  useEffect(() => {
    const t = setTimeout(() => {
      if (itemText !== get('item')) setParam('item', itemText.trim());
      if (customerText !== get('customer')) setParam('customer', customerText.trim());
      if (searchText !== get('search')) setParam('q', searchText.trim());
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemText, customerText, searchText]);

  // `extra` is usually an inline object; key the memo on its content so a new object every render doesn't refetch the report.
  // A drill-down can pin its own dates (?df=yyyy-MM-dd&dt=...), e.g. a customer's history over two years.
  const dateOverride = { from: search.get('df') || applied.from, to: search.get('dt') || applied.to };
  const extraKey = JSON.stringify(extra ?? {});
  const query = useMemo<DetailReportQuery>(() => {
    const num = (k: FilterKey) => (get(k) ? Number(get(k)) : undefined);
    return {
      dateFrom: dateOverride.from,
      dateTo: dateOverride.to,
      warehouse: get('warehouse') || undefined,
      unit: num('unit'),
      branch: num('branch'),
      salesperson: num('salesperson'),
      customer: get('customer') || undefined,
      customerGroup: num('customerGroup'),
      productCategory: get('category') || undefined,
      item: get('item') || undefined,
      docType: get('docType') || undefined,
      search: get('search') || undefined,
      newThisQuarter: get('newOnly') === '1' ? true : undefined,
      allDates: get('allDates') === '1' ? true : undefined,
      includeTax: applied.includeTax,
      netOfCreditNotes: applied.netOfCreditNotes,
      locations: search.get('locs') ? search.get('locs')!.split(',').map(Number).filter((n) => Number.isFinite(n)) : undefined,
      ...extra
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateOverride.from, dateOverride.to, applied.includeTax, applied.netOfCreditNotes, applied.unit, applied.salesperson, applied.customerGroup, applied.category, search, extraKey]);

  useEffect(() => {
    const silent = seenTick.current !== tick;
    seenTick.current = tick;
    if (!silent) { setLoading(true); setData(null); } // never leave old numbers on screen for a new period/filter
    setError(null);
    fetcher({ ...query, page, pageSize })
      .then((d) => { setData(d); markUpdated(); })
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load this report.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, page, pageSize, reload, tick]);

  async function exportCsv() {
    setNotice(null);
    try {
      const all = await fetcher({ ...query, page: 1, pageSize: 5000 });
      const active = (Object.keys(FILTER_PARAMS) as FilterKey[]).filter((k) => filters.includes(k) && get(k)).map((k) => `${k}=${get(k)}`).join('; ');
      const pre = [[`Report: ${title}`], [`Period: ${dmy(dateOverride.from)} to ${dmy(dateOverride.to)}`], [`Filters: ${active || 'none'}`], []];
      const rows: (string | number | null | undefined)[][] = all.rows.map((r) => columns.map((c) => c.csv(r)));
      if (footerCsv) rows.push(footerCsv(all));
      downloadCsv(`${csvName}-${dateOverride.from}-to-${dateOverride.to}.csv`, columns.map((c) => c.header), rows, pre);
      if (all.totalCount > 5000) setNotice(`Exported the first 5,000 of ${all.totalCount.toLocaleString('en-IN')} rows — narrow the filters for the rest.`);
    } catch (err) {
      setNotice((err as Error).message || 'Export failed.');
    }
  }

  const sel = 'px-3 py-2 text-sm rounded-lg border border-border-strong bg-surface text-ink-primary min-w-0';
  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / pageSize)) : 1;
  const has = (k: FilterKey) => filters.includes(k);

  return (
    <section aria-labelledby={`${id}-h`} className="space-y-3">
      <SectionHeading id={`${id}-h`} title={title} note={note ?? <>{dmy(dateOverride.from)} to {dmy(dateOverride.to)}{showTaxBasis ? ` · ${taxLabel(applied.includeTax)}` : ''}</>} />
      {definition && <p className="text-xs text-ink-tertiary -mt-1">{definition}</p>}

      <div className="card flex flex-wrap items-end gap-3">
        {has('unit') && (
          <div><label className="block text-xs text-ink-secondary mb-1">Unit</label>
            <select className={sel} value={get('unit')} onChange={(e) => setFilter('unit', e.target.value)}>
              <option value="">All units</option>
              {options?.units.map((u) => <option key={u.code} value={u.code}>{u.label || u.name}</option>)}
            </select></div>
        )}
        {has('warehouse') && (
          <div><label className="block text-xs text-ink-secondary mb-1">Warehouse</label>
            <select className={sel} value={get('warehouse')} onChange={(e) => setParam('warehouse', e.target.value)}>
              <option value="">All warehouses</option>
              {options?.warehouses.map((w) => <option key={w.code} value={w.code}>{w.code} — {w.name}</option>)}
            </select></div>
        )}
        {has('branch') && (
          <div><label className="block text-xs text-ink-secondary mb-1">Branch</label>
            <select className={sel} value={get('branch')} onChange={(e) => setParam('branch', e.target.value)}>
              <option value="">All branches</option>
              {options?.branches.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select></div>
        )}
        {has('salesperson') && (
          <div><label className="block text-xs text-ink-secondary mb-1">Salesperson</label>
            <select className={sel} value={get('salesperson')} onChange={(e) => setFilter('salesperson', e.target.value)}>
              <option value="">All salespersons</option>
              {options?.salespersons.map((s) => <option key={s.code} value={s.code}>{s.name}{s.active ? '' : ' (inactive)'}</option>)}
            </select></div>
        )}
        {has('customerGroup') && (
          <div><label className="block text-xs text-ink-secondary mb-1">Customer group</label>
            <select className={sel} value={get('customerGroup')} onChange={(e) => setFilter('customerGroup', e.target.value)}>
              <option value="">All groups</option>
              {options?.customerGroups.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
            </select></div>
        )}
        {has('category') && (
          <div><label className="block text-xs text-ink-secondary mb-1">Product category</label>
            <select className={sel} value={get('category')} onChange={(e) => setFilter('category', e.target.value)}>
              <option value="">All categories</option>
              {options?.productCategories.map((c) => <option key={c}>{c}</option>)}
            </select></div>
        )}
        {has('docType') && (
          <div><label className="block text-xs text-ink-secondary mb-1">Document</label>
            <select className={sel} value={get('docType')} onChange={(e) => setParam('docType', e.target.value)}>
              <option value="">Invoices &amp; credit memos</option>
              <option value="invoice">A/R invoices only</option>
              <option value="creditmemo">Credit memos only</option>
            </select></div>
        )}
        {has('customer') && (
          <div><label className="block text-xs text-ink-secondary mb-1">Customer / vendor code</label>
            <input className={`${sel} w-40`} placeholder="e.g. C00054" value={customerText} onChange={(e) => setCustomerText(e.target.value)} /></div>
        )}
        {has('search') && (
          <div className="grow min-w-[10rem]"><label className="block text-xs text-ink-secondary mb-1">Search</label>
            <input className={`${sel} w-full`} placeholder="Code or name" value={searchText} onChange={(e) => setSearchText(e.target.value)} /></div>
        )}
        {has('newOnly') && (
          <label className={`${sel} inline-flex items-center gap-2 cursor-pointer select-none`} title="Customers created since the current financial-year quarter began">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={get('newOnly') === '1'} onChange={(e) => setParam('new', e.target.checked ? '1' : '')} />
            New this quarter
          </label>
        )}
        {has('allDates') && (
          <label className={`${sel} inline-flex items-center gap-2 cursor-pointer select-none`} title="List every open line regardless of the order date">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={get('allDates') === '1'} onChange={(e) => setParam('all', e.target.checked ? '1' : '')} />
            All open orders (any order date)
          </label>
        )}
        {has('item') && (
          <div className="grow min-w-[10rem]"><label className="block text-xs text-ink-secondary mb-1">Item code or description</label>
            <input className={`${sel} w-full`} placeholder="Search items" value={itemText} onChange={(e) => setItemText(e.target.value)} /></div>
        )}
        {canExport && (
          <button className="btn-secondary ml-auto" onClick={exportCsv} disabled={!data || data.totalCount === 0}>
            <Download className="h-4 w-4" /> Download CSV
          </button>
        )}
      </div>
      {notice && <p className="text-xs text-warning">{notice}</p>}

      {error ? (
        <div className="card"><ErrorState message={error} onRetry={() => setReload((n) => n + 1)} /></div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-tertiary border-b border-border">
                  {columns.map((c) => <th key={c.key} className={`px-3 py-2.5 font-medium ${c.align === 'right' ? 'text-right' : ''} whitespace-nowrap`}>{c.header}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading || !data ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-border last:border-0"><td colSpan={columns.length} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td></tr>
                  ))
                ) : data.rows.length === 0 ? (
                  <tr><td colSpan={columns.length}><EmptyState message="No records for the selected period and filters." /></td></tr>
                ) : (
                  data.rows.map((r, i) => (
                    <tr key={rowKey(r, i)} className="border-b border-border last:border-0 hover:bg-surface-tertiary/60">
                      {columns.map((c) => (
                        <td key={c.key} className={`px-3 py-2 ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.nowrap ? 'whitespace-nowrap' : ''}`}>{c.render(r)}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
              {!loading && data && data.rows.length > 0 && footer && <tfoot>{footer(data)}</tfoot>}
            </table>
          </div>
          {data && data.totalCount > 0 && (
            <Pagination page={page} totalPages={totalPages} onPageChange={(p) => setParam('page', p > 1 ? String(p) : '')} />
          )}
        </div>
      )}
    </section>
  );
}
