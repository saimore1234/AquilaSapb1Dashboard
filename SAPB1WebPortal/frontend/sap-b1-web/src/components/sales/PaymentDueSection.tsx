import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { getPaymentDue } from '../../api/sales';
import type { PaymentDueQuery, PaymentDueReport, PaymentDueRow } from '../../types';
import { EmptyState, ErrorState } from '../StateViews';
import { Skeleton } from '../ui/Skeleton';
import Pagination from '../Pagination';
import StatCard from '../StatCard';
import { SectionHeading, formatDate } from './salesShared';
import { formatAmount, formatCount } from './formatters';
import { useReportFilterOptions } from './reportOptions';
import { useSalesRefresh } from './salesRefresh';
import { downloadCsv } from './salesUtils';
import { usePermissions } from '../../permissions/usePermissions';
import { Wallet, AlertTriangle, CalendarClock, CalendarDays } from 'lucide-react';

const PAGE = 25;
const rupees = (v: number | null | undefined) => formatAmount(v, { zero: true });
const dash = (v: string | null | undefined) => v || '—';
const STATUS: { value: string; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'duetoday', label: 'Due today' },
  { value: 'due7', label: 'Due within 7 days' },
  { value: 'due15', label: 'Due within 15 days' },
  { value: 'due30', label: 'Due within 30 days' },
  { value: 'notdue', label: 'Upcoming (due after today)' },
  { value: 'unpaid', label: 'Unpaid (nothing paid)' },
  { value: 'partial', label: 'Partially paid' },
  { value: 'paid', label: 'Paid (no balance)' }
];
const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUS.filter((x) => x.value).map((x) => [x.value, x.label]));
/** The six KPI cards; selecting one filters the invoice list with the same rule the card's amount uses. */
const CARD_KEYS = ['all', 'overdue', 'duetoday', 'due7', 'due15', 'due30'] as const;
type CardKey = (typeof CARD_KEYS)[number];
const STATUS_TO_CARD = (status: string): CardKey | null => (['overdue', 'duetoday', 'due7', 'due15', 'due30'].includes(status) ? (status as CardKey) : null);
const PAY_BADGE: Record<string, string> = { Paid: 'badge-success', Overdue: 'badge-danger', 'Due Today': 'badge-warning', Upcoming: 'badge-neutral' };

interface Draft { customer: string; customerCode: string; invoiceNo: string; terms: string; salesperson: string; branch: string; dueFrom: string; dueTo: string; status: string; minOver: string }
const EMPTY: Draft = { customer: '', customerCode: '', invoiceNo: '', terms: '', salesperson: '', branch: '', dueFrom: '', dueTo: '', status: '', minOver: '' };


/**
 * Payment Due Register: open A/R invoices with their SAP due dates and payment terms. Outstanding is the SAP invoice balance (total minus paid to
 * date, which already includes credit memos and reconciliations), so it matches the Outstanding Customer Invoices report.
 */
