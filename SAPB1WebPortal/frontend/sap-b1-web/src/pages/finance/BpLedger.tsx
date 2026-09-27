import FinanceListPage from '../../components/finance/FinanceListPage';
import { getBpLedger } from '../../api/finance';
import type { BpLedger as BpLedgerType, BpLedgerQuery } from '../../types';
import type { ColumnDef } from '../../components/ui/ResponsiveTable';
import Avatar from '../../components/ui/Avatar';

function formatMoney(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const columns: ColumnDef<BpLedgerType>[] = [
  {
    key: 'bp',
    header: 'Business Partner',
    render: (r) => (
      <div className="flex items-center gap-3">
        <Avatar name={r.bpName || r.bpCode} size="sm" />
        <div className="min-w-0">
          <p className="font-medium text-ink-primary truncate">{r.bpName || r.bpCode}</p>
          <p className="text-ink-tertiary text-xs">{r.bpCode}</p>
        </div>
      </div>
    )
  },
  { key: 'type', header: 'Type', render: (r) => <span className={r.type === 'Customer' ? 'badge-success' : 'badge-neutral'}>{r.type}</span> },
  { key: 'opening', header: 'Opening Balance', align: 'right', render: (r) => <span className="tabular-nums">{formatMoney(r.openingBalance)}</span>, className: 'hidden lg:table-cell' },
  { key: 'debit', header: 'Debit', align: 'right', render: (r) => <span className="tabular-nums">{formatMoney(r.debit)}</span>, className: 'hidden md:table-cell' },
  { key: 'credit', header: 'Credit', align: 'right', render: (r) => <span className="tabular-nums">{formatMoney(r.credit)}</span>, className: 'hidden md:table-cell' },
  { key: 'balance', header: 'Balance', align: 'right', render: (r) => <span className="tabular-nums font-medium">{formatMoney(r.balance)}</span> }
];

export default function BpLedger() {
  return (
    <FinanceListPage<BpLedgerType, BpLedgerQuery>
      title="Business Partner Ledger"
      fetchFn={getBpLedger}
      buildQuery={(base, filters) => ({
        ...base,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        partnerType: filters.partnerType || undefined,
        businessPartner: filters.businessPartner || undefined
      })}
      columns={columns}
      keyField={(r) => r.bpCode}
      searchPlaceholder="Business partner code or name…"
      filterFields={['date', 'partnerType', 'businessPartner']}
      emptyMessage="No business partner activity found."
      renderMobileCard={(r) => (
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Avatar name={r.bpName || r.bpCode} />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink-primary truncate">{r.bpName || r.bpCode}</p>
            <p className="text-ink-tertiary text-xs">{r.bpCode}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-medium tabular-nums text-ink-primary">{formatMoney(r.balance)}</p>
            <span className={r.type === 'Customer' ? 'badge-success' : 'badge-neutral'}>{r.type}</span>
          </div>
        </div>
      )}
    />
  );
}
