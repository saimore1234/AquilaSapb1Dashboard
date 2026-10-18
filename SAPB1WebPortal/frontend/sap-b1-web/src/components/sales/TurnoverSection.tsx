import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { getTurnoverBreakup } from '../../api/sales';
import type { TurnoverBreakup } from '../../types';
import { ErrorState } from '../StateViews';
import { Skeleton } from '../ui/Skeleton';
import { RANK_COLORS, SectionHeading } from './salesShared';
import { downloadCsv } from './salesUtils';
import { useSalesRefresh } from './salesRefresh';
import { taxLabel, useSalesFilters } from './salesFilters';
import { amountTone, formatAmount, formatFy, formatInr, formatPct, formatPeriod, salesTypeLabel } from './formatters';
import { salesReportLink } from '../../data/salesReports';
import CustomerGroupSalesSection from './CustomerGroupSalesSection';
import { usePermissions } from '../../permissions/usePermissions';

/** A grid label that opens the Sales Register for exactly that slice (so the figure beside it can be checked). */
function RowLink({ to, children }: { to?: string; children: React.ReactNode }) {
  return to ? (
    <Link to={to} className="text-ink-primary hover:text-brand-600 dark:hover:text-brand-400 hover:underline focus:outline-none focus-visible:underline">
      {children}
    </Link>
  ) : (
    <>{children}</>
  );
}

/** A grid cell holding a whole-rupee amount ("–" when zero/missing, red when negative). */
function Amt({ v, zero }: { v: number | null | undefined; zero?: boolean }) {
  return <span className={amountTone(v, { zero })}>{formatAmount(v, { zero })}</span>;
}

/**
 * Turnover for the selected period: compact filter toolbar, the total, the two Excel-style summary grids
 * (Sales Type and Unit/Division), the combined Customer Group table and the Customer Group / Location / Branch detail.
 * Everything comes from one aggregated API call; no figure is computed or hardcoded here — the grids only re-add rows the
 * API already returned.
 */
