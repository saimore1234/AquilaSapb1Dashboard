import { Link, useSearchParams } from 'react-router-dom';
import { getKpiDocuments } from '../../api/sales';
import type { KpiDocumentReport, KpiDocumentRow } from '../../types';
import DetailReport, { type Col } from './DetailReport';
import { formatDate } from './salesShared';
import { formatAmount } from './formatters';

const rupees = { format: (v: number | null | undefined) => formatAmount(v, { zero: true }) };
const dash = (v: string | null | undefined) => v || '—';
const foot = 'px-3 py-2.5 font-semibold bg-surface-tertiary/60 border-t border-border-strong';

interface Kind {
  title: string;
  /** Singular document label and its route under /sales. */
  doc: string;
  route: string;
  openLabel: string;
  currentPosition: boolean;
  definition: string;
}

/** One entry per dashboard KPI card that lists documents. The SQL behind each is the one the card's own count uses (same predicates), so totals reconcile. */
const KINDS: Record<string, Kind> = {
  'open-quotations': { title: 'Open Quotations', doc: 'Quotation', route: 'quotations', openLabel: 'Quotation total', currentPosition: true, definition: 'Sales quotations that are still open and not cancelled — the documents counted by the Open Quotations card. Current position: the dates do not apply; unit, salesperson, customer group and product category do, exactly as on the card.' },
  'open-orders': { title: 'Open Sales Orders — documents', doc: 'Sales Order', route: 'orders', openLabel: 'Order total (incl. tax)', currentPosition: true, definition: 'Whole open sales orders (not cancelled) at document value including tax — the documents counted by the Open Sales Orders (documents) card. This differs from the line-level Open Sales Orders report. Current position: the dates do not apply.' },
  'pending-deliveries': { title: 'Pending Deliveries', doc: 'Delivery', route: 'deliveries', openLabel: 'Delivery total', currentPosition: true, definition: 'Deliveries that are still open (dispatched, not yet invoiced), not cancelled, excluding inter-company customers — the documents counted by the Pending Deliveries card. Current position: the dates do not apply.' },
  'open-invoices': { title: 'Open A/R Invoices', doc: 'Invoice', route: 'invoices', openLabel: 'Unpaid balance', currentPosition: true, definition: 'A/R invoices not yet fully paid and not cancelled — the documents counted by the Open A/R Invoices card. The balance is invoice total minus paid to date. Current position: the dates do not apply.' },
  'incoming-payments': { title: 'Incoming Payments', doc: 'Payment', route: 'payments', openLabel: 'Payment total', currentPosition: false, definition: 'Incoming payments (not cancelled) dated in the period — the receipts counted by the Incoming Payments (Month) card. Receipts carry no unit, salesperson or product category, so only the customer group can narrow this list.' }
};

export const KPI_KINDS = Object.keys(KINDS);

/** Documents behind a dashboard KPI card. Opened from the card with ?kind=…; the shared filters (and any ?df=&dt= dates) travel with the link. */
export default function KpiDocumentsSection() {
  const [params] = useSearchParams();
  const kindKey = params.get('kind') ?? '';
  const kind = KINDS[kindKey] ?? KINDS['open-invoices'];
  const by = KINDS[kindKey] ? kindKey : 'open-invoices';
  const showDue = by !== 'incoming-payments';

  const cols: Col<KpiDocumentRow>[] = [
    { key: 'no', header: `${kind.doc} No.`, render: (r) => <Link className="font-medium text-brand-600 dark:text-brand-400 hover:underline" to={`/sales/${kind.route}/${r.docEntry}`}>{r.docNum}</Link>, csv: (r) => r.docNum, nowrap: true },
    { key: 'date', header: 'Posting Date', render: (r) => formatDate(r.postingDate), csv: (r) => r.postingDate.slice(0, 10), nowrap: true },
    ...(showDue ? [{ key: 'due', header: 'Due Date', render: (r: KpiDocumentRow) => (r.dueDate ? formatDate(r.dueDate) : '—'), csv: (r: KpiDocumentRow) => r.dueDate?.slice(0, 10), nowrap: true } as Col<KpiDocumentRow>] : []),
    { key: 'cust', header: 'Customer', render: (r) => (<><div className="text-ink-primary">{r.customerName ?? r.customerCode}</div><div className="text-xs text-ink-tertiary">{r.customerCode}</div></>), csv: (r) => `${r.customerCode} - ${r.customerName ?? ''}` },
    { key: 'sp', header: 'Salesperson', render: (r) => dash(r.salesperson), csv: (r) => r.salesperson },
    { key: 'br', header: 'Branch', render: (r) => dash(r.branch), csv: (r) => r.branch },
    { key: 'tot', header: 'Document Total', align: 'right', render: (r) => rupees.format(r.docTotal), csv: (r) => r.docTotal },
    ...(by === 'open-invoices' ? [{ key: 'open', header: kind.openLabel, align: 'right', render: (r: KpiDocumentRow) => rupees.format(r.openAmount), csv: (r: KpiDocumentRow) => r.openAmount } as Col<KpiDocumentRow>] : [])
  ];
  const lead = cols.length - (by === 'open-invoices' ? 2 : 1);

  return (
    <DetailReport<KpiDocumentRow, KpiDocumentReport>
      id="kpi"
      title={kind.title}
      note={kind.currentPosition ? 'current position — not period-based' : undefined}
      definition={kind.definition}
      fetcher={getKpiDocuments}
      columns={cols}
      filters={['unit', 'branch', 'salesperson', 'customerGroup', 'category']}
      rowKey={(r) => String(r.docEntry)}
      csvName={`kpi-${by}`}
      extra={{ by }}
      footer={(rep) => (
        <>
          {rep.note && <tr><td className="px-3 py-2 text-xs text-ink-tertiary" colSpan={cols.length}>{rep.note}</td></tr>}
          <tr>
            <td className={foot} colSpan={lead}>{kind.title}: {rupees.format(rep.totals.documents)} documents (all pages)</td>
            <td className={`${foot} text-right tabular-nums`}>{rupees.format(rep.totals.docTotal)}</td>
            {by === 'open-invoices' && <td className={`${foot} text-right tabular-nums`}>{rupees.format(rep.totals.openAmount)}</td>}
          </tr>
        </>
      )}
      footerCsv={(rep) => ['TOTAL', `${rep.totals.documents} documents`, ...Array(Math.max(0, lead - 2)).fill(''), rep.totals.docTotal, ...(by === 'open-invoices' ? [rep.totals.openAmount] : [])]}
    />
  );
}
