import ProductionListPage from '../../components/production/ProductionListPage';
import { getMaterialRequirements } from '../../api/production';
import type { MaterialRequirement, ProductionOrderQuery } from '../../types';
import type { ColumnDef } from '../../components/ui/ResponsiveTable';
import AvailabilityBadge from '../../components/production/AvailabilityBadge';

const columns: ColumnDef<MaterialRequirement>[] = [
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
  { key: 'required', header: 'Required', align: 'right', render: (r) => <span className="tabular-nums">{r.requiredQty.toLocaleString()}</span>, className: 'hidden md:table-cell' },
  { key: 'issued', header: 'Issued', align: 'right', render: (r) => <span className="tabular-nums">{r.issuedQty.toLocaleString()}</span>, className: 'hidden md:table-cell' },
  { key: 'remaining', header: 'Remaining', align: 'right', render: (r) => <span className="tabular-nums font-medium">{Math.max(0, r.remainingQty).toLocaleString()}</span> },
  { key: 'availability', header: 'Availability', render: (r) => <AvailabilityBadge status={r.availabilityStatus} /> }
];

export default function MaterialRequirements() {
  return (
    <ProductionListPage<MaterialRequirement, ProductionOrderQuery>
      title="Material Requirements"
      fetchFn={getMaterialRequirements}
      buildQuery={(base, filters) => ({
        ...base,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        item: filters.item || undefined,
        warehouse: filters.warehouse || undefined
      })}
      columns={columns}
      keyField={(r, i) => `${r.productionOrderDocEntry}-${r.componentItemCode}-${i}`}
      searchPlaceholder="Production order #, finished good, component…"
      filterFields={['date', 'item', 'warehouse']}
      emptyMessage="No material requirements found."
      renderMobileCard={(r) => (
        <div className="px-4 py-3.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="font-medium text-ink-primary truncate">{r.componentItemName || r.componentItemCode}</p>
              <p className="text-ink-tertiary text-xs">
                PO #{r.productionOrderDocNum} · {r.finishedGoodName || r.finishedGoodCode}
              </p>
            </div>
            <AvailabilityBadge status={r.availabilityStatus} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
            <div>
              <p className="text-ink-tertiary">Required</p>
              <p className="font-semibold text-ink-primary tabular-nums">{r.requiredQty.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-ink-tertiary">Issued</p>
              <p className="font-semibold text-ink-primary tabular-nums">{r.issuedQty.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-ink-tertiary">Remaining</p>
              <p className="font-semibold text-ink-primary tabular-nums">{Math.max(0, r.remainingQty).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}
    />
  );
}
