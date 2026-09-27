import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import Modal from '../ui/Modal';

export interface ProductionFilters {
  dateFrom: string;
  dateTo: string;
  status: string;
  item: string;
  warehouse: string;
  type: string;
}

export const emptyProductionFilters: ProductionFilters = {
  dateFrom: '',
  dateTo: '',
  status: '',
  item: '',
  warehouse: '',
  type: ''
};

interface ProductionFilterBarProps {
  value: ProductionFilters;
  onApply: (filters: ProductionFilters) => void;
  fields: Array<'date' | 'status' | 'item' | 'warehouse' | 'type'>;
}

export default function ProductionFilterBar({ value, onApply, fields }: ProductionFilterBarProps) {
  const [draft, setDraft] = useState<ProductionFilters>(value);
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeCount = Object.values(value).filter(Boolean).length;

  function set<K extends keyof ProductionFilters>(key: K, v: string) {
    setDraft((d) => ({ ...d, [key]: v }));
  }

  function apply() {
    onApply(draft);
    setMobileOpen(false);
  }

  function clear() {
    setDraft(emptyProductionFilters);
    onApply(emptyProductionFilters);
    setMobileOpen(false);
  }

  const fieldInputs = (
    <>
      {fields.includes('date') && (
        <>
          <div>
            <label className="block text-xs font-medium text-ink-secondary mb-1">Date from</label>
            <input type="date" className="input-field" value={draft.dateFrom} onChange={(e) => set('dateFrom', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-secondary mb-1">Date to</label>
            <input type="date" className="input-field" value={draft.dateTo} onChange={(e) => set('dateTo', e.target.value)} />
          </div>
        </>
      )}
      {fields.includes('status') && (
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1">Status</label>
          <select className="input-field" value={draft.status} onChange={(e) => set('status', e.target.value)}>
            <option value="">All</option>
            <option value="Planned">Planned</option>
            <option value="Released">Released</option>
            <option value="Closed">Closed</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      )}
      {fields.includes('item') && (
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1">Item code</label>
          <input className="input-field" placeholder="e.g. FG-001" value={draft.item} onChange={(e) => set('item', e.target.value)} />
        </div>
      )}
      {fields.includes('warehouse') && (
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1">Warehouse</label>
          <input className="input-field" placeholder="e.g. WH01" value={draft.warehouse} onChange={(e) => set('warehouse', e.target.value)} />
        </div>
      )}
      {fields.includes('type') && (
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1">BOM Type</label>
          <select className="input-field" value={draft.type} onChange={(e) => set('type', e.target.value)}>
            <option value="">All</option>
            <option value="Production">Production</option>
            <option value="Sales">Sales</option>
          </select>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop: inline bar */}
      <div className="hidden lg:flex items-end gap-3 flex-wrap bg-surface border border-border rounded-xl p-3">
        {fieldInputs}
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={clear}>
            Clear
          </button>
          <button className="btn-primary" onClick={apply}>
            Apply
          </button>
        </div>
      </div>

      {/* Mobile: filter button + sheet */}
      <button
        onClick={() => {
          setDraft(value);
          setMobileOpen(true);
        }}
        className="lg:hidden btn-secondary relative"
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filters
        {activeCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-brand-600 text-white text-[10px] flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>

      <Modal open={mobileOpen} onClose={() => setMobileOpen(false)} variant="sheet" labelledBy="production-filters-label">
        <div className="px-4 py-3.5 border-b border-border flex items-center justify-between">
          <p id="production-filters-label" className="text-sm font-semibold text-ink-primary">
            Filters
          </p>
          <button onClick={() => setMobileOpen(false)} aria-label="Close filters">
            <X className="h-4 w-4 text-ink-tertiary" />
          </button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto">{fieldInputs}</div>
        <div className="p-4 border-t border-border flex gap-2">
          <button className="btn-secondary flex-1" onClick={clear}>
            Clear
          </button>
          <button className="btn-primary flex-1" onClick={apply}>
            Apply
          </button>
        </div>
      </Modal>
    </>
  );
}
