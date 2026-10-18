import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, History, Pencil, Plus, Send, Trash2, XCircle, Copy } from 'lucide-react';
import {
  approveSalesTarget,
  deleteSalesTarget,
  getSalesTarget,
  getSalesTargetOptions,
  getSalesTargets,
  rejectSalesTarget,
  reviseSalesTarget,
  submitSalesTarget
} from '../../api/sales';
import type { SalesTarget, SalesTargetDetail, SalesTargetLine, SalesTargetListResponse, SalesTargetOptions, SalesTargetStatus } from '../../types';
import { ErrorState, EmptyState } from '../../components/StateViews';
import { Skeleton } from '../../components/ui/Skeleton';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/Pagination';
import StatCard from '../../components/StatCard';
import { compactInr, formatDate, useChartTheme } from '../../components/sales/salesShared';
import TargetFormModal from '../../components/sales/TargetFormModal';
import ItemPicker from '../../components/sales/ItemPicker';
import { usePermissions } from '../../permissions/usePermissions';

/** Whole rupees with Indian grouping and no decimals (e.g. 42,20,17,421). */
const rupees = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const qty = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
const PAGE_SIZE = 15;
const STATUSES: SalesTargetStatus[] = ['Draft', 'Submitted', 'Approved', 'Rejected', 'Superseded'];

const currentFy = () => {
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};

const statusClass: Record<SalesTargetStatus, string> = {
  Draft: 'badge-neutral',
  Submitted: 'badge-warning',
  Approved: 'badge-success',
  Rejected: 'badge-danger',
  Superseded: 'badge-neutral'
};

