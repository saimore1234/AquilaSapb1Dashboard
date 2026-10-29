import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, Pencil, Plus, Send, Trash2, XCircle, Copy } from 'lucide-react';
import {
  approveSalesTarget,
  createSalesTarget,
  deleteSalesTarget,
  getSalesTargetOptions,
  getSalesTargets,
  getTargetPerformance,
  rejectSalesTarget,
  reviseSalesTarget,
  submitSalesTarget,
  updateSalesTarget
} from '../../api/sales';
import type {
  PeriodPerformance,
  SalesTarget,
  SalesTargetListResponse,
  SalesTargetOptions,
  SalesTargetPeriodType,
  SalesTargetScope,
  SalesTargetStatus,
  TargetPerformance
} from '../../types';
import { EmptyState, ErrorState } from '../../components/StateViews';
import { Skeleton } from '../../components/ui/Skeleton';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/Pagination';
import StatCard from '../../components/StatCard';
import { compactInr, useChartTheme } from '../../components/sales/salesShared';
import { amountTone, formatInr, formatLongDate, formatPct } from '../../components/sales/formatters';
import { useAuth } from '../../context/AuthContext';

const PAGE_SIZE = 15;
const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
const QUARTERS = ['Q1 (Apr–Jun)', 'Q2 (Jul–Sep)', 'Q3 (Oct–Dec)', 'Q4 (Jan–Mar)'];
const STATUSES: SalesTargetStatus[] = ['Draft', 'Submitted', 'Approved', 'Rejected', 'Superseded'];
const SCOPES: { key: SalesTargetScope; label: string }[] = [
  { key: 'Company', label: 'Company' },
  { key: 'Unit', label: 'Unit-wise' },
  { key: 'Salesperson', label: 'Salesperson-wise' }
];
const statusClass: Record<SalesTargetStatus, string> = {
  Draft: 'badge-neutral', Submitted: 'badge-warning', Approved: 'badge-success', Rejected: 'badge-danger', Superseded: 'badge-neutral'
};

const currentFy = () => {
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};
const periodChoices = (t: SalesTargetPeriodType) =>
  t === 'Monthly' ? MONTHS.map((m, i) => ({ value: i + 1, label: m })) : t === 'Quarterly' ? QUARTERS.map((q, i) => ({ value: i + 1, label: q })) : [{ value: 1, label: 'Full financial year' }];
function indexFromStart(startIso: string, type: SalesTargetPeriodType) {
  const fyMonth = (new Date(startIso).getMonth() + 9) % 12;
  return type === 'Monthly' ? fyMonth + 1 : type === 'Quarterly' ? Math.floor(fyMonth / 3) + 1 : 1;
}

/** Achievement, remaining and variance for one period, or "Not configured" when no approved target of that period exists. */
function PeriodRow({ p }: { p: PeriodPerformance }) {
  return (
    <tr>
      <td className="whitespace-nowrap">{p.label}</td>
      <td className="num">{formatInr(p.actual)}</td>
      <td className="num">{p.target === null ? <span className="text-ink-tertiary">Not configured</span> : formatInr(p.target)}</td>
      <td className="num">{p.achievementPct === null ? '–' : formatPct(p.achievementPct)}</td>
      <td className="num">{p.remaining === null ? '–' : formatInr(p.remaining)}</td>
      <td className="num">{p.variance === null ? '–' : <span className={amountTone(p.variance, { zero: true })}>{formatInr(p.variance)}</span>}</td>
    </tr>
  );
}

