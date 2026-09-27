import FinanceListPage from '../../components/finance/FinanceListPage';
import { getFinanceIncomingPayments } from '../../api/finance';
import type { FinanceIncomingPayment, LedgerQuery } from '../../types';
import type { ColumnDef } from '../../components/ui/ResponsiveTable';
import Avatar from '../../components/ui/Avatar';

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

const columns: ColumnDef<FinanceIncomingPayment>[] = [
  {
    key: 'customer',
    header: 'Customer',
    render: (r) => (
      <div className="flex items-center gap-3">
        <Avatar name={r.customerName || r.customerCode} size="sm" />
        <div className="min-w-0">
          <p className="font-medium text-ink-primary truncate">{r.customerName || r.customerCode}</p>
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

export default function IncomingPayments() {
  return (
    <FinanceListPage<FinanceIncomingPayment, LedgerQuery>
      title="Incoming Payments"
      fetchFn={getFinanceIncomingPayments}
      buildQuery={(base, filters) => ({
        ...base,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        businessPartner: filters.businessPartner || undefined
      })}
      columns={columns}
      keyField={(r) => String(r.docEntry)}
      searchPlaceholder="Payment #, customer, reference…"
      filterFields={['date', 'businessPartner']}
      emptyMessage="No incoming payments found."
      renderMobileCard={(r) => (
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Avatar name={r.customerName || r.customerCode} />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink-primary truncate">{r.customerName || r.customerCode}</p>
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