function Achievement({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-ink-tertiary">—</span>;
  const tone = pct >= 100 ? 'bg-success' : pct >= 50 ? 'bg-warning' : 'bg-danger';
  const label = pct >= 100 ? 'Achieved' : pct >= 50 ? 'In progress' : 'Below target';
  return (
    <div className="min-w-[8rem]" title={label}>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="font-medium tabular-nums text-ink-primary">{pct.toFixed(1)}%</span>
        <span className="text-ink-tertiary">{label}</span>
      </div>
      <div className="h-2 rounded bg-surface-tertiary overflow-hidden" role="progressbar" aria-valuenow={Math.min(pct, 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded ${tone}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

export default function SalespersonTargets() {
  const { canCreate, canEdit, canDelete, canApprove } = usePermissions();
  const { axisColor, gridColor, cur, prev, tooltipStyle } = useChartTheme();

  const [options, setOptions] = useState<SalesTargetOptions | null>(null);
  const [fy, setFy] = useState(currentFy());
  const [periodType, setPeriodType] = useState('');
  const [unit, setUnit] = useState('');
  const [salesperson, setSalesperson] = useState('');
  const [status, setStatus] = useState('');
  const [item, setItem] = useState<{ code: string; name: string | null } | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [includeTax, setIncludeTax] = useState(false);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);

  const [data, setData] = useState<SalesTargetListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [form, setForm] = useState<{ open: boolean; target: SalesTarget | null; lines: SalesTargetLine[] }>({ open: false, target: null, lines: [] });
  const [review, setReview] = useState<{ target: SalesTarget; mode: 'approve' | 'reject' } | null>(null);
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [detail, setDetail] = useState<SalesTargetDetail | null>(null);

  useEffect(() => {
    getSalesTargetOptions().then(setOptions).catch(() => setOptions({ salespersons: [], units: [], financialYears: [] }));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getSalesTargets({
      financialYear: fy || undefined,
      periodType: periodType || undefined,
      unit: unit ? Number(unit) : undefined,
      salesperson: salesperson ? Number(salesperson) : undefined,
      status: status || undefined,
      item: item?.code,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      search: query || undefined,
      includeTax,
      page,
      pageSize: PAGE_SIZE
    })
      .then(setData)
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load targets.'))
      .finally(() => setLoading(false));
  }, [fy, periodType, unit, salesperson, status, item, fromDate, toDate, query, includeTax, page, reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);
  const reset = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  async function run(target: SalesTarget, action: () => Promise<unknown>, okText: string) {
    setBusyId(target.id);
    setNotice(null);
    try {
      await action();
      setNotice({ type: 'ok', text: okText });
      refresh();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setNotice({ type: 'err', text: e?.response?.data?.message || e?.message || 'The action failed.' });
    } finally {
      setBusyId(null);
    }
  }

  async function submitReview() {
    if (!review) return;
    const { target, mode } = review;
    if (mode === 'reject' && !reviewRemarks.trim()) {
      setNotice({ type: 'err', text: 'Please give a reason when rejecting a target.' });
      return;
    }
    setReview(null);
    await run(
      target,
      () => (mode === 'approve' ? approveSalesTarget(target.id, reviewRemarks.trim() || undefined) : rejectSalesTarget(target.id, reviewRemarks.trim())),
      mode === 'approve' ? 'Target approved.' : 'Target rejected.'
    );
    setReviewRemarks('');
  }

  /** Item rows live in their own table, so editing loads the full target first. */
  async function openEditor(t: SalesTarget | null) {
    if (!t) {
      setForm({ open: true, target: null, lines: [] });
      return;
    }
    try {
      const d = await getSalesTarget(t.id, false);
      setForm({ open: true, target: d.target, lines: d.lines });
    } catch (err) {
      setNotice({ type: 'err', text: (err as Error).message || 'Unable to open the target.' });
    }
  }

  async function openHistory(t: SalesTarget) {
    try {
      setDetail(await getSalesTarget(t.id, includeTax));
    } catch (err) {
      setNotice({ type: 'err', text: (err as Error).message || 'Unable to load the history.' });
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / PAGE_SIZE)) : 1;
  const chart = useMemo(() => (data?.byPerson ?? []).map((p) => ({ name: p.salesperson, target: p.target, actual: p.actual })), [data]);
  const input = 'px-3 py-2 text-sm rounded-lg border border-border-strong bg-surface text-ink-primary min-w-0';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-ink-primary">Salesperson Targets</h1>
          <p className="text-ink-secondary text-sm mt-0.5">
            Targets are planned here; actual sales are live from SAP (invoice lines minus credit memos, {includeTax ? 'incl.' : 'excl.'} tax).
          </p>
        </div>
        {canCreate && (
          <button className="btn-primary" onClick={() => openEditor(null)}>
            <Plus className="h-4 w-4" /> New target
          </button>
        )}
      </div>

      {notice && (
        <div role="status" className={`card !py-3 text-sm ${notice.type === 'ok' ? 'text-success' : 'text-danger'}`}>
          {notice.text}
        </div>
      )}

      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-ink-secondary mb-1" htmlFor="tg-fy">Financial year</label>
          <select id="tg-fy" className={input} value={fy} onChange={(e) => reset(setFy)(e.target.value)}>
            <option value="">All years</option>
            {(options?.financialYears ?? [fy]).map((y) => <option key={y} value={y}>FY {y}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink-secondary mb-1" htmlFor="tg-pt">Period</label>
          <select id="tg-pt" className={input} value={periodType} onChange={(e) => reset(setPeriodType)(e.target.value)}>
            <option value="">All periods</option>
            <option>Monthly</option>
            <option>Quarterly</option>
            <option>Annual</option>
            <option>Custom</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink-secondary mb-1" htmlFor="tg-unit">Unit</label>
          <select id="tg-unit" className={input} value={unit} onChange={(e) => reset(setUnit)(e.target.value)}>
            <option value="">All units</option>
            <option value="-1">Company-wide targets</option>
            {options?.units.map((u) => <option key={u.code} value={u.code}>{u.label || u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink-secondary mb-1" htmlFor="tg-sp">Salesperson</label>
          <select id="tg-sp" className={input} value={salesperson} onChange={(e) => reset(setSalesperson)(e.target.value)}>
            <option value="">All salespersons</option>
            {options?.salespersons.map((s) => <option key={s.code} value={s.code}>{s.name}{s.active ? '' : ' (inactive)'}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink-secondary mb-1" htmlFor="tg-st">Status</label>
          <select id="tg-st" className={input} value={status} onChange={(e) => reset(setStatus)(e.target.value)}>
            <option value="">Current (all except superseded)</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="min-w-[14rem]">
          <label className="block text-xs text-ink-secondary mb-1">Item</label>
          <ItemPicker ariaLabel="Filter by item" placeholder="All items" value={item} onSelect={(it) => { setItem({ code: it.code, name: it.name }); setPage(1); }} onClear={() => { setItem(null); setPage(1); }} />
        </div>
        <div>
          <label className="block text-xs text-ink-secondary mb-1" htmlFor="tg-from">Target from</label>
          <input id="tg-from" type="date" className={input} value={fromDate} max={toDate || undefined} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="block text-xs text-ink-secondary mb-1" htmlFor="tg-to">Target to</label>
          <input id="tg-to" type="date" className={input} value={toDate} min={fromDate || undefined} onChange={(e) => { setToDate(e.target.value); setPage(1); }} />
        </div>
        <div className="grow min-w-[10rem]">
          <label className="block text-xs text-ink-secondary mb-1" htmlFor="tg-q">Search</label>
          <input id="tg-q" className={`${input} w-full`} placeholder="Name, code, item or target ID" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-ink-primary pb-2 cursor-pointer select-none">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={includeTax} onChange={(e) => { setIncludeTax(e.target.checked); setPage(1); }} />
          Include tax
        </label>
      </div>

      {error ? (
        <div className="card"><ErrorState message={error} onRetry={refresh} /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
            {loading || !data ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
            ) : (
              <>
                <StatCard label="Total Assigned Target" value={`₹ ${rupees.format(data.summary.totalTarget)}`} hint="Approved targets" accent="blue" />
                <StatCard label="Total Actual Sales" value={`₹ ${rupees.format(data.summary.totalActual)}`} hint="Same period & units" accent="slate" />
                <StatCard label="Overall Achievement" value={data.summary.overallAchievementPct === null ? '—' : `${data.summary.overallAchievementPct.toFixed(1)}%`} hint="Actual ÷ target" accent="blue" />
                <StatCard label="Salespersons with Targets" value={String(data.summary.salespersonsWithTargets)} hint="Approved" accent="slate" />
                <StatCard label="Pending Approval" value={String(data.summary.pendingApproval)} hint="Submitted" accent="amber" />
              </>
            )}
          </div>

          <div className="card">
            <h3 className="font-semibold text-ink-primary">Target vs Actual by Salesperson</h3>
            <p className="text-xs text-ink-tertiary mb-2">Approved targets in the current selection</p>
            {loading || !data ? (
              <Skeleton className="h-[240px] w-full" />
            ) : chart.length === 0 ? (
              <p className="text-sm text-ink-tertiary py-8 text-center">No approved targets for this selection yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, chart.length * 54 + 50)}>
                <BarChart data={chart} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: axisColor }} tickFormatter={compactInr} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: axisColor }} tickFormatter={(n: string) => (n.length > 18 ? `${n.slice(0, 17)}…` : n)} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: axisColor }} formatter={(v: number) => `₹ ${rupees.format(v)}`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="target" name="Target" fill={prev} radius={[0, 4, 4, 0]} maxBarSize={16} />
                  <Bar dataKey="actual" name="Actual" fill={cur} radius={[0, 4, 4, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink-tertiary border-b border-border">
                    <th className="px-4 py-2.5 font-medium">Salesperson</th>
                    <th className="px-4 py-2.5 font-medium">Unit</th>
                    <th className="px-4 py-2.5 font-medium">Period</th>
                    <th className="px-4 py-2.5 font-medium text-right">Items</th>
                    <th className="px-4 py-2.5 font-medium text-right">Target</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actual Sales</th>
                    <th className="px-4 py-2.5 font-medium">Achievement</th>
                    <th className="px-4 py-2.5 font-medium text-right">Variance</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading || !data ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-b border-border last:border-0"><td colSpan={10} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td></tr>
                    ))
                  ) : data.rows.length === 0 ? (
                    <tr><td colSpan={10}><EmptyState message="No targets match the selection." description={canCreate ? 'Use “New target” to assign one.' : undefined} /></td></tr>
                  ) : (
                    data.rows.map((t) => (
                      <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface-tertiary/60 align-top">
                        <td className="px-4 py-3">
                          <div className="text-ink-primary font-medium">{t.salespersonName}</div>
                          <div className="text-xs text-ink-tertiary">SAP #{t.sapSlpCode} · target #{t.id}{t.revisionOfId ? ` · revises #${t.revisionOfId}` : ''}</div>
                        </td>
                        <td className="px-4 py-3">{t.unitName}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div>{t.periodType}</div>
                          <div className="text-xs text-ink-tertiary">{formatDate(t.periodStart)} – {formatDate(t.periodEnd)}</div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{t.hasItems ? (<>{t.itemCount}<div className="text-xs text-ink-tertiary">qty {qty.format(t.totalTargetQuantity)}</div></>) : <span className="text-ink-tertiary">—</span>}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{rupees.format(t.targetAmount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{rupees.format(t.actualSales)}
                          <div className="text-xs text-ink-tertiary">{t.salesOrders} orders · {t.arInvoices} invoices</div>
                        </td>
                        <td className="px-4 py-3"><Achievement pct={t.achievementPct} /></td>
                        <td className={`px-4 py-3 text-right tabular-nums ${t.variance >= 0 ? 'text-success' : 'text-danger'}`}>
                          {t.variance >= 0 ? '+' : '−'}{rupees.format(Math.abs(t.variance))}
                        </td>
                        <td className="px-4 py-3">
                          <span className={statusClass[t.status]}>{t.status}</span>
                          {t.status === 'Rejected' && t.reviewRemarks && <div className="text-xs text-danger mt-1 max-w-[14rem]">{t.reviewRemarks}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1 flex-wrap">
                            {canEdit && (t.status === 'Draft' || t.status === 'Rejected') && (
                              <>
                                <button className="btn-secondary !px-2 !py-1" title="Edit" disabled={busyId === t.id} onClick={() => openEditor(t)}><Pencil className="h-3.5 w-3.5" /></button>
                                <button className="btn-secondary !px-2 !py-1" title="Submit for approval" disabled={busyId === t.id || t.status === 'Rejected'} onClick={() => run(t, () => submitSalesTarget(t.id), 'Target submitted for approval.')}><Send className="h-3.5 w-3.5" /></button>
                              </>
                            )}
                            {canDelete && t.status === 'Draft' && (
                              <button className="btn-secondary !px-2 !py-1" title="Delete draft" disabled={busyId === t.id} onClick={() => { if (window.confirm('Delete this draft target?')) run(t, () => deleteSalesTarget(t.id), 'Draft deleted.'); }}><Trash2 className="h-3.5 w-3.5" /></button>
                            )}
                            {canApprove && t.status === 'Submitted' && (
                              <>
                                <button className="btn-secondary !px-2 !py-1 text-success" title="Approve" disabled={busyId === t.id} onClick={() => { setReviewRemarks(''); setReview({ target: t, mode: 'approve' }); }}><CheckCircle2 className="h-3.5 w-3.5" /></button>
                                <button className="btn-secondary !px-2 !py-1 text-danger" title="Reject" disabled={busyId === t.id} onClick={() => { setReviewRemarks(''); setReview({ target: t, mode: 'reject' }); }}><XCircle className="h-3.5 w-3.5" /></button>
                              </>
                            )}
                            {canCreate && t.status === 'Approved' && (
                              <button className="btn-secondary !px-2 !py-1" title="Revise (creates a new draft)" disabled={busyId === t.id} onClick={() => run(t, () => reviseSalesTarget(t.id), 'Revision draft created — edit and submit it for approval.')}><Copy className="h-3.5 w-3.5" /></button>
                            )}
                            <button className="btn-secondary !px-2 !py-1" title="History" onClick={() => openHistory(t)}><History className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {data && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}
          </div>
        </>
      )}

      <TargetFormModal
        open={form.open}
        target={form.target}
        targetLines={form.lines}
        options={options}
        defaultFinancialYear={fy || currentFy()}
        onClose={() => setForm({ open: false, target: null, lines: [] })}
        onSaved={(text) => {
          setForm({ open: false, target: null, lines: [] });
          setNotice({ type: 'ok', text });
          refresh();
        }}
      />

      <Modal open={!!review} onClose={() => setReview(null)} labelledBy="tg-review-title">
        {review && (
          <div className="p-5 space-y-3 w-full max-w-md">
            <h2 id="tg-review-title" className="text-lg font-semibold text-ink-primary">
              {review.mode === 'approve' ? 'Approve target' : 'Reject target'}
            </h2>
            <p className="text-sm text-ink-secondary">
              {review.target.salespersonName} · {review.target.unitName} · ₹ {rupees.format(review.target.targetAmount)} · {review.target.periodType}
            </p>
            <label className="block text-xs text-ink-secondary" htmlFor="tg-rv">
              {review.mode === 'approve' ? 'Remarks (optional)' : 'Reason for rejection (required)'}
            </label>
            <textarea id="tg-rv" rows={3} maxLength={500} className="w-full px-3 py-2 text-sm rounded-lg border border-border-strong bg-surface text-ink-primary" value={reviewRemarks} onChange={(e) => setReviewRemarks(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setReview(null)}>Cancel</button>
              <button className="btn-primary" onClick={submitReview}>{review.mode === 'approve' ? 'Approve' : 'Reject'}</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} labelledBy="tg-detail-title">
        {detail && (
          <div className="p-5 space-y-4 w-full max-w-4xl">
            <h2 id="tg-detail-title" className="text-lg font-semibold text-ink-primary">
              Target #{detail.target.id} · {detail.target.salespersonName}
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-ink-tertiary">Unit</dt><dd>{detail.target.unitName}</dd>
              <dt className="text-ink-tertiary">Period</dt><dd>{detail.target.periodType} · {formatDate(detail.target.periodStart)} – {formatDate(detail.target.periodEnd)}</dd>
              <dt className="text-ink-tertiary">Target</dt><dd className="tabular-nums">₹ {rupees.format(detail.target.targetAmount)}</dd>
              <dt className="text-ink-tertiary">Actual sales</dt><dd className="tabular-nums">₹ {rupees.format(detail.target.actualSales)}</dd>
              <dt className="text-ink-tertiary">Remaining</dt><dd className="tabular-nums">₹ {rupees.format(detail.target.remainingTarget)}</dd>
              <dt className="text-ink-tertiary">Sales orders / A/R invoices</dt><dd>{detail.target.salesOrders} / {detail.target.arInvoices}</dd>
              <dt className="text-ink-tertiary">Status</dt><dd>{detail.target.status}</dd>
              <dt className="text-ink-tertiary">Created</dt><dd>{detail.target.createdBy} · {formatDate(detail.target.createdAt)}</dd>
              {detail.target.approvedBy && (<><dt className="text-ink-tertiary">Approved</dt><dd>{detail.target.approvedBy} · {formatDate(detail.target.approvedAt)}</dd></>)}
              {detail.target.remarks && (<><dt className="text-ink-tertiary">Remarks</dt><dd>{detail.target.remarks}</dd></>)}
            </dl>
            {detail.lines.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-ink-primary mb-2">Item-wise targets vs actual ({detail.lines.length})</h3>
                <div className="overflow-x-auto border border-border rounded-lg">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-ink-tertiary border-b border-border">
                        <th className="px-3 py-2 font-medium">Item</th>
                        <th className="px-3 py-2 font-medium">UOM</th>
                        <th className="px-3 py-2 font-medium text-right">Target qty</th>
                        <th className="px-3 py-2 font-medium text-right">Actual qty</th>
                        <th className="px-3 py-2 font-medium text-right">Target amount</th>
                        <th className="px-3 py-2 font-medium text-right">Actual amount</th>
                        <th className="px-3 py-2 font-medium">Achievement</th>
                        <th className="px-3 py-2 font-medium text-right">Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lines.map((l) => (
                        <tr key={l.id} className="border-b border-border last:border-0 align-top">
                          <td className="px-3 py-2"><div className="font-medium text-ink-primary">{l.itemCode}</div><div className="text-xs text-ink-tertiary">{[l.itemName, l.itemGroup].filter(Boolean).join(' · ')}</div></td>
                          <td className="px-3 py-2">{l.uom ?? '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{qty.format(l.targetQuantity)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{qty.format(l.actualQuantity)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{rupees.format(l.targetAmount)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{rupees.format(l.actualAmount)}</td>
                          <td className="px-3 py-2"><Achievement pct={l.achievementPct} /></td>
                          <td className="px-3 py-2 text-right tabular-nums">{rupees.format(l.remainingAmount)}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold bg-surface-tertiary/60">
                        <td className="px-3 py-2" colSpan={2}>Total</td>
                        <td className="px-3 py-2 text-right tabular-nums">{qty.format(detail.lines.reduce((a, l) => a + l.targetQuantity, 0))}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{qty.format(detail.lines.reduce((a, l) => a + l.actualQuantity, 0))}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{rupees.format(detail.lines.reduce((a, l) => a + l.targetAmount, 0))}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{rupees.format(detail.lines.reduce((a, l) => a + l.actualAmount, 0))}</td>
                        <td colSpan={2} />
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-ink-tertiary mt-1">Actual = SAP invoice lines minus credit-memo lines for this salesperson and unit within the period (quantities in the item's sales UOM as invoiced).</p>
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold text-ink-primary mb-2">Audit trail</h3>
              <ul className="space-y-1.5 text-sm max-h-60 overflow-auto">
                {detail.history.map((h) => (
                  <li key={h.id} className="flex flex-wrap gap-x-2">
                    <span className="text-ink-tertiary tabular-nums">{new Date(h.performedAt).toLocaleString('en-IN')}</span>
                    <span className="font-medium text-ink-primary">{h.action}</span>
                    <span className="text-ink-secondary">by {h.performedBy}</span>
                    {h.detail && <span className="text-ink-tertiary">— {h.detail}</span>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end"><button className="btn-secondary" onClick={() => setDetail(null)}>Close</button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
