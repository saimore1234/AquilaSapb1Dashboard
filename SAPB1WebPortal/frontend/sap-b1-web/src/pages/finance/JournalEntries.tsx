import FinanceListPage from '../../components/finance/FinanceListPage';
import { getJournalEntries } from '../../api/finance';
import type { JournalEntry, JournalEntryQuery } from '../../types';
import type { ColumnDef } from '../../components/ui/ResponsiveTable';
import { BookText } from 'lucide-react';

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

const columns: ColumnDef<JournalEntry>[] = [
  {
    key: 'trans',
    header: 'Transaction',
    render: (r) => (
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-info-bg text-info flex items-center justify-center shrink-0">
          <BookText className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-ink-primary truncate">{r.memo || `Transaction #${r.transId}`}</p>
          <p className="text-ink-tertiary text-xs">JE #{r.transId}</p>
        </div>
      </div>
    )
  },
  { key: 'postingDate', header: 'Posting Date', render: (r) => formatDate(r.postingDate), className: 'hidden md:table-cell text-ink-secondary' },
  { key: 'reference', header: 'Reference', render: (r) => r.reference || '—', className: 'hidden lg:table-cell text-ink-secondary' },
  { key: 'origin', header: 'Origin', render: (r) => r.origin || '—', className: 'hidden lg:table-cell text-ink-secondary' },
  { key: 'docNumber', header: 'Doc #', render: (r) => r.documentNumber ?? '—', className: 'hidden md:table-cell text-ink-secondary' },
  { key: 'totalDebit', header: 'Total Debit', align: 'right', render: (r) => <span className="tabular-nums">{r.totalDebit.toLocaleString()}</span> },
  { key: 'totalCredit', header: 'Total Credit', align: 'right', render: (r) => <span className="tabular-nums">{r.totalCredit.toLocaleString()}</span> }
];

export default function JournalEntries() {
  return (
    <FinanceListPage<JournalEntry, JournalEntryQuery>
      title="Journal Entries"
      fetchFn={getJournalEntries}
      buildQuery={(base, filters) => ({
        ...base,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined
      })}
      columns={columns}
      keyField={(r) => String(r.transId)}
      routeBase="/finance/journal-entries"
      docEntryField={(r) => r.transId}
      searchPlaceholder="Transaction ID, reference, memo, doc #…"
      filterFields={['date']}
      emptyMessage="No journal transactions found."
      renderMobileCard={(r) => (
        <div className="px-4 py-3.5 space-y-1">
          <div className="flex items-center justify-between">
            <p className="font-medium text-ink-primary truncate">{r.memo || `JE #${r.transId}`}</p>
            <p className="text-ink-tertiary text-xs">{formatDate(r.postingDate)}</p>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-tertiary">Debit: <span className="text-ink-primary font-medium">{r.totalDebit.toLocaleString()}</span></span>
            <span className="text-ink-tertiary">Credit: <span className="text-ink-primary font-medium">{r.totalCredit.toLocaleString()}</span></span>
          </div>
        </div>
      )}
    />
  );
}
