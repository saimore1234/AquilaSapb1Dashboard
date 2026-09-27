import ProductionListPage from '../../components/production/ProductionListPage';
import { getConsumption } from '../../api/production';
import type { MaterialConsumption, ProductionOrderQuery } from '../../types';
import type { ColumnDef } from '../../components/ui/ResponsiveTable';

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

function varianceClass(v: number) {
  if (v > 0) return 'text-danger';
  if (v < 0) return 'text-ink-secondary';
  return 'text-ink-secondary';
}

const columns: ColumnDef<MaterialConsumption>[] = [
  {
    key: 'order',
    header: 'Production Order',
    render: (r) => (
      <div className="min-w-0">
        <p className="font-medium text-ink-primary">#{r.productionOrderDocNum}</p>
        <p className="text-ink-tertiary text-xs truncate">{r.finishedGoodName || r.finishedGoodCode}</p>
      </div>
    )
  },
  {
    key: 'component',
    header: 'Component',
    render: (r) => (
      <div className="min-w-0">
        <p className="font-medium text-ink-primary truncate">{r.componentItemName || r.componentItemCode}</p>
        <p className="text-ink-tertiary text-xs">{r.componentItemCode}</p>
      </div>
    )
  },
  { key: 'warehouse', header: 'Warehouse', render: (r) => r.warehouse || '—', className: 'hidden lg:table-cell text-ink-secondary' },
  { key: 'postingDate', header: 'Date', render: (r) => formatDate(r.postingDate), className: 'hidden md:table-cell text-ink-secondary' },
  { key: 'planned', header: 'Planned', align: 'right', render: (r) => <span className="tabular-nums">{r.plannedQty.toLocaleString()}</span> },
  { key: 'issued', header: 'Issued', align: 'right', render: (r) => <span className="tabular-nums">{r.issuedQty.toLocaleString()}</span> },
  {
    key: 'variance',
    header: 'Variance',
    align: 'right',
    render: (r) => (
      <span className={`tabular-nums font-medium ${varianceClass(r.variance)}`}>
        {r.variance > 0 ? '+' : ''}
        {r.variance.toLocaleString()}
      </span>
    )
  }
];

export default function Consumption() {
  return (
    <ProductionListPage<MaterialConsumption, ProductionOrderQuery>
      title="Component Consumption"
      fetchFn={getConsumption}
      buildQuery={(base, filters) => ({
        ...base,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        status: filters.status || undefined,
        item: filters.item || undefined,
        warehouse: filters.warehouse || undefined
      })}
      columns={columns}
      keyField={(r, i) => `${r.productionOrderDocEntry}-${r.componentItemCode}-${i}`}
      searchPlaceholder="Production order #, finished good, component…"
      filterFields={['date', 'status', 'item', 'warehouse']}
      emptyMessage="No consumption records found."
      renderMobileCard={(r) => (
        <div className="px-4 py-3.5 space-y-1.5">
          <div className="min-w-0">
            <p className="font-medium text-ink-primary truncate">{r.componentItemName || r.componentItemCode}</p>
            <p className="text-ink-tertiary text-xs">
              PO #{r.productionOrderDocNum} · {formatDate(r.postingDate)}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
            <div>
              <p className="text-ink-tertiary">Planned</p>
              <p className="font-semibold text-ink-primary tabular-nums">{r.plannedQty.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-ink-tertiary">Issued</p>
              <p className="font-semibold text-ink-primary tabular-nums">{r.issuedQty.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-ink-tertiary">Variance</p>
              <p className={`font-semibold tabular-nums ${varianceClass(r.variance)}`}>
                {r.variance > 0 ? '+' : ''}
                {r.variance.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}
    />
  );
}