export default function PaymentDueSection() {
  const { canExport } = usePermissions();
  const { tick, markUpdated } = useSalesRefresh();
  const seenTick = useRef(tick);
  const options = useReportFilterOptions();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [applied, setApplied] = useState<Draft>(EMPTY);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<'invoices' | 'customers' | 'terms'>('invoices');
  const [sel, setSel] = useState<CardKey | null>(null);
  // Set when the invoice list was opened by clicking a customer / payment-terms row, so there is a way back to that summary.
  const [back, setBack] = useState<{ tab: 'customers' | 'terms'; field: 'customerCode' | 'terms'; label: string } | null>(null);
  const [data, setData] = useState<PaymentDueReport | null>(null);
  const [termsList, setTermsList] = useState<{ key: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const query = useMemo<PaymentDueQuery>(() => ({
    customer: applied.customer.trim() || undefined,
    customerCode: applied.customerCode || undefined,
    invoiceNo: applied.invoiceNo && Number.isFinite(Number(applied.invoiceNo)) ? Number(applied.invoiceNo) : undefined,
    paymentTerms: applied.terms ? Number(applied.terms) : undefined,
    salesperson: applied.salesperson ? Number(applied.salesperson) : undefined,
    branch: applied.branch ? Number(applied.branch) : undefined,
    dueFrom: applied.dueFrom || undefined,
    dueTo: applied.dueTo || undefined,
    status: applied.status || undefined,
    minDaysOverdue: applied.minOver !== '' && Number.isFinite(Number(applied.minOver)) ? Number(applied.minOver) : undefined
  }), [applied]);

  useEffect(() => {
    const silent = seenTick.current !== tick;
    seenTick.current = tick;
    if (!silent) { setLoading(true); setData(null); }
    setError(null);
    let live = true;
    getPaymentDue({ ...query, page, pageSize: PAGE })
      .then((d) => {
        if (!live) return;
        setData(d); markUpdated();
        // The terms dropdown is built from the unfiltered list, so it keeps every option while a filter is applied.
        setTermsList((cur) => (cur.length === 0 || !Object.values(applied).some(Boolean) ? d.byTerms.map((t) => ({ key: t.key, name: t.name ?? t.key })) : cur));
      })
      .catch((err) => { if (live) setError(err?.response?.data?.message || err.message || 'Unable to load the payment due register.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, page, reload, tick]);

  const apply = (next: Draft) => { setApplied(next); setPage(1); setSel(STATUS_TO_CARD(next.status)); };
  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v, ...(k === 'customer' ? { customerCode: '' } : {}) }));
  // A KPI card: filter the invoice list to the invoices behind its amount, keep every other active filter, stay on this page.
  const selectCard = (key: CardKey) => {
    const n = { ...applied, status: key === 'all' ? '' : key };
    setDraft(n); setApplied(n); setPage(1); setSel(key); setTab('invoices');
  };
  const clearSelection = () => { const n = { ...applied, status: '' }; setDraft(n); setApplied(n); setPage(1); setSel(null); };
  // A customer / payment-terms row: open that group's invoices, keeping the other filters and the selected card.
  const drill = (from: 'customers' | 'terms', key: string, label: string) => {
    const field = from === 'customers' ? 'customerCode' : 'terms';
    const n = { ...applied, [field]: key } as Draft;
    setDraft(n); setApplied(n); setPage(1); setTab('invoices'); setBack({ tab: from, field, label });
  };
  const backToSummary = () => {
    if (!back) return;
    const n = { ...applied, [back.field]: '' } as Draft;
    setDraft(n); setApplied(n); setPage(1); setTab(back.tab); setBack(null);
  };
  const totalPages = data ? Math.max(1, Math.ceil(data.totalCount / PAGE)) : 1;
  const selLabel = applied.status ? STATUS_LABEL[applied.status] : null;

  async function exportCsv() {
    setNotice(null);
    try {
      const all = await getPaymentDue({ ...query, page: 1, pageSize: 5000 });
      const t = all.totals; // card totals (filters without the status selection)
      downloadCsv(
        `payment-due-register-${all.asOf.slice(0, 10)}.csv`,
        ['Customer Code', 'Customer Name', 'Invoice Number', 'Posting Date', 'Due Date', 'Payment Terms', 'Invoice Amount', 'Paid Amount', 'Outstanding Amount', 'Days Overdue', 'Payment Status', 'Salesperson', 'Branch'],
        [
          ...all.rows.map((r) => [r.customerCode, r.customerName, r.docNum, r.postingDate.slice(0, 10), r.dueDate.slice(0, 10), r.paymentTerms, r.invoiceAmount, r.paidAmount, r.outstandingAmount, r.daysOverdue, r.paymentStatus, r.salesperson, r.branch]),
          ['TOTAL', `${all.selection.invoices} invoices`, '', '', '', '', all.selection.invoiceAmount, all.selection.paidAmount, all.selection.outstanding, '', '', '', '']
        ],
        [['Report: Payment Due Register'], [`As of: ${all.asOf.slice(0, 10)}`], [`Selection: ${selLabel ?? 'All open invoices'}`, `${all.selection.invoices} invoices`, `Outstanding ${all.selection.outstanding}`], [`Overdue: ${t.overdue}`, `Due today: ${t.dueToday}`, `Due within 7 days: ${t.dueWithin7}`, `Due within 15 days: ${t.dueWithin15}`, `Due within 30 days: ${t.dueWithin30}`], []]
      );
      if (all.totalCount > 5000) setNotice(`Exported the first 5,000 of ${all.totalCount.toLocaleString('en-IN')} invoices — narrow the filters for the rest.`);
    } catch (err) {
      setNotice((err as Error).message || 'Export failed.');
    }
  }

  const input = 'ctl';
  const t = data?.totals;
  const th = 'px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-tertiary';
  const tab_ = (id: typeof tab, label: string) => (
    <button type="button" onClick={() => setTab(id)} aria-pressed={tab === id}
      className={`btn-compact inline-flex items-center rounded-md border px-3 text-sm font-medium ${tab === id ? 'bg-brand-600 text-white border-brand-600' : 'bg-surface text-ink-primary border-border-strong hover:bg-surface-tertiary'}`}>{label}</button>
  );

  return (
    <section aria-labelledby="pd-h" className="space-y-3">
      <SectionHeading id="pd-h" title="Payment Due Register" note={data ? <>as of {formatDate(data.asOf)}</> : undefined} />
      <p className="text-xs text-ink-tertiary -mt-1">
        Open A/R invoices (not cancelled, not fully paid) with the due date and payment terms SAP holds on each invoice. Paid includes incoming payments and any credit memo or reconciliation applied to the invoice,
        so nothing is counted twice; Outstanding = invoice amount − paid, the same figure as the Outstanding Customer Invoices report. “Due within N days” is cumulative: due from today through N days ahead.
      </p>

      <div className="panel px-3 py-2.5 flex flex-wrap items-end gap-3">
        <div><label className="ctl-label" htmlFor="pd-cust">Customer</label><input id="pd-cust" className={`${input} w-44`} placeholder="Name or code" value={draft.customer} onChange={(e) => set('customer', e.target.value)} /></div>
        <div><label className="ctl-label" htmlFor="pd-inv">Invoice No.</label><input id="pd-inv" inputMode="numeric" className={`${input} w-28`} value={draft.invoiceNo} onChange={(e) => set('invoiceNo', e.target.value.replace(/\D/g, ''))} /></div>
        <div><label className="ctl-label" htmlFor="pd-terms">Payment terms</label>
          <select id="pd-terms" className={`${input} w-40`} value={draft.terms} onChange={(e) => set('terms', e.target.value)}>
            <option value="">All terms</option>
            {termsList.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
          </select></div>
        <div><label className="ctl-label" htmlFor="pd-slp">Salesperson</label>
          <select id="pd-slp" className={`${input} w-44`} value={draft.salesperson} onChange={(e) => set('salesperson', e.target.value)}>
            <option value="">All salespersons</option>
            {options?.salespersons.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select></div>
        <div><label className="ctl-label" htmlFor="pd-br">Branch / Unit</label>
          <select id="pd-br" className={`${input} w-40`} value={draft.branch} onChange={(e) => set('branch', e.target.value)}>
            <option value="">All branches</option>
            {options?.branches.map((b) => <option key={b.code} value={b.code}>{b.label || b.name}</option>)}
          </select></div>
        <div><label className="ctl-label" htmlFor="pd-df">Due from</label><input id="pd-df" type="date" className={`${input} w-[9.5rem]`} value={draft.dueFrom} max={draft.dueTo || undefined} onChange={(e) => set('dueFrom', e.target.value)} /></div>
        <div><label className="ctl-label" htmlFor="pd-dt">Due to</label><input id="pd-dt" type="date" className={`${input} w-[9.5rem]`} value={draft.dueTo} min={draft.dueFrom || undefined} onChange={(e) => set('dueTo', e.target.value)} /></div>
        <div><label className="ctl-label" htmlFor="pd-st">Payment status</label>
          <select id="pd-st" className={`${input} w-40`} value={draft.status} onChange={(e) => set('status', e.target.value)}>
            {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select></div>
        <div><label className="ctl-label" htmlFor="pd-od">Overdue ≥ days</label><input id="pd-od" inputMode="numeric" className={`${input} w-24`} value={draft.minOver} onChange={(e) => set('minOver', e.target.value.replace(/[^\d]/g, ''))} /></div>
        <div className="flex gap-2">
          <button type="button" className="btn-primary btn-compact" onClick={() => apply(draft)}>Apply</button>
          <button type="button" className="btn-secondary btn-compact" onClick={() => { setDraft(EMPTY); apply(EMPTY); setSel(null); setBack(null); }}>Reset</button>
        </div>
      </div>

      {error ? (
        <div className="panel p-4"><ErrorState message={error} onRetry={() => setReload((n) => n + 1)} /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {loading || !t ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[92px]" />) : (
              <>
                {([
                  { key: 'all', label: 'Total Outstanding Due', value: t.outstanding, count: t.invoices, icon: Wallet, hint: `${formatCount(t.invoices)} invoices` },
                  { key: 'overdue', label: 'Overdue Amount', value: t.overdue, count: t.overdueInvoices, icon: AlertTriangle, hint: `${formatCount(t.overdueInvoices)} invoices past due` },
                  { key: 'duetoday', label: 'Due Today', value: t.dueToday, count: t.dueTodayInvoices, icon: CalendarClock, hint: `${formatCount(t.dueTodayInvoices)} invoices` },
                  { key: 'due7', label: 'Due Within 7 Days', value: t.dueWithin7, count: t.dueWithin7Invoices, icon: CalendarDays, hint: `${formatCount(t.dueWithin7Invoices)} invoices · cumulative` },
                  { key: 'due15', label: 'Due Within 15 Days', value: t.dueWithin15, count: t.dueWithin15Invoices, icon: CalendarDays, hint: `${formatCount(t.dueWithin15Invoices)} invoices · cumulative` },
                  { key: 'due30', label: 'Due Within 30 Days', value: t.dueWithin30, count: t.dueWithin30Invoices, icon: CalendarDays, hint: `${formatCount(t.dueWithin30Invoices)} invoices · cumulative` }
                ] as { key: CardKey; label: string; value: number; count: number; icon: typeof Wallet; hint: string }[]).map((c) => (
                  <button key={c.key} type="button" onClick={() => selectCard(c.key)} aria-pressed={sel === c.key}
                    title={`Show the ${formatCount(c.count)} invoices behind this amount`}
                    className={`text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${sel === c.key ? 'ring-2 ring-brand-600' : ''}`}>
                    <StatCard variant="compact" label={c.label} value={rupees(c.value)} hint={c.hint} icon={c.icon} />
                  </button>
                ))}
              </>
            )}
          </div>
          <p className="text-xs text-ink-tertiary">
            Click a card to list the invoices behind it. The Due Within 7 / 15 / 30 Days amounts are <span className="font-medium">cumulative</span> — each includes Due Today and the shorter windows — so do not add them together.
            Overdue = due date before today with a balance; days overdue = today − invoice due date (0 when due today, in the future or paid). Dates are in India time{data ? ` (as of ${formatDate(data.asOf)})` : ''}.
          </p>
          {t && (
            <p className="text-xs text-ink-tertiary">
              Customer account balance (ledger) for these customers: {rupees(t.customerAccountBalance)}. It is lower than the outstanding above by credit memos and payments on account that are not applied to an invoice; the journal-based Total Outstanding report nets those.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {tab_('invoices', 'Invoices')}{tab_('customers', 'Customer-wise due')}{tab_('terms', 'Payment terms-wise due')}
            {canExport && (
              <button type="button" className="btn-secondary ml-auto" onClick={exportCsv} disabled={!data}>
                <Download className="h-4 w-4" /> Download CSV
              </button>
            )}
          </div>
          {notice && <p className="text-xs text-warning">{notice}</p>}
          {(sel || back || selLabel) && data && (
            <div className="panel px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="text-ink-secondary">
                Showing{' '}
                <span className="font-medium text-ink-primary">{sel === 'all' ? 'Total outstanding' : selLabel ?? 'all open invoices'}</span>
                {back && <> · <span className="font-medium text-ink-primary">{back.label}</span></>}
                {' '}· {formatCount(data.selection.invoices)} invoices · outstanding <span className="font-medium text-ink-primary tabular-nums">{rupees(data.selection.outstanding)}</span>
              </span>
              <span className="ml-auto flex gap-2">
                {back && <button type="button" className="btn-secondary btn-compact" onClick={backToSummary}>← Back to {back.tab === 'customers' ? 'customer-wise' : 'payment terms-wise'} due</button>}
                {(sel || applied.status) && <button type="button" className="btn-secondary btn-compact" onClick={clearSelection}>Clear selection</button>}
              </span>
            </div>
          )}

          <div className="card p-0 overflow-hidden">
            {loading || !data ? (
              <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
            ) : tab === 'invoices' ? (
              data.rows.length === 0 ? <EmptyState message="No invoices match" description="Try adjusting the filters." /> : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left border-b border-border">
                        <th className={th}>Customer</th><th className={th}>Invoice No.</th><th className={th}>Posting Date</th><th className={th}>Due Date</th><th className={th}>Payment Terms</th>
                        <th className={`${th} text-right`}>Invoice Amount</th><th className={`${th} text-right`}>Paid</th><th className={`${th} text-right`}>Outstanding</th>
                        <th className={`${th} text-right`}>Days Overdue</th><th className={th}>Status</th><th className={th}>Salesperson</th><th className={th}>Branch</th>
                      </tr></thead>
                      <tbody>
                        {data.rows.map((r: PaymentDueRow) => (
                          <tr key={r.docEntry} className="border-b border-border last:border-0 hover:bg-surface-tertiary/60">
                            <td className="px-3 py-2.5"><div className="text-ink-primary">{r.customerName ?? r.customerCode}</div><div className="text-xs text-ink-tertiary">{r.customerCode}</div></td>
                            <td className="px-3 py-2.5 whitespace-nowrap"><Link className="font-medium text-brand-600 dark:text-brand-400 hover:underline" to={`/sales/invoices/${r.docEntry}`}>INV/{r.docNum}</Link></td>
                            <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(r.postingDate)}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(r.dueDate)}</td>
                            <td className="px-3 py-2.5">{dash(r.paymentTerms)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{rupees(r.invoiceAmount)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{rupees(r.paidAmount)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-medium">{rupees(r.outstandingAmount)}</td>
                            <td className={`px-3 py-2.5 text-right tabular-nums ${r.daysOverdue > 0 ? 'text-danger' : ''}`}>{r.daysOverdue}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap"><span className={PAY_BADGE[r.paymentStatus] ?? 'badge-neutral'}>{r.paymentStatus}</span></td>
                            <td className="px-3 py-2.5">{dash(r.salesperson)}</td>
                            <td className="px-3 py-2.5">{dash(r.branch)}</td>
                          </tr>
                        ))}
                        <tr className="bg-surface-tertiary/60 font-semibold border-t border-border-strong">
                          <td className="px-3 py-2.5" colSpan={5}>Total · {formatCount(data.selection.invoices)} invoices (all pages)</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{rupees(data.selection.invoiceAmount)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{rupees(data.selection.paidAmount)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{rupees(data.selection.outstanding)}</td>
                          <td colSpan={4} />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
                </>
              )
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left border-b border-border">
                    <th className={th}>{tab === 'customers' ? 'Customer' : 'Payment terms'}</th><th className={`${th} text-right`}>Invoices</th>
                    <th className={`${th} text-right`}>Outstanding</th><th className={`${th} text-right`}>Overdue</th>
                  </tr></thead>
                  <tbody>
                    {(tab === 'customers' ? data.byCustomer : data.byTerms).map((b) => (
                      <tr key={b.key} className="border-b border-border last:border-0 hover:bg-surface-tertiary/60">
                        <td className="px-3 py-2.5">
                          {tab === 'customers' ? (
                            <button type="button" className="text-left hover:underline" title="Show this customer's invoices" onClick={() => drill('customers', b.key, b.name ?? b.key)}>
                              <span className="text-ink-primary">{b.name ?? b.key}</span> <span className="text-xs text-ink-tertiary">{b.key}</span>
                            </button>
                          ) : (
                            <button type="button" className="text-left hover:underline" title="Show invoices on these terms" onClick={() => drill('terms', b.key, b.name ?? b.key)}>{b.name ?? b.key}</button>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatCount(b.invoices)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-medium">{rupees(b.outstanding)}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${b.overdue > 0 ? 'text-danger' : ''}`}>{rupees(b.overdue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {tab === 'customers' && data.byCustomer.length >= 100 && <p className="px-3 py-2 text-xs text-ink-tertiary">Showing the 100 customers with the highest outstanding.</p>}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
