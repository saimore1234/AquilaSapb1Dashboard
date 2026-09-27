import { useEffect, useState } from 'react';
import FinanceListPage from '../../components/finance/FinanceListPage';
import { getReceivables, getReceivablesSummary } from '../../api/finance';
import type { Receivable, AgeingQuery, AgeingSummary } from '../../types';
import type { ColumnDef } from '../../components/ui/ResponsiveTable';
import Avatar from '../../components/ui/Avatar';
import AgeingSummaryCards from '../../components/finance/AgeingSummaryCards';

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

function statusBadge(status: string) {
  if (status === 'Paid') return 'badge-neutral';
  if (status === 'Overdue') return 'badge-danger';
  return 'badge-success';
}

const columns: ColumnDef<Receivable>[] = [
  {
    key: 'customer',
    header: 'Customer',
    render: (r) => (
      <div className="flex items-center gap-3">
        <Avatar name={r.customerName || r.customerCode} size="sm" />
        <div className="min-w-0">
          <p className="font-medium text-ink-primary truncate">{r.customerName || r.customerCode}</p>
          <p className="text-ink-tertiary text-xs">Invoice #{r.docNum}</p>
        </div>
      </div>
    )
  },
  { key: 'invoiceDate', header: 'Invoice Date', render: (r) => formatDate(r.invoiceDate), className: 'hidden md:table-cell text-ink-secondary' },
  { key: 'dueDate', header: 'Due Date', render: (r) => formatDate(r.dueDate), className: 'hidden lg:table-cell text-ink-secondary' },
  { key: 'total', header: 'Invoice Total', align: 'right', render: (r) => <span className="tabular-nums">{r.invoiceTotal.toLocaleString()}</span>, className: 'hidden md:table-cell' },
  { key: 'balance', header: 'Balance', align: 'right', render: (r) => <span className="tabular-nums font-medium">{r.balance.toLocaleString()}</span> },
  { key: 'daysOverdue', header: 'Days Overdue', align: 'right', render: (r) => (r.daysOverdue > 0 ? <span className="text-danger tabular-nums">{r.daysOverdue}</span> : '—'), className: 'hidden lg:table-cell' },
  { key: 'bucket', header: 'Ageing', render: (r) => <span className="badge-neutral">{r.ageingBucket}</span>, className: 'hidden lg:table-cell' },
  { key: 'status', header: 'Status', render: (r) => <span className={statusBadge(r.status)}>{r.status}</span> }
];

export default function Receivables() {
  const [summary, setSummary] = useState<AgeingSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    getReceivablesSummary()
      .then(setSummary)
      .finally(() => setSummaryLoading(false));
  }, []);

  return (
    <FinanceListPage<Receivable, AgeingQuery>
      title="Accounts Receivable"
      fetchFn={getReceivables}
      buildQuery={(base, filters) => ({
        ...base,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        businessPartner: filters.businessPartner || undefined,
        ageingBucket: filters.ageingBucket || undefined
      })}
      columns={columns}
      keyField={(r) => String(r.docEntry)}
      searchPlaceholder="Invoice #, customer code, customer name…"
      filterFields={['date', 'businessPartner', 'ageingBucket']}
      emptyMessage="There are no outstanding receivables."
      headerExtra={<AgeingSummaryCards summary={summary} loading={summaryLoading} />}
      renderMobileCard={(r) => (
        <div className="px-4 py-3.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex items-center gap-2">
              <Avatar name={r.customerName || r.customerCode} size="sm" />
              <div className="min-w-0">
                <p className="font-medium text-ink-primary truncate">{r.customerName || r.customerCode}</p>
                <p className="text-ink-tertiary text-xs">#{r.docNum}</p>
              </div>
            </div>
            <span className={statusBadge(r.status)}>{r.status}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-tertiary">Due: <span className="text-ink-primary font-medium">{formatDate(r.dueDate)}</span></span>
            <span className="text-ink-tertiary">Balance: <span className="text-ink-primary font-medium">{r.balance.toLocaleString()}</span></span>
            {r.daysOverdue > 0 && <span className="text-danger font-medium">{r.daysOverdue}d overdue</span>}
          </div>
        </div>
      )}
    />
  );
}
