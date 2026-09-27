import ProductionListPage from '../../components/production/ProductionListPage';
import { getProductionOrders } from '../../api/production';
import type { ProductionOrder, ProductionOrderQuery } from '../../types';
import type { ColumnDef } from '../../components/ui/ResponsiveTable';
import { Factory } from 'lucide-react';

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

function statusBadgeClass(status: string) {
  if (status === 'Released') return 'badge-success';
  if (status === 'Closed') return 'badge-neutral';
  if (status === 'Cancelled') return 'badge-danger';
  return 'badge-warning'; // Planned
}

const columns: ColumnDef<ProductionOrder>[] = [
  {
    key: 'item',
    header: 'Production Order',
    render: (r) => (
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-info-bg text-info flex items-center justify-center shrink-0">
          <Factory className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-ink-primary truncate">{r.itemName || r.itemCode}</p>
          <p className="text-ink-tertiary text-xs">PO #{r.docNum}</p>
        </div>
      </div>
    )
  },
  { key: 'postingDate', header: 'Posting Date', render: (r) => formatDate(r.postingDate), className: 'hidden md:table-cell text-ink-secondary' },
  { key: 'dueDate', header: 'Due Date', render: (r) => formatDate(r.dueDate), className: 'hidden lg:table-cell text-ink-secondary' },
  { key: 'plannedQty', header: 'Planned', align: 'right', render: (r) => <span className="tabular-nums">{r.plannedQty.toLocaleString()}</span>, className: 'hidden md:table-cell' },
  { key: 'completedQty', header: 'Produced', align: 'right', render: (r) => <span className="tabular-nums text-success">{r.completedQty.toLocaleString()}</span> },
  { key: 'remainingQty', header: 'Remaining', align: 'right', render: (r) => <span className="tabular-nums">{Math.max(0, r.remainingQty).toLocaleString()}</span>, className: 'hidden lg:table-cell' },
  { key: 'warehouse', header: 'Warehouse', render: (r) => r.warehouse || '—', className: 'hidden lg:table-cell text-ink-secondary' },
  { key: 'status', header: 'Status', render: (r) => <span className={statusBadgeClass(r.status)}>{r.status}</span> }
];

export default function ProductionOrders() {
  return (
    <ProductionListPage<ProductionOrder, ProductionOrderQuery>
      title="Production Orders"
      fetchFn={getProductionOrders}
      buildQuery={(base, filters) => ({
        ...base,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        status: filters.status || undefined,
        item: filters.item || undefined,
        warehouse: filters.warehouse || undefined
      })}
      columns={columns}
      keyField={(r) => String(r.docEntry)}
      routeBase="/production/orders"
      docEntryField={(r) => r.docEntry}
      searchPlaceholder="Production order #, item code, item name…"
      filterFields={['date', 'status', 'item', 'warehouse']}
      emptyMessage="No production orders found."
      renderMobileCard={(r) => {
        const pct = r.plannedQty > 0 ? Math.round((r.completedQty / r.plannedQty) * 100) : 0;
        return (
          <div className="px-4 py-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="font-medium text-ink-primary truncate">{r.itemName || r.itemCode}</p>
                <p className="text-ink-tertiary text-xs">
                  #{r.docNum} · {formatDate(r.postingDate)}
                </p>
              </div>
              <span className={statusBadgeClass(r.status)}>{r.status}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <p className="text-ink-tertiary">Planned</p>
                <p className="font-semibold text-ink-primary tabular-nums">{r.plannedQty.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-ink-tertiary">Produced</p>
                <p className="font-semibold text-success tabular-nums">{r.completedQty.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-ink-tertiary">Remaining</p>
                <p className="font-semibold text-ink-primary tabular-nums">{Math.max(0, r.remainingQty).toLocaleString()}</p>
              </div>
            </div>
            <div className="h-1.5 w-full rounded-full bg-surface-tertiary overflow-hidden">
              <div className={`h-full rounded-full ${pct >= 100 ? 'bg-success' : 'bg-brand-500'}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
            </div>
          </div>
        );
      }}
    />
  );
}
