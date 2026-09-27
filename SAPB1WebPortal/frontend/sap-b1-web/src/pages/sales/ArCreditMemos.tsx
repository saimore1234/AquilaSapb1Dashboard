import SalesDocumentList from '../../components/sales/SalesDocumentList';
import { getArCreditMemos } from '../../api/sales';
import type { ArCreditMemo } from '../../types';
import type { ColumnDef } from '../../components/ui/ResponsiveTable';
import Avatar from '../../components/ui/Avatar';

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

const columns: ColumnDef<ArCreditMemo>[] = [
  {
    key: 'customer',
    header: 'Customer',
    render: (r) => (
      <div className="flex items-center gap-3">
        <Avatar name={r.customerName || r.customerCode} size="sm" />
        <div className="min-w-0">
          <p className="font-medium text-ink-primary truncate">{r.customerName || r.customerCode}</p>
          <p className="text-ink-tertiary text-xs">Credit Memo #{r.docNum}</p>
        </div>
      </div>
    )
  },
  { key: 'postingDate', header: 'Posting Date', render: (r) => formatDate(r.postingDate), className: 'hidden md:table-cell text-ink-secondary' },
  { key: 'status', header: 'Status', render: (r) => <span className={r.status === 'Open' ? 'badge-success' : 'badge-neutral'}>{r.status}</span> },
  { key: 'total', header: 'Total', align: 'right', render: (r) => <span className="tabular-nums">{r.total.toLocaleString()}</span> },
  { key: 'currency', header: 'Currency', render: (r) => r.currency || '—', className: 'hidden lg:table-cell text-ink-secondary' }
];

export default function ArCreditMemos() {
  return (
    <SalesDocumentList
      title="A/R Credit Memos"
      fetchFn={getArCreditMemos}
      columns={columns}
      keyField={(r) => String(r.docEntry)}
      docEntryField={(r) => r.docEntry}
      routeBase="/sales/credit-memos"
      searchPlaceholder="Credit memo #, customer code, customer name…"
      filterFields={['date', 'customer', 'status']}
      emptyMessage="No A/R credit memos found."
      renderMobileCard={(r) => (
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Avatar name={r.customerName || r.customerCode} />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink-primary truncate">{r.customerName || r.customerCode}</p>
            <p className="text-ink-tertiary text-xs">
              #{r.docNum} · {formatDate(r.postingDate)}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-medium tabular-nums text-ink-primary">{r.total.toLocaleString()}</p>
            <span className={r.status === 'Open' ? 'badge-success' : 'badge-neutral'}>{r.status}</span>
          </div>
        </div>
      )}
    />
  );
}
