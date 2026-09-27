import PurchaseDocumentList from '../../components/purchase/PurchaseDocumentList';
import { getApInvoices } from '../../api/purchase';
import type { ApInvoice } from '../../types';
import type { ColumnDef } from '../../components/ui/ResponsiveTable';
import Avatar from '../../components/ui/Avatar';

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

const columns: ColumnDef<ApInvoice>[] = [
  {
    key: 'vendor',
    header: 'Vendor',
    render: (r) => (
      <div className="flex items-center gap-3">
        <Avatar name={r.vendorName || r.vendorCode} size="sm" />
        <div className="min-w-0">
          <p className="font-medium text-ink-primary truncate">{r.vendorName || r.vendorCode}</p>
          <p className="text-ink-tertiary text-xs">Invoice #{r.docNum}</p>
        </div>
      </div>
    )
  },
  { key: 'postingDate', header: 'Posting Date', render: (r) => formatDate(r.postingDate), className: 'hidden md:table-cell text-ink-secondary' },
  { key: 'dueDate', header: 'Due Date', render: (r) => formatDate(r.dueDate), className: 'hidden lg:table-cell text-ink-secondary' },
  { key: 'status', header: 'Status', render: (r) => <span className={r.status === 'Open' ? 'badge-success' : 'badge-neutral'}>{r.status}</span> },
  { key: 'total', header: 'Total', align: 'right', render: (r) => <span className="tabular-nums">{r.total.toLocaleString()}</span> },
  { key: 'paid', header: 'Paid', align: 'right', render: (r) => <span className="tabular-nums">{r.paid.toLocaleString()}</span>, className: 'hidden lg:table-cell' },
  {
    key: 'balance',
    header: 'Balance',
    align: 'right',
    render: (r) => <span className={`tabular-nums font-medium ${r.balance > 0 ? 'text-danger' : ''}`}>{r.balance.toLocaleString()}</span>
  }
];

export default function ApInvoices() {
  return (
    <PurchaseDocumentList
      title="A/P Invoices"
      fetchFn={getApInvoices}
      columns={columns}
      keyField={(r) => String(r.docEntry)}
      docEntryField={(r) => r.docEntry}
      routeBase="/purchase/invoices"
      searchPlaceholder="Invoice #, vendor…"
      filterFields={['date', 'vendor', 'status']}
      emptyMessage="No A/P invoices found."
      renderMobileCard={(r) => (
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Avatar name={r.vendorName || r.vendorCode} />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink-primary truncate">{r.vendorName || r.vendorCode}</p>
            <p className="text-ink-tertiary text-xs">
              #{r.docNum} · {formatDate(r.postingDate)}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-medium tabular-nums text-ink-primary">{r.balance.toLocaleString()} bal.</p>
            <span className={r.status === 'Open' ? 'badge-success' : 'badge-neutral'}>{r.status}</span>
          </div>
        </div>
      )}
    />
  );
}
