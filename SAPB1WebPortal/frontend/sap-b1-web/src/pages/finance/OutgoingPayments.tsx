import FinanceListPage from '../../components/finance/FinanceListPage';
import { getFinanceOutgoingPayments } from '../../api/finance';
import type { FinanceOutgoingPayment, LedgerQuery } from '../../types';
import type { ColumnDef } from '../../components/ui/ResponsiveTable';
import Avatar from '../../components/ui/Avatar';

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

const columns: ColumnDef<FinanceOutgoingPayment>[] = [
  {
    key: 'vendor',
    header: 'Vendor',
    render: (r) => (
      <div className="flex items-center gap-3">
        <Avatar name={r.vendorName || r.vendorCode} size="sm" />
        <div className="min-w-0">
          <p className="font-medium text-ink-primary truncate">{r.vendorName || r.vendorCode}</p>
          <p className="text-ink-tertiary text-xs">Payment #{r.docNum}</p>
        </div>
      </div>
    )
  },
  { key: 'postingDate', header: 'Posting Date', render: (r) => formatDate(r.postingDate), className: 'hidden md:table-cell text-ink-secondary' },
  { key: 'method', header: 'Payment Method', render: (r) => r.paymentMethod, className: 'hidden lg:table-cell text-ink-secondary' },
  { key: 'bankOrCash', header: 'Bank/Cash', render: (r) => r.bankOrCash || '—', className: 'hidden lg:table-cell text-ink-secondary' },
  { key: 'reference', header: 'Reference', render: (r) => r.reference || '—', className: 'hidden md:table-cell text-ink-secondary' },
  { key: 'applied', header: 'Applied Invoices', align: 'right', render: (r) => r.appliedInvoiceCount, className: 'hidden md:table-cell' },
  { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className="tabular-nums font-medium">{r.amount.toLocaleString()}</span> }
];

export default function OutgoingPayments() {
  return (
    <FinanceListPage<FinanceOutgoingPayment, LedgerQuery>
      title="Outgoing Payments"
      fetchFn={getFinanceOutgoingPayments}
      buildQuery={(base, filters) => ({
        ...base,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        businessPartner: filters.businessPartner || undefined
      })}
      columns={columns}
      keyField={(r) => String(r.docEntry)}
      searchPlaceholder="Payment #, vendor, reference…"
      filterFields={['date', 'businessPartner']}
      emptyMessage="No outgoing payments found."
      renderMobileCard={(r) => (
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Avatar name={r.vendorName || r.vendorCode} />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink-primary truncate">{r.vendorName || r.vendorCode}</p>
            <p className="text-ink-tertiary text-xs">
              #{r.docNum} · {r.paymentMethod}
            </p>
          </div>
          <p className="text-sm font-semibold tabular-nums text-ink-primary shrink-0">{r.amount.toLocaleString()}</p>
        </div>
      )}
    />
  );
}
