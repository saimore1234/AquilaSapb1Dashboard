import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { getCustomerGroupSales } from '../../api/sales';
import type { CustomerGroupSales, DetailReportQuery } from '../../types';
import { EmptyState, ErrorState } from '../StateViews';
import { Skeleton } from '../ui/Skeleton';
import { amountTone, formatAmount, formatPct, formatPeriod } from './formatters';
import { taxLabel, useSalesFilters } from './salesFilters';
import { useSalesRefresh } from './salesRefresh';
import { downloadCsv } from './salesUtils';
import { salesReportLink } from '../../data/salesReports';
import { usePermissions } from '../../permissions/usePermissions';

type SortKey = 'value' | 'name';

interface Props {
  /** Extra query values from the host page (e.g. the Turnover section's location selection and branch). */
  extra?: Partial<DetailReportQuery>;
  /** Show the section heading (off when the host provides its own). */
  heading?: boolean;
}

/**
 * Customer Group → Customer sales in ONE report (it replaces the separate group-wise and customer-wise sections). The data is the
 * Sales Register's own rows, grouped once by customer group and customer, so group totals, customer figures and percentages all use
 * the same filtered total and no customer is counted twice. Expand a group to see its customers; click a name for its register lines.
 */
export default function CustomerGroupSalesSection({ extra, heading = true }: Props) {
  const { canExport } = usePermissions();
  const { applied } = useSalesFilters();
  const { tick, markUpdated } = useSalesRefresh();
  const seenTick = useRef(tick);
  const [data, setData] = useState<CustomerGroupSales | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>('value');
  const [term, setTerm] = useState('');
  const extraKey = JSON.stringify(extra ?? {});

  useEffect(() => {
    const silent = seenTick.current !== tick;
    seenTick.current = tick;
    if (!silent) { setLoading(true); setData(null); }
    setError(null);
    let live = true;
    getCustomerGroupSales({
      dateFrom: applied.from,
      dateTo: applied.to,
      includeTax: applied.includeTax,
      netOfCreditNotes: applied.netOfCreditNotes,
      unit: applied.unit ? Number(applied.unit) : undefined,
      customerGroup: applied.customerGroup ? Number(applied.customerGroup) : undefined,
      salesperson: applied.salesperson ? Number(applied.salesperson) : undefined,
      productCategory: applied.category || undefined,
      ...extra
    })
      .then((d) => { if (!live) return; setData(d); markUpdated(); })
      .catch((err) => { if (live) setError(err?.response?.data?.message || err.message || 'Unable to load the customer group report.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, extraKey, reload, tick]);

  const groups = useMemo(() => {
    if (!data) return [];
    const t = term.trim().toLowerCase();
    const byGroup = new Map<string, { code: number | null; name: string; customers: typeof data.rows; total: number }>();
    for (const r of data.rows) {
      const k = String(r.groupCode ?? '∅');
      const g = byGroup.get(k) ?? { code: r.groupCode, name: r.customerGroup, customers: [], total: 0 };
      g.customers.push(r);
      g.total += r.value;
      byGroup.set(k, g);
    }
    const list = [...byGroup.entries()].map(([key, g]) => {
      const matches = !t ? g.customers : g.customers.filter((c) => c.customerCode.toLowerCase().includes(t) || (c.customerName ?? '').toLowerCase().includes(t));
      const showGroup = !t || matches.length > 0 || g.name.toLowerCase().includes(t);
      const customers = [...(t && matches.length === 0 && g.name.toLowerCase().includes(t) ? g.customers : matches)].sort((a, b) =>
        sort === 'name' ? (a.customerName ?? a.customerCode).localeCompare(b.customerName ?? b.customerCode) : b.value - a.value);
      return { key, ...g, customers, showGroup };
    }).filter((g) => g.showGroup);
    list.sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b.total - a.total));
    return list;
  }, [data, term, sort]);

  const total = data?.total ?? 0;
  const pct = (v: number) => (total ? (v / total) * 100 : 0);
  const searching = term.trim() !== '';
  const allOpen = groups.length > 0 && groups.every((g) => open.has(g.key));
  const toggle = (k: string) => setOpen((cur) => { const n = new Set(cur); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const carry = { unit: applied.unit || undefined, salesperson: applied.salesperson || undefined, category: applied.category || undefined };

  function exportCsv() {
    if (!data) return;
    downloadCsv(
      `customer-group-sales-${applied.from}-to-${applied.to}.csv`,
      ['Customer Group', 'Customer Code', 'Customer Name', 'Sales Value', '% of Total'],
      data.rows.map((r) => [r.customerGroup, r.customerCode, r.customerName, r.value, total ? Number(((r.value / total) * 100).toFixed(4)) : 0]),
      [[`Report: Customer Group / Customer Sales`], [`Period: ${formatPeriod(applied.from, applied.to)}`], [`Basis: ${applied.netOfCreditNotes ? 'net of credit notes' : 'invoices only'}, ${taxLabel(applied.includeTax)}`], []]
    );
  }

  return (
    <div className="panel p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div>
          {heading && <h3 className="text-sm font-semibold text-ink-primary">Customer Group → Customer Sales</h3>}
          <p className="text-xs text-ink-tertiary">
            {formatPeriod(applied.from, applied.to)} · {applied.netOfCreditNotes ? 'net of credit notes' : 'invoices only'} · {taxLabel(applied.includeTax)} · whole rupees · source: Sales Register
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input className="ctl w-44" placeholder="Search customer" aria-label="Search customers" value={term} onChange={(e) => setTerm(e.target.value)} />
          <select className="ctl" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="value">Sort: highest sales</option>
            <option value="name">Sort: name A–Z</option>
          </select>
          <button className="btn-secondary btn-compact" onClick={() => setOpen(allOpen ? new Set() : new Set(groups.map((g) => g.key)))} disabled={!groups.length}>
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
          {canExport && (
            <button className="btn-secondary btn-compact" onClick={exportCsv} disabled={!data || data.rows.length === 0}><Download className="h-4 w-4" /> CSV</button>
          )}
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
      ) : loading || !data ? (
        <Skeleton className="h-[160px] w-full" />
      ) : data.rows.length === 0 ? (
        <EmptyState message="No sales data available for the selected filters." />
      ) : (
        <div className="sheet-wrap">
          <table className="sheet" aria-label="Sales by customer group and customer">
            <thead>
              <tr>
                <th scope="col">Customer group / customer</th>
                <th scope="col" className="num">Sales value</th>
                <th scope="col" className="num">% of total</th>
                <th scope="col" className="num">% of group</th>
                <th scope="col" className="num">Documents</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const isOpen = open.has(g.key) || (searching && g.customers.length > 0);
                const docCount = g.customers.reduce((a, c) => a + c.documents, 0);
                return (
                  <FragmentRows key={g.key}>
                    <tr className="font-medium">
                      <td className="whitespace-nowrap">
                        <button type="button" className="inline-flex items-center gap-1.5 hover:text-brand-600 dark:hover:text-brand-400" onClick={() => toggle(g.key)} aria-expanded={isOpen}>
                          {isOpen ? <ChevronDown className="h-4 w-4 text-ink-tertiary" /> : <ChevronRight className="h-4 w-4 text-ink-tertiary" />}
                          {g.name} <span className="text-xs font-normal text-ink-tertiary">({g.customers.length} customers)</span>
                        </button>
                        {g.code !== null && (
                          <Link className="ml-2 text-xs font-normal text-brand-600 dark:text-brand-400 hover:underline" to={salesReportLink('sales-register', { ...carry, customerGroup: g.code })}>register →</Link>
                        )}
                      </td>
                      <td className="num"><span className={amountTone(g.total, { zero: true })}>{formatAmount(g.total, { zero: true })}</span></td>
                      <td className="num">{formatPct(pct(g.total))}</td>
                      <td className="num text-ink-tertiary">–</td>
                      <td className="num">{docCount}</td>
                    </tr>
                    {isOpen && g.customers.map((c) => (
                      <tr key={`${g.key}|${c.customerCode}`} className="text-ink-secondary">
                        <td className="pl-9 whitespace-nowrap">
                          <Link className="text-ink-primary hover:text-brand-600 dark:hover:text-brand-400 hover:underline" to={salesReportLink('sales-register', { ...carry, customer: c.customerCode })}>
                            {c.customerName ?? c.customerCode}
                          </Link>
                          <span className="ml-2 text-xs text-ink-tertiary">{c.customerCode}</span>
                        </td>
                        <td className="num"><span className={amountTone(c.value, { zero: true })}>{formatAmount(c.value, { zero: true })}</span></td>
                        <td className="num">{formatPct(pct(c.value))}</td>
                        <td className="num">{formatPct(g.total ? (c.value / g.total) * 100 : 0)}</td>
                        <td className="num">{c.documents}</td>
                      </tr>
                    ))}
                  </FragmentRows>
                );
              })}
              <tr className="is-total">
                <td>Total · {data.rows.length} customers{searching ? ' (search narrows the rows above, not this total)' : ''}</td>
                <td className="num">{formatAmount(total, { zero: true })}</td>
                <td className="num">{formatPct(100)}</td>
                <td className="num" />
                <td className="num">{data.rows.reduce((a, c) => a + c.documents, 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Keyless fragment wrapper so a group row and its customer rows stay siblings in one <tbody>. */
function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
