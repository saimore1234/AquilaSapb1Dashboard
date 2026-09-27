import ProductionListPage from '../../components/production/ProductionListPage';
import { getBoms } from '../../api/production';
import type { Bom, BomQuery } from '../../types';
import type { ColumnDef } from '../../components/ui/ResponsiveTable';
import type { ProductionFilters } from '../../components/production/ProductionFilterBar';
import { Boxes } from 'lucide-react';

const columns: ColumnDef<Bom>[] = [
  {
    key: 'code',
    header: 'Parent Item',
    render: (r) => (
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-info-bg text-info flex items-center justify-center shrink-0">
          <Boxes className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-ink-primary truncate">{r.itemName || r.code}</p>
          <p className="text-ink-tertiary text-xs">{r.code}</p>
        </div>
      </div>
    )
  },
  { key: 'treeType', header: 'BOM Type', render: (r) => <span className="badge-neutral">{r.treeType}</span> },
  { key: 'quantity', header: 'Quantity', align: 'right', render: (r) => <span className="tabular-nums">{r.quantity.toLocaleString()}</span> },
  { key: 'warehouse', header: 'Warehouse', render: (r) => r.warehouse || '—', className: 'hidden lg:table-cell text-ink-secondary' },
  { key: 'componentCount', header: 'Components', align: 'right', render: (r) => r.componentCount, className: 'hidden md:table-cell' }
];

export default function Boms() {
  return (
    <ProductionListPage<Bom, BomQuery>
      title="Bill of Materials"
      fetchFn={getBoms}
      buildQuery={(base, filters: ProductionFilters) => ({ ...base, type: filters.type || undefined })}
      columns={columns}
      keyField={(r) => r.code}
      routeBase="/production/boms"
      docEntryField={(r) => encodeURIComponent(r.code)}
      searchPlaceholder="Item code, item name, BOM code…"
      filterFields={['type']}
      emptyMessage="No BOM found."
      renderMobileCard={(r) => (
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="h-9 w-9 rounded-lg bg-info-bg text-info flex items-center justify-center shrink-0">
            <Boxes className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink-primary truncate">{r.itemName || r.code}</p>
            <p className="text-ink-tertiary text-xs">
              {r.code} · {r.componentCount} component{r.componentCount === 1 ? '' : 's'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-medium tabular-nums text-ink-primary">{r.quantity.toLocaleString()}</p>
            <span className="badge-neutral">{r.treeType}</span>
          </div>
        </div>
      )}
    />
  );
}
