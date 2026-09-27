import FinanceListPage from '../../components/finance/FinanceListPage';
import { getLedger } from '../../api/finance';
import type { LedgerEntry, LedgerQuery } from '../../types';
import type { ColumnDef } from '../../components/ui/ResponsiveTable';

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

function formatMoney(value: number) {
  return value === 0 ? '—' : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const columns: ColumnDef<LedgerEntry>[] = [
  { key: 'date', header: 'Date', render: (r) => formatDate(r.postingDate), className: 'text-ink-secondary' },
  {
    key: 'transaction',
    header: 'Transaction',
    render: (r) => (
      <div className="min-w-0">
        <p className="font-medium text-ink-primary">TX #{r.transId}</p>
        <p className="text-ink-tertiary text-xs truncate">{r.memo || r.reference || '—'}</p>
      </div>
    )
  },
  {
    key: 'account',
    header: 'Account',
    render: (r) => (
      <div className="min-w-0">
        <p className="text-ink-primary truncate">{r.accountName || r.accountCode}</p>
        <p className="text-ink-tertiary text-xs">{r.accountCode}</p>
      </div>
    )
  },
  { key: 'bp', header: 'Business Partner', render: (r) => r.businessPartnerName || r.businessPartnerCode || '—', className: 'hidden lg:table-cell text-ink-secondary' },
  { key: 'debit', header: 'Debit', align: 'right', render: (r) => <span className="tabular-nums">{formatMoney(r.debit)}</span> },
  { key: 'credit', header: 'Credit', align: 'right', render: (r) => <span className="tabular-nums">{formatMoney(r.credit)}</span> },
  { key: 'balance', header: 'Balance', align: 'right', render: (r) => <span className="tabular-nums font-medium">{formatMoney(r.balance)}</span>, className: 'hidden md:table-cell' }
];

export default function GeneralLedger() {
  return (
    <FinanceListPage<LedgerEntry, LedgerQuery>
      title="General Ledger"
      fetchFn={getLedger}
      buildQuery={(base, filters) => ({
        ...base,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        account: filters.account || undefined,
        businessPartner: filters.businessPartner || undefined,
        documentType: filters.documentType || undefined,
        debitCredit: filters.debitCredit || undefined
      })}
      columns={columns}
      keyField={(r, i) => `${r.transId}-${r.lineId}-${i}`}
      searchPlaceholder="Transaction ID, account, reference, memo…"
      filterFields={['date', 'account', 'businessPartner', 'documentType', 'debitCredit']}
      emptyMessage="No ledger transactions found."
      renderMobileCard={(r) => (
        <div className="px-4 py-3.5 space-y-1">
          <div className="flex items-center justify-between">
            <p className="font-medium text-ink-primary">TX #{r.transId}</p>
            <p className="text-ink-tertiary text-xs">{formatDate(r.postingDate)}</p>
          </div>
          <p className="text-sm text-ink-secondary truncate">{r.accountName || r.accountCode}</p>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-ink-tertiary">Debit: <span className="text-ink-primary font-medium">{formatMoney(r.debit)}</span></span>
            <span className="text-ink-tertiary">Credit: <span className="text-ink-primary font-medium">{formatMoney(r.credit)}</span></span>
            <span className="text-ink-tertiary">Balance: <span className="text-ink-primary font-medium">{formatMoney(r.balance)}</span></span>
          </div>
        </div>
      )}
    />
  );
}