export default function TargetManagement() {
  // The API enforces the Sales > Targets permissions, so this page uses the same ones (no separate role grant needed).
  const { hasPermission, salesScope } = useAuth();
  const readOnly = !!salesScope?.ownTargetsOnly; // salesperson logins work on their own item-wise targets only; company/unit targets and approvals are not theirs
  const canCreate = !readOnly && hasPermission('Sales', 'targets', 'Create');
  const canEdit = !readOnly && hasPermission('Sales', 'targets', 'Edit');
  const canDelete = !readOnly && hasPermission('Sales', 'targets', 'Delete');
  const canApprove = !readOnly && hasPermission('Sales', 'targets', 'Approve');
  const { axisColor, gridColor, cur, prev, tooltipStyle } = useChartTheme();

  const [options, setOptions] = useState<SalesTargetOptions | null>(null);
  const [scope, setScope] = useState<SalesTargetScope>('Company');
  const [fy, setFy] = useState(currentFy());
  const [unit, setUnit] = useState('');
  const [salesperson, setSalesperson] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);

  const [list, setList] = useState<SalesTargetListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [perf, setPerf] = useState<TargetPerformance | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfError, setPerfError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [form, setForm] = useState<{ open: boolean; target: SalesTarget | null }>({ open: false, target: null });
  const [review, setReview] = useState<{ target: SalesTarget; mode: 'approve' | 'reject' } | null>(null);
  const [reviewRemarks, setReviewRemarks] = useState('');

  useEffect(() => { getSalesTargetOptions().then(setOptions).catch(() => setOptions({ salespersons: [], units: [], financialYears: [] })); }, []);

  // Reset what does not apply when the scope changes, so no stale selection leaks between tabs.
  const changeScope = (s: SalesTargetScope) => { setScope(s); setUnit(''); setSalesperson(''); setStatus(''); setPage(1); setNotice(null); };

  useEffect(() => {
    let live = true;
    setLoading(true); setError(null);
    getSalesTargets({ scope, financialYear: fy || undefined, unit: unit ? Number(unit) : undefined, salesperson: salesperson ? Number(salesperson) : undefined, status: status || undefined, page, pageSize: PAGE_SIZE })
      .then((d) => { if (live) setList(d); })
      .catch((err) => { if (live) setError(err?.response?.data?.message || err.message || 'Unable to load targets.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [scope, fy, unit, salesperson, status, page, reload]);

  const needsEntity = (scope === 'Unit' && !unit) || (scope === 'Salesperson' && !salesperson);
  useEffect(() => {
    if (needsEntity) { setPerf(null); setPerfError(null); return; }
    let live = true;
    setPerfLoading(true); setPerfError(null);
    getTargetPerformance({ scope, financialYear: fy, unit: unit ? Number(unit) : undefined, salesperson: salesperson ? Number(salesperson) : undefined })
      .then((d) => { if (live) setPerf(d); })
      .catch((err) => { if (live) setPerfError(err?.response?.data?.message || err.message || 'Unable to load target performance.'); })
      .finally(() => { if (live) setPerfLoading(false); });
    return () => { live = false; };
  }, [scope, fy, unit, salesperson, needsEntity, reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);
  const done = (text: string) => { setNotice({ type: 'ok', text }); refresh(); };
  const fail = (e: unknown) => setNotice({ type: 'err', text: (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message || (e as Error)?.message || 'Request failed.' });

  async function act(t: SalesTarget, fn: () => Promise<unknown>, ok: string) {
    setBusyId(t.id); setNotice(null);
    try { await fn(); done(ok); } catch (e) { fail(e); } finally { setBusyId(null); }
  }
  async function submitReview() {
    if (!review) return;
    if (review.mode === 'reject' && !reviewRemarks.trim()) { setNotice({ type: 'err', text: 'Please give a reason when rejecting a target.' }); return; }
    const t = review.target;
    setBusyId(t.id);
    try {
      if (review.mode === 'approve') await approveSalesTarget(t.id, reviewRemarks.trim() || undefined); else await rejectSalesTarget(t.id, reviewRemarks.trim());
      setReview(null); setReviewRemarks(''); done(review.mode === 'approve' ? 'Target approved.' : 'Target rejected.');
    } catch (e) { fail(e); } finally { setBusyId(null); }
  }

  const fyOptions = options?.financialYears?.length ? options.financialYears : [currentFy()];
  const s = list?.summary;
  const chart = useMemo(() => (perf?.months ?? []).map((m) => ({ name: m.label.slice(0, 3), Actual: m.actual, Target: m.target ?? undefined })), [perf]);
  const anyMonthlyTarget = (perf?.months ?? []).some((m) => m.target !== null);
  const input = 'ctl';

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink-primary leading-tight">Target Management</h1>
          <p className="text-sm text-ink-secondary mt-0.5">Company, unit and salesperson targets with approval · actuals live from SAP Business One (net of credit notes, excluding tax)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/sales" className="btn-secondary btn-compact">Sales Dashboard</Link>
          {scope === 'Salesperson' ? (
            <>
              {canCreate && <Link to="/sales/targets" className="btn-primary btn-compact"><Plus className="h-4 w-4" /> New salesperson target</Link>}
              <Link to="/sales/targets" className="btn-secondary btn-compact">Salesperson Targets (item-wise)</Link>
            </>
          ) : canCreate && (
            <button className="btn-primary btn-compact" onClick={() => setForm({ open: true, target: null })}><Plus className="h-4 w-4" /> New {scope === 'Company' ? 'company' : 'unit'} target</button>
          )}
        </div>
      </header>

      <div className="panel px-3 py-2.5 flex flex-wrap items-end gap-3">
        <div role="tablist" aria-label="Target scope" className="inline-flex rounded-md border border-border overflow-hidden">
          {SCOPES.map((x) => (
            <button key={x.key} role="tab" aria-selected={scope === x.key} onClick={() => changeScope(x.key)}
              className={`px-3 py-1.5 text-sm font-medium ${scope === x.key ? 'bg-brand-600 text-white' : 'bg-surface text-ink-primary hover:bg-surface-tertiary'}`}>{x.label}</button>
          ))}
        </div>
        <div>
          <label className="ctl-label" htmlFor="tm-fy">Financial year</label>
          <select id="tm-fy" className={`${input} w-32`} value={fy} onChange={(e) => { setFy(e.target.value); setPage(1); }}>{fyOptions.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        </div>
        {scope !== 'Company' && (
          <div>
            <label className="ctl-label" htmlFor="tm-unit">Unit</label>
            <select id="tm-unit" className={`${input} w-52`} value={unit} onChange={(e) => { setUnit(e.target.value); setPage(1); }}>
              <option value="">{scope === 'Unit' ? 'Select a unit…' : 'All units'}</option>
              {(options?.units ?? []).map((u) => <option key={u.code} value={u.code}>{u.label ?? u.name}</option>)}
            </select>
          </div>
        )}
        {scope === 'Salesperson' && (
          <div>
            <label className="ctl-label" htmlFor="tm-slp">Salesperson</label>
            <select id="tm-slp" className={`${input} w-56`} value={salesperson} onChange={(e) => { setSalesperson(e.target.value); setPage(1); }}>
              <option value="">Select a salesperson…</option>
              {(options?.salespersons ?? []).filter((p) => p.active || String(p.code) === salesperson).map((p) => <option key={p.code} value={p.code}>{p.name}{p.active ? '' : ' (inactive)'}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="ctl-label" htmlFor="tm-st">Status</label>
          <select id="tm-st" className={`${input} w-36`} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Current</option>{STATUSES.map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
      </div>

      {notice && <div role={notice.type === 'err' ? 'alert' : 'status'} className={`panel px-3 py-2 text-sm ${notice.type === 'err' ? 'border-danger text-danger' : 'border-success text-success'}`}>{notice.text}</div>}

      {/* Summary: approved targets of this scope only — never mixed across scopes, so nothing is double counted. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-stretch">
        <StatCard variant="compact" label="Approved target" value={s ? formatInr(s.totalTarget) : '…'} hint={`${SCOPES.find((x) => x.key === scope)?.label} · FY ${fy}`} basis="Approved only" />
        <StatCard variant="compact" label="Actual (same periods)" value={s ? formatInr(s.totalActual) : '…'} hint="Net of credit notes, excl. tax" basis="Live from SAP" />
        <StatCard variant="compact" label="Achievement" value={s ? (s.overallAchievementPct === null ? 'Not configured' : formatPct(s.overallAchievementPct)) : '…'} hint="Actual ÷ approved target" basis="Official (approved)" />
        <StatCard variant="compact" label="Pending approval" value={s ? String(s.pendingApproval) : '…'} hint="Submitted, awaiting a decision" basis="Current position" />
      </div>

      {/* Actual vs target for the selected company / unit / salesperson */}
      <section className="panel p-4 space-y-3" aria-label="Target versus actual">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink-primary">Target vs actual {perf ? <span className="font-normal text-ink-secondary">· {perf.entityLabel} · FY {perf.financialYear}</span> : null}</h2>
        </div>
        {needsEntity ? (
          <p className="text-sm text-ink-tertiary py-4 text-center">Select a {scope === 'Unit' ? 'unit' : 'salesperson'} above to see its monthly, quarterly and annual target against actual sales.</p>
        ) : perfError ? (
          <ErrorState message={perfError} onRetry={refresh} />
        ) : perfLoading || !perf ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 text-sm">
              {[
                ['Actual (FY)', formatInr(perf.year.actual), undefined],
                ['Annual target', perf.year.target === null ? 'Not configured' : formatInr(perf.year.target), perf.year.target === null ? 'text-ink-tertiary' : undefined],
                ['Achievement', perf.year.achievementPct === null ? '–' : formatPct(perf.year.achievementPct), undefined],
                ['Remaining', perf.year.remaining === null ? '–' : formatInr(perf.year.remaining), undefined],
                ['Variance', perf.year.variance === null ? '–' : formatInr(perf.year.variance), perf.year.variance === null ? undefined : amountTone(perf.year.variance, { zero: true })]
              ].map(([l, v, tone]) => (
                <div key={l as string} className="rounded-md border border-border px-3 py-2"><p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">{l}</p><p className={`text-base font-semibold tabular-nums ${tone ?? 'text-ink-primary'}`}>{v}</p></div>
              ))}
            </div>
            <div className="h-64 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" stroke={axisColor} tick={{ fontSize: 11 }} />
                  <YAxis stroke={axisColor} tick={{ fontSize: 11 }} tickFormatter={compactInr} width={56} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatInr(v)} />
                  <Legend />
                  <Bar dataKey="Actual" fill={cur} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="Target" fill={prev} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {!anyMonthlyTarget && <p className="text-xs text-ink-tertiary -mt-1">No approved monthly targets for this selection, so the chart shows actual sales only.</p>}
            <div className="sheet-wrap">
              <table className="sheet" aria-label="Target versus actual by period">
                <thead><tr><th>Period</th><th className="num">Actual</th><th className="num">Approved target</th><th className="num">Achievement</th><th className="num">Remaining</th><th className="num">Variance</th></tr></thead>
                <tbody>
                  {perf.quarters.map((p) => <PeriodRow key={p.label} p={p} />)}
                  {perf.months.map((p) => <PeriodRow key={p.label} p={p} />)}
                </tbody>
                <tfoot><tr><td colSpan={6} className="text-xs font-normal text-ink-tertiary">{perf.note}</td></tr></tfoot>
              </table>
            </div>
          </>
        )}
      </section>

      {/* Listing */}
      <section className="panel p-0 overflow-hidden" aria-label="Targets">
        <div className="sheet-wrap border-0 rounded-none">
          <table className="sheet" aria-label="Targets">
            <thead>
              <tr><th>{scope === 'Salesperson' ? 'Salesperson' : scope === 'Unit' ? 'Unit' : 'Scope'}</th><th>Period</th><th>Dates</th><th className="num">Target</th><th className="num">Actual</th><th className="num">Achievement</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {error ? (
                <tr><td colSpan={8}><ErrorState message={error} onRetry={refresh} /></td></tr>
              ) : loading || !list ? (
                Array.from({ length: 4 }).map((_, i) => <tr key={i}><td colSpan={8}><Skeleton className="h-4 w-full" /></td></tr>)
              ) : list.rows.length === 0 ? (
                <tr><td colSpan={8}><EmptyState message="No targets for this selection." description={scope !== 'Salesperson' && canCreate ? 'Use “New target” to set one.' : undefined} /></td></tr>
              ) : list.rows.map((t) => (
                <tr key={t.id}>
                  <td className="whitespace-nowrap"><div className="text-ink-primary">{t.salespersonName}</div>{scope === 'Salesperson' && <div className="text-xs text-ink-tertiary">{t.unitName}</div>}</td>
                  <td>{t.periodType}</td>
                  <td className="whitespace-nowrap text-xs">{formatLongDate(t.periodStart.slice(0, 10))} – {formatLongDate(t.periodEnd.slice(0, 10))}</td>
                  <td className="num">{formatInr(t.targetAmount)}</td>
                  <td className="num">{formatInr(t.actualSales)}</td>
                  <td className="num">{t.status === 'Approved' ? (t.achievementPct === null ? '–' : formatPct(t.achievementPct)) : <span className="text-ink-tertiary" title="Only approved targets count towards achievement">not official</span>}</td>
                  <td><span className={statusClass[t.status]}>{t.status === 'Submitted' ? 'Pending approval' : t.status}</span>{t.status === 'Rejected' && t.reviewRemarks && <div className="text-xs text-ink-tertiary max-w-[14rem] truncate" title={t.reviewRemarks}>{t.reviewRemarks}</div>}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {canEdit && (t.status === 'Draft' || t.status === 'Rejected') && scope !== 'Salesperson' && (
                        <button className="btn-secondary btn-compact" title="Edit" disabled={busyId === t.id} onClick={() => setForm({ open: true, target: t })}><Pencil className="h-4 w-4" /></button>)}
                      {canEdit && t.status === 'Draft' && (
                        <button className="btn-secondary btn-compact" title="Submit for approval" disabled={busyId === t.id} onClick={() => act(t, () => submitSalesTarget(t.id), 'Submitted for approval.')}><Send className="h-4 w-4" /></button>)}
                      {canApprove && t.status === 'Submitted' && (<>
                        <button className="btn-secondary btn-compact" title="Approve" disabled={busyId === t.id} onClick={() => { setReview({ target: t, mode: 'approve' }); setReviewRemarks(''); }}><CheckCircle2 className="h-4 w-4" /></button>
                        <button className="btn-secondary btn-compact" title="Reject" disabled={busyId === t.id} onClick={() => { setReview({ target: t, mode: 'reject' }); setReviewRemarks(''); }}><XCircle className="h-4 w-4" /></button></>)}
                      {canCreate && t.status === 'Approved' && (
                        <button className="btn-secondary btn-compact" title="Revise (creates a draft; the approved target stays live until the revision is approved)" disabled={busyId === t.id} onClick={() => act(t, () => reviseSalesTarget(t.id), 'Revision draft created.')}><Copy className="h-4 w-4" /></button>)}
                      {canDelete && t.status === 'Draft' && (
                        <button className="btn-secondary btn-compact" title="Delete draft" disabled={busyId === t.id} onClick={() => { if (window.confirm('Delete this draft target?')) act(t, () => deleteSalesTarget(t.id), 'Draft deleted.'); }}><Trash2 className="h-4 w-4" /></button>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list && list.totalCount > PAGE_SIZE && <Pagination page={page} totalPages={Math.max(1, Math.ceil(list.totalCount / PAGE_SIZE))} onPageChange={setPage} />}
      </section>
      <p className="text-xs text-ink-tertiary">
        Company, unit and salesperson targets are separate levels and are never added together: the Sales Dashboard compares one level at a time (salesperson → that person's targets; a unit → its own target, else its salespersons' targets; all units → the company target, else the unit targets).
        Customer-wise targets are not available yet; item-wise targets are set per salesperson in <Link className="underline" to="/sales/targets">Salesperson Targets</Link>.
      </p>

      <ScopedTargetForm open={form.open} scope={scope} target={form.target} options={options} defaultFy={fy} defaultUnit={unit}
        onClose={() => setForm({ open: false, target: null })} onSaved={(m) => { setForm({ open: false, target: null }); done(m); }} />

      <Modal open={!!review} onClose={() => setReview(null)} variant="sheet" labelledBy="rv-h">
        {review && (
          <div className="p-5 space-y-3">
            <h2 id="rv-h" className="text-base font-semibold text-ink-primary">{review.mode === 'approve' ? 'Approve target' : 'Reject target'}</h2>
            <p className="text-sm text-ink-secondary">{review.target.salespersonName} · {review.target.periodType} · {formatInr(review.target.targetAmount)}</p>
            <label className="ctl-label" htmlFor="rv-r">{review.mode === 'approve' ? 'Remarks (optional)' : 'Reason (required)'}</label>
            <textarea id="rv-r" className="ctl w-full" rows={3} maxLength={500} value={reviewRemarks} onChange={(e) => setReviewRemarks(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setReview(null)}>Cancel</button>
              <button className="btn-primary" disabled={busyId === review.target.id} onClick={submitReview}>{review.mode === 'approve' ? 'Approve' : 'Reject'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Company / unit target form: financial year + period + amount. The server derives the dates and validates everything again. */
function ScopedTargetForm({ open, scope, target, options, defaultFy, defaultUnit, onClose, onSaved }: {
  open: boolean; scope: SalesTargetScope; target: SalesTarget | null; options: SalesTargetOptions | null; defaultFy: string; defaultUnit: string;
  onClose: () => void; onSaved: (message: string) => void;
}) {
  const [fy, setFy] = useState(defaultFy);
  const [type, setType] = useState<SalesTargetPeriodType>('Monthly');
  const [index, setIndex] = useState(1);
  const [unit, setUnit] = useState('');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (target) {
      setFy(target.financialYear); setType(target.periodType === 'Custom' ? 'Monthly' : target.periodType);
      setIndex(target.periodType === 'Custom' ? 1 : indexFromStart(target.periodStart, target.periodType));
      setUnit(String(target.unitCode)); setAmount(String(Math.round(target.targetAmount))); setRemarks(target.remarks ?? '');
    } else { setFy(defaultFy); setType('Monthly'); setIndex(1); setUnit(defaultUnit); setAmount(''); setRemarks(''); }
  }, [open, target, defaultFy, defaultUnit]);

  async function save(submit: boolean) {
    const n = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) { setError('Enter a target amount greater than zero.'); return; }
    if (n !== Math.trunc(n)) { setError('The amount must be a whole number of rupees.'); return; }
    if (scope === 'Unit' && !unit) { setError('Select a unit.'); return; }
    setBusy(true); setError(null);
    try {
      const body = { scope, sapSlpCode: 0, unitCode: scope === 'Company' ? -1 : Number(unit), financialYear: fy, periodType: type, periodIndex: index, targetAmount: n, remarks: remarks.trim() || undefined };
      const id = target ? await updateSalesTarget(target.id, body) : await createSalesTarget(body);
      if (submit) await submitSalesTarget(id);
      onSaved(submit ? 'Saved and submitted for approval.' : 'Draft saved.');
    } catch (e) {
      setError((e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message || (e as Error)?.message || 'Unable to save the target.');
    } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} variant="sheet" labelledBy="tf-h">
      <div className="p-5 space-y-3">
        <h2 id="tf-h" className="text-base font-semibold text-ink-primary">{target ? 'Edit' : 'New'} {scope === 'Company' ? 'company' : 'unit'} target</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="ctl-label" htmlFor="tf-fy">Financial year</label>
            <select id="tf-fy" className="ctl w-full" value={fy} onChange={(e) => setFy(e.target.value)}>{(options?.financialYears ?? [defaultFy]).map((y) => <option key={y}>{y}</option>)}</select></div>
          {scope === 'Unit' && (
            <div><label className="ctl-label" htmlFor="tf-unit">Unit</label>
              <select id="tf-unit" className="ctl w-full" value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="">Select…</option>{(options?.units ?? []).map((u) => <option key={u.code} value={u.code}>{u.label ?? u.name}</option>)}</select></div>
          )}
          <div><label className="ctl-label" htmlFor="tf-type">Period type</label>
            <select id="tf-type" className="ctl w-full" value={type} onChange={(e) => { setType(e.target.value as SalesTargetPeriodType); setIndex(1); }}>
              <option>Monthly</option><option>Quarterly</option><option>Annual</option></select></div>
          <div><label className="ctl-label" htmlFor="tf-idx">Period</label>
            <select id="tf-idx" className="ctl w-full" value={index} onChange={(e) => setIndex(Number(e.target.value))}>{periodChoices(type).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
          <div className="col-span-2"><label className="ctl-label" htmlFor="tf-amt">Target amount (₹, excluding tax)</label>
            <input id="tf-amt" className="ctl w-full" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ''))} placeholder="e.g. 500000000" /></div>
          <div className="col-span-2"><label className="ctl-label" htmlFor="tf-rem">Remarks</label>
            <input id="tf-rem" className="ctl w-full" maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
        </div>
        <p className="text-xs text-ink-tertiary">Saved as a draft. It counts towards achievement only after it is submitted and approved. Overlapping targets for the same {scope === 'Company' ? 'company' : 'unit'} are refused so nothing is counted twice.</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn-secondary" onClick={() => save(false)} disabled={busy}>Save draft</button>
          <button className="btn-primary" onClick={() => save(true)} disabled={busy}>Save &amp; submit</button>
        </div>
      </div>
    </Modal>
  );
}