export default function TurnoverSection({ reportTo }: { reportTo?: string }) {
  const { canExport } = usePermissions();
  const { applied } = useSalesFilters();
  const { from, to, includeTax } = applied;
  // Group, product category, unit and the credit-note basis come from the shared filter bar.
  const group = applied.customerGroup;
  const category = applied.category;
  const clientBasis = applied.netOfCreditNotes;
  const unitSel = applied.unit;
  // null = the company's default selection (all locations except default-excluded ones); an array = the user's own choice.
  const [locations, setLocations] = useState<number[] | null>(null);
  const [branch, setBranch] = useState('');
  const [showDetail, setShowDetail] = useState(false);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<TurnoverBreakup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { tick, markUpdated } = useSalesRefresh();
  const seenTick = useRef(tick);

  useEffect(() => {
    const silent = seenTick.current !== tick;
    seenTick.current = tick;
    if (!silent) setLoading(true);
    setError(null);
    getTurnoverBreakup({
      dateFrom: from,
      dateTo: to,
      includeTax,
      customerGroup: group ? Number(group) : undefined,
      locations: unitSel ? [Number(unitSel)] : locations ?? undefined,
      netOfCreditNotes: clientBasis || undefined,
      branch: branch ? Number(branch) : undefined,
      productCategory: category || undefined
    })
      .then((d) => {
        setData(d);
        markUpdated();
      })
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load turnover.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, includeTax, group, locations, clientBasis, branch, category, unitSel, reload, tick]);

  const maxGroup = useMemo(() => Math.max(1, ...(data?.customerGroupSales ?? []).map((g) => g.salesValue)), [data]);
  const allLocationCodes = (data?.locations ?? []).map((o) => o.code);
  const effectiveLocations = unitSel ? [Number(unitSel)] : locations ?? (data?.locations ?? []).filter((o) => !o.isDefaultExcluded).map((o) => o.code);
  const locationLabel =
    unitSel
      ? (data?.locations.find((o) => String(o.code) === unitSel)?.label || data?.locations.find((o) => String(o.code) === unitSel)?.name || 'Selected unit')
      : !data || effectiveLocations.length === allLocationCodes.length
      ? 'All locations'
      : `${effectiveLocations.length} of ${allLocationCodes.length} locations`;

  // Unit (location) x customer-group matrix, summed from the already-aggregated breakup rows.
  const unitMatrix = useMemo(() => {
    const groups = (data?.customerGroupSales ?? []).map((g) => g.customerGroup);
    const byUnit = new Map<string, Record<string, number>>();
    const groupTotals: Record<string, number> = {};
    for (const r of data?.groupLocationBranchSales ?? []) {
      const cell = byUnit.get(r.location) ?? {};
      cell[r.customerGroup] = (cell[r.customerGroup] ?? 0) + r.salesValue;
      byUnit.set(r.location, cell);
      groupTotals[r.customerGroup] = (groupTotals[r.customerGroup] ?? 0) + r.salesValue;
    }
    const rows = [...byUnit.entries()]
      .map(([unit, byGroup]) => ({ unit, label: data?.locations.find((o) => o.name === unit)?.label || unit, byGroup, total: Object.values(byGroup).reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total);
    return { groups, rows, groupTotals };
  }, [data]);

  // Row drill-downs open the Sales Register (same net basis and filters). They are offered only on the net-of-credit-notes basis,
  // because that is the basis the register reconciles to.
  const singleLocation = unitSel ? Number(unitSel) : locations && locations.length === 1 ? locations[0] : undefined;
  const registerTo = (extra: Record<string, string | number | undefined> = {}) =>
    clientBasis ? salesReportLink('sales-register', { unit: singleLocation ?? (extra.unit as number | undefined), locs: singleLocation === undefined && extra.unit === undefined ? registerLocations?.join(',') : undefined, branch: branch || undefined, customerGroup: group || undefined, category: category || undefined, ...extra }) : undefined;
  // The Turnover total covers the selected locations (by default all except the company's default-excluded ones); the register
  // drill-downs carry the same list so their totals reconcile with it.
  const registerLocations = !unitSel && data && effectiveLocations.length < allLocationCodes.length ? effectiveLocations : undefined;
  const groupCode = (name: string) => data?.customerGroups.find((o) => o.name === name)?.code;
  const unitCode = (name: string) => data?.locations.find((o) => o.name === name)?.code;
  const empty = !loading && !error && data && data.groupLocationBranchSales.length === 0;
  const fy = formatFy(to);
  const basisText = clientBasis ? 'Net of credit notes' : 'A/R invoices';

  function exportCsv() {
    if (!data) return;
    downloadCsv(
      `turnover-breakup-${from}-to-${to}-${includeTax ? 'incl' : 'excl'}-tax${clientBasis ? '-net-of-credit-notes' : ''}.csv`,
      ['Customer Group', 'Location', 'Branch', 'Sales Value', 'Percentage'],
      data.groupLocationBranchSales.map((r) => [r.customerGroup, r.location, r.branch, r.salesValue, r.percentage])
    );
  }

  return (
    <section aria-labelledby="to-h" className="space-y-3">
      <SectionHeading id="to-h" title="Turnover" note={<>{formatPeriod(from, to)}</>} reportTo={reportTo} />

      {/* ---- Filter toolbar: one aligned row of equal-height controls ---- */}
      <div className="panel px-3 py-2.5 flex flex-wrap items-end gap-x-3 gap-y-2" role="group" aria-label="Turnover filters">
        <div className="relative">
          <span className="ctl-label">Location / unit</span>
          <details className={`group ${unitSel ? 'pointer-events-none opacity-70' : ''}`} title={unitSel ? 'The unit is set in the filter bar above' : undefined}>
            <summary className="ctl w-44 flex items-center justify-between gap-2 cursor-pointer select-none list-none" aria-label="Locations (units)">
              <span className="truncate">{locationLabel}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-ink-tertiary" aria-hidden="true" />
            </summary>
            <div className="absolute z-20 mt-1 min-w-[13rem] max-h-64 overflow-auto rounded-md border border-border-strong bg-surface shadow-popover p-2 space-y-0.5">
              {data?.locations.map((o) => (
                <label key={o.code} className="flex items-center gap-2 px-1.5 py-1 text-sm text-ink-primary rounded hover:bg-surface-tertiary cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-600"
                    checked={effectiveLocations.includes(o.code)}
                    onChange={(e) => setLocations(e.target.checked ? [...effectiveLocations, o.code] : effectiveLocations.filter((c) => c !== o.code))}
                  />
                  {o.name}
                </label>
              ))}
              <div className="flex gap-3 px-1.5 pt-1.5 border-t border-border mt-1">
                <button type="button" className="text-xs text-brand-600 dark:text-brand-400 hover:underline" onClick={() => setLocations(allLocationCodes)}>Select all</button>
                <button type="button" className="text-xs text-brand-600 dark:text-brand-400 hover:underline" onClick={() => setLocations(null)}>Default</button>
              </div>
            </div>
          </details>
        </div>
        <div>
          <label className="ctl-label" htmlFor="to-br">Branch</label>
          <select id="to-br" value={branch} onChange={(e) => setBranch(e.target.value)} className="ctl w-40">
            <option value="">All branches</option>
            {data?.branches.map((o) => <option key={o.code} value={o.code}>{o.name}</option>)}
          </select>
        </div>
        {canExport && (
          <button className="btn-secondary btn-compact ml-auto" onClick={exportCsv} disabled={!data || data.groupLocationBranchSales.length === 0}>
            <Download className="h-4 w-4" /> CSV
          </button>
        )}
      </div>

      {error ? (
        <div className="panel p-4"><ErrorState message={error} onRetry={() => setReload((n) => n + 1)} /></div>
      ) : (
        <>
          {/* ---- Total turnover: one compact financial summary ---- */}
          <div className="panel p-4 flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">Total turnover</p>
              {loading || !data ? (
                <Skeleton className="h-8 w-56 mt-1" />
              ) : (
                <p className="text-2xl sm:text-3xl font-semibold text-ink-primary tabular-nums leading-tight mt-0.5">{formatInr(data.totalTurnover)}</p>
              )}
              <p className="text-xs text-ink-secondary mt-0.5">{formatPeriod(from, to)} · {fy}</p>
            </div>
            <div className="max-w-xl text-xs text-ink-secondary space-y-1">
              <p>
                {clientBasis
                  ? `Net sales: invoice lines minus credit memos, header discount deducted, no freight or rounding (${taxLabel(includeTax)}).`
                  : `A/R invoices for the period, excluding cancelled documents (${taxLabel(includeTax)}).`}
              </p>
              {clientBasis && (
                <Link
                  className="inline-block font-medium text-brand-600 dark:text-brand-400 hover:underline"
                  to={salesReportLink('sales-register', { unit: locations && locations.length === 1 ? locations[0] : undefined, branch: branch || undefined, customerGroup: group || undefined, category: category || undefined })}
                >
                  View the Sales Register lines behind this figure →
                </Link>
              )}
            </div>
          </div>

          {/* ---- Excel-style summary grids ---- */}
          <div className="panel p-4 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-sm font-semibold text-ink-primary">Turnover Summary</h3>
              <p className="text-xs text-ink-tertiary">
                {basisText} · {taxLabel(includeTax)} · whole rupees
                {clientBasis && <> · <Link to={registerTo()!} className="font-medium text-brand-600 dark:text-brand-400 hover:underline">Click any row, or open the Sales Register →</Link></>}
              </p>
            </div>
            {loading || !data ? (
              <Skeleton className="h-[220px] w-full" />
            ) : empty ? (
              <p className="text-sm text-ink-tertiary py-8 text-center">No sales data available for the selected filters.</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start">
                <div className="sheet-wrap">
                  <table className="sheet" aria-label="Turnover by sales type">
                    <thead>
                      <tr>
                        <th scope="col">Sales type</th>
                        <th scope="col" className="num">Total A/R invoice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.customerGroupSales.map((g) => (
                        <tr key={g.customerGroup}>
                          <td><RowLink to={registerTo({ customerGroup: groupCode(g.customerGroup) })}>{salesTypeLabel(g.customerGroup)}</RowLink></td>
                          <td className="num"><Amt v={g.salesValue} /></td>
                        </tr>
                      ))}
                      <tr className="is-total">
                        <td><RowLink to={registerTo()}>Total turnover ({fy})</RowLink></td>
                        <td className="num"><Amt v={data.totalTurnover} zero /></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="sheet-wrap">
                  <table className="sheet" aria-label="Turnover by unit and sales type">
                    <thead>
                      <tr>
                        <th scope="col">Unit / division</th>
                        {unitMatrix.groups.map((g) => <th key={g} scope="col" className="num">{salesTypeLabel(g)}</th>)}
                        <th scope="col" className="num">Total turnover</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unitMatrix.rows.map((r) => (
                        <tr key={r.unit}>
                          <td><RowLink to={registerTo({ unit: unitCode(r.unit) })}>{r.label}</RowLink></td>
                          {unitMatrix.groups.map((g) => <td key={g} className="num"><Amt v={r.byGroup[g]} /></td>)}
                          <td className="num font-medium"><Amt v={r.total} /></td>
                        </tr>
                      ))}
                      <tr className="is-total">
                        <td><RowLink to={registerTo()}>Total turnover ({fy})</RowLink></td>
                        {unitMatrix.groups.map((g) => <td key={g} className="num"><Amt v={unitMatrix.groupTotals[g]} zero /></td>)}
                        <td className="num"><Amt v={data.totalTurnover} zero /></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* ---- Customer Group → Customer: one combined report (replaces the separate group-wise and customer-wise sections) ---- */}
          <CustomerGroupSalesSection
            extra={{
              branch: branch ? Number(branch) : undefined,
              locations: registerLocations
            }}
          />

          {/* ---- Customer group / location / branch detail (Show / Hide) ---- */}
          <div className="panel overflow-hidden">
            <button
              className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
              onClick={() => setShowDetail((s) => !s)}
              aria-expanded={showDetail}
              aria-controls="to-detail"
            >
              <span className="flex items-center gap-2">
                {showDetail ? <ChevronDown className="h-4 w-4 text-ink-tertiary" /> : <ChevronRight className="h-4 w-4 text-ink-tertiary" />}
                <span className="text-sm font-semibold text-ink-primary">Customer Group / Location / Branch Sales</span>
                {data && <span className="text-xs text-ink-tertiary">{data.groupLocationBranchSales.length} rows</span>}
              </span>
              <span className="text-xs font-medium text-brand-600 dark:text-brand-400">{showDetail ? 'Hide' : 'Show'}</span>
            </button>
            {showDetail && (
              <div id="to-detail" className="border-t border-border p-4">
                {loading || !data ? (
                  <Skeleton className="h-[160px] w-full" />
                ) : empty ? (
                  <p className="text-sm text-ink-tertiary py-6 text-center">No sales data available for the selected filters.</p>
                ) : (
                  <div className="sheet-wrap">
                    <table className="sheet" aria-label="Sales by customer group, location and branch">
                      <thead>
                        <tr>
                          <th scope="col">Customer group</th>
                          <th scope="col">Location</th>
                          <th scope="col">Branch</th>
                          <th scope="col" className="num">Sales value</th>
                          <th scope="col" className="num">% of total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.groupLocationBranchSales.map((r) => (
                          <tr key={`${r.customerGroup}|${r.location}|${r.branch}`}>
                            <td>{r.customerGroup}</td>
                            <td>{r.location}</td>
                            <td>{r.branch}</td>
                            <td className="num"><Amt v={r.salesValue} /></td>
                            <td className="num">{formatPct(r.percentage)}</td>
                          </tr>
                        ))}
                        <tr className="is-total">
                          <td colSpan={3}>Total</td>
                          <td className="num"><Amt v={data.totalTurnover} zero /></td>
                          <td className="num">{formatPct(100)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
