import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import Modal from '../ui/Modal';

export interface FinanceFilters {
  dateFrom: string;
  dateTo: string;
  account: string;
  businessPartner: string;
  documentType: string;
  debitCredit: string;
  status: string;
  ageingBucket: string;
  partnerType: string;
}

export const emptyFinanceFilters: FinanceFilters = {
  dateFrom: '',
  dateTo: '',
  account: '',
  businessPartner: '',
  documentType: '',
  debitCredit: '',
  status: '',
  ageingBucket: '',
  partnerType: ''
};

export type FinanceFilterField = 'date' | 'account' | 'businessPartner' | 'documentType' | 'debitCredit' | 'ageingBucket' | 'partnerType';

interface FinanceFilterBarProps {
  value: FinanceFilters;
  onApply: (filters: FinanceFilters) => void;
  fields: FinanceFilterField[];
}

export default function FinanceFilterBar({ value, onApply, fields }: FinanceFilterBarProps) {
  const [draft, setDraft] = useState<FinanceFilters>(value);
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeCount = Object.values(value).filter(Boolean).length;

  function set<K extends keyof FinanceFilters>(key: K, v: string) {
    setDraft((d) => ({ ...d, [key]: v }));
  }

  function apply() {
    onApply(draft);
    setMobileOpen(false);
  }

  function clear() {
    setDraft(emptyFinanceFilters);
    onApply(emptyFinanceFilters);
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
      {fields.includes('account') && (
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1">Account code</label>
          <input className="input-field" placeholder="e.g. 100002-2-1" value={draft.account} onChange={(e) => set('account', e.target.value)} />
        </div>
      )}
      {fields.includes('businessPartner') && (
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1">Business partner code</label>
          <input className="input-field" placeholder="e.g. C10001" value={draft.businessPartner} onChange={(e) => set('businessPartner', e.target.value)} />
        </div>
      )}
      {fields.includes('documentType') && (
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1">Document type</label>
          <input className="input-field" placeholder="e.g. 18" value={draft.documentType} onChange={(e) => set('documentType', e.target.value)} />
        </div>
      )}
      {fields.includes('debitCredit') && (
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1">Debit / Credit</label>
          <select className="input-field" value={draft.debitCredit} onChange={(e) => set('debitCredit', e.target.value)}>
            <option value="">All</option>
            <option value="Debit">Debit only</option>
            <option value="Credit">Credit only</option>
          </select>
        </div>
      )}
      {fields.includes('ageingBucket') && (
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1">Ageing bucket</label>
          <select className="input-field" value={draft.ageingBucket} onChange={(e) => set('ageingBucket', e.target.value)}>
            <option value="">All</option>
            <option value="Current">Current</option>
            <option value="1-30">1-30 days</option>
            <option value="31-60">31-60 days</option>
            <option value="61-90">61-90 days</option>
            <option value="91-120">91-120 days</option>
            <option value="120+">120+ days</option>
          </select>
        </div>
      )}
      {fields.includes('partnerType') && (
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1">Partner type</label>
          <select className="input-field" value={draft.partnerType} onChange={(e) => set('partnerType', e.target.value)}>
            <option value="">All</option>
            <option value="Customer">Customer</option>
            <option value="Vendor">Vendor</option>
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

      <Modal open={mobileOpen} onClose={() => setMobileOpen(false)} variant="sheet" labelledBy="finance-filters-label">
        <div className="px-4 py-3.5 border-b border-border flex items-center justify-between">
          <p id="finance-filters-label" className="text-sm font-semibold text-ink-primary">
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
