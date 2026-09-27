import ProductionListPage from '../../components/production/ProductionListPage';
import { getReceipts } from '../../api/production';
import type { ProductionReceipt, ProductionOrderQuery } from '../../types';
import type { ColumnDef } from '../../components/ui/ResponsiveTable';
import { PackagePlus } from 'lucide-react';

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

const columns: ColumnDef<ProductionReceipt>[] = [
  {
    key: 'item',
    header: 'Finished Good',
    render: (r) => (
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-success-bg text-success flex items-center justify-center shrink-0">
          <PackagePlus className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-ink-primary truncate">{r.itemName || r.itemCode}</p>
          <p className="text-ink-tertiary text-xs">Receipt #{r.transNum}</p>
        </div>
      </div>
    )
  },
  {
    key: 'order',
    header: 'Production Order',
    render: (r) => (r.productionOrderDocNum ? `#${r.productionOrderDocNum}` : '—'),
    className: 'hidden md:table-cell text-ink-secondary'
  },
  { key: 'warehouse', header: 'Warehouse', render: (r) => r.warehouse || '—', className: 'hidden lg:table-cell text-ink-secondary' },
  { key: 'postingDate', header: 'Posting Date', render: (r) => formatDate(r.postingDate), className: 'hidden md:table-cell text-ink-secondary' },
  { key: 'quantity', header: 'Quantity', align: 'right', render: (r) => <span className="tabular-nums font-medium">{r.quantity.toLocaleString()}</span> }
];

export default function Receipts() {
  return (
    <ProductionListPage<ProductionReceipt, ProductionOrderQuery>
      title="Receipt from Production"
      fetchFn={getReceipts}
      buildQuery={(base, filters) => ({
        ...base,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        item: filters.item || undefined,
        warehouse: filters.warehouse || undefined
      })}
      columns={columns}
      keyField={(r) => String(r.transNum)}
      searchPlaceholder="Receipt #, item code, item name…"
      filterFields={['date', 'item', 'warehouse']}
      emptyMessage="No production receipts found."
      renderMobileCard={(r) => (
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="h-9 w-9 rounded-lg bg-success-bg text-success flex items-center justify-center shrink-0">
            <PackagePlus className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink-primary truncate">{r.itemName || r.itemCode}</p>
            <p className="text-ink-tertiary text-xs">
              {r.productionOrderDocNum ? `PO #${r.productionOrderDocNum} · ` : ''}
              {formatDate(r.postingDate)}
            </p>
          </div>
          <p className="text-sm font-semibold tabular-nums text-ink-primary shrink-0">{r.quantity.toLocaleString()}</p>
        </div>
      )}
    />
  );
}
