import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { fyStartDate, toIsoDate } from './salesUtils';
import { formatPeriod } from './formatters';
import { useReportFilterOptions } from './reportOptions';

/**
 * The ONE global filter of the Sales dashboard, overview and reports: period, tax basis and the shared dimensions. Sections read
 * `applied` (what the user last applied); the bar edits a `draft` and only Apply promotes it, so nothing reloads half-typed.
 * Each report uses only the dimensions that are valid for its business definition (e.g. a customer balance ignores product
 * category). The applied value survives navigating between Sales pages (session storage).
 */
export interface SalesFilterValue {
  from: string; // yyyy-MM-dd, date only
  to: string;
  includeTax: boolean;
  /** Net of credit notes — the reconciled sales basis. */
  netOfCreditNotes: boolean;
  /** OLCT.Code of a unit; '' = all units. */
  unit: string;
  customerGroup: string;
  salesperson: string;
  category: string;
}

interface SalesFiltersContextValue {
  applied: SalesFilterValue;
  draft: SalesFilterValue;
  setDraft: (patch: Partial<SalesFilterValue>) => void;
  apply: () => void;
  /** Change and apply immediately (unit cards on the dashboard). */
  applyNow: (patch: Partial<SalesFilterValue>) => void;
  /** Back to the agreed defaults (financial-year start to today, tax excluded, net of credit notes, no dimensions). */
  reset: () => void;
  error: string | null;
}

// v3: dimensions added.
const STORAGE_KEY = 'sales_global_filters_v3';

const defaults = (): SalesFilterValue => ({
  from: toIsoDate(fyStartDate()),
  to: toIsoDate(new Date()),
  includeTax: false, // matches the client turnover report (tax excluded); users can tick Include tax
  netOfCreditNotes: true,
  unit: '',
  customerGroup: '',
  salesperson: '',
  category: ''
});

function validate(v: SalesFilterValue): string | null {
  if (!v.from || !v.to) return 'Please select both From Date and To Date.';
  if (v.from > v.to) return 'From Date must be on or before To Date.';
  return null;
}

function stored(): SalesFilterValue {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const merged = { ...defaults(), ...(JSON.parse(raw) as Partial<SalesFilterValue>) };
      if (typeof merged.includeTax === 'boolean' && !validate(merged)) return merged;
    }
  } catch {
    // Storage unavailable or corrupt — fall back to the defaults.
  }
  return defaults();
}

const SalesFiltersContext = createContext<SalesFiltersContextValue>({
  applied: defaults(),
  draft: defaults(),
  setDraft: () => {},
  apply: () => {},
  applyNow: () => {},
  reset: () => {},
  error: null
});

export const useSalesFilters = () => useContext(SalesFiltersContext);

export function SalesFilterProvider({ children }: { children: React.ReactNode }) {
  const [applied, setApplied] = useState<SalesFilterValue>(stored);
  const [draft, setDraftState] = useState<SalesFilterValue>(applied);
  const [error, setError] = useState<string | null>(null);

  const persist = (v: SalesFilterValue) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    } catch {
      // The choice just won't survive navigation.
    }
  };

  const setDraft = useCallback((patch: Partial<SalesFilterValue>) => {
    setDraftState((d) => ({ ...d, ...patch }));
    setError(null);
  }, []);

  const apply = useCallback(() => {
    const problem = validate(draft);
    setError(problem);
    if (problem) return; // invalid range: do not run any report
    setApplied(draft);
    persist(draft);
  }, [draft]);

  const applyNow = useCallback((patch: Partial<SalesFilterValue>) => {
    const next = { ...draft, ...patch };
    const problem = validate(next);
    setError(problem);
    if (problem) return;
    setDraftState(next);
    setApplied(next);
    persist(next);
  }, [draft]);

  const reset = useCallback(() => {
    const d = defaults();
    setDraftState(d);
    setApplied(d);
    setError(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // nothing stored to clear
    }
  }, []);

  const value = useMemo(() => ({ applied, draft, setDraft, apply, applyNow, reset, error }), [applied, draft, setDraft, apply, applyNow, reset, error]);
  return <SalesFiltersContext.Provider value={value}>{children}</SalesFiltersContext.Provider>;
}

/** dd-mm-yyyy for a yyyy-MM-dd string (no timezone maths). */
export const dmy = (iso: string) => iso.slice(0, 10).split('-').reverse().join('-');

/** Label for the amount basis, used in headings/exports. */
export const taxLabel = (includeTax: boolean) => (includeTax ? 'incl. tax' : 'excl. tax');

/** Global bar: period, tax and credit-note basis, plus the shared dimensions. Apply / Reset, with the active selection always visible. */
export function GlobalSalesFilterBar({ showDimensions = true }: { showDimensions?: boolean }) {
  const { applied, draft, setDraft, apply, reset, error } = useSalesFilters();
  const options = useReportFilterOptions();
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const unitName = (code: string) => options?.units.find((u) => String(u.code) === code);

  return (
    <form
      className="panel px-3 py-2.5 flex flex-wrap items-end gap-x-3 gap-y-2"
      aria-label="Sales filters"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div>
        <label htmlFor="sf-from" className="ctl-label">From date</label>
        <input id="sf-from" type="date" className="ctl w-[9.5rem]" value={draft.from} max={draft.to || undefined} onChange={(e) => setDraft({ from: e.target.value })} />
      </div>
      <div>
        <label htmlFor="sf-to" className="ctl-label">To date</label>
        <input id="sf-to" type="date" className="ctl w-[9.5rem]" value={draft.to} min={draft.from || undefined} onChange={(e) => setDraft({ to: e.target.value })} />
      </div>
      {showDimensions && (
        <>
          <div>
            <label htmlFor="sf-unit" className="ctl-label">Unit</label>
            <select id="sf-unit" className="ctl w-44" value={draft.unit} onChange={(e) => setDraft({ unit: e.target.value })}>
              <option value="">All units</option>
              {options?.units.map((u) => <option key={u.code} value={u.code}>{u.label || u.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="sf-grp" className="ctl-label">Customer group</label>
            <select id="sf-grp" className="ctl w-40" value={draft.customerGroup} onChange={(e) => setDraft({ customerGroup: e.target.value })}>
              <option value="">All groups</option>
              {options?.customerGroups.map((g) => <option key={g.code} value={g.code}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="sf-sp" className="ctl-label">Salesperson</label>
            <select id="sf-sp" className="ctl w-44" value={draft.salesperson} onChange={(e) => setDraft({ salesperson: e.target.value })}>
              <option value="">All salespersons</option>
              {options?.salespersons.map((s) => <option key={s.code} value={s.code}>{s.name}{s.active ? '' : ' (inactive)'}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="sf-cat" className="ctl-label">Product category</label>
            <select id="sf-cat" className="ctl w-40" value={draft.category} onChange={(e) => setDraft({ category: e.target.value })}>
              <option value="">All categories</option>
              {options?.productCategories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </>
      )}
      <label className="ctl inline-flex items-center gap-2 cursor-pointer select-none" title="Include tax in the sales amounts instead of excluding it">
        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={draft.includeTax} onChange={(e) => setDraft({ includeTax: e.target.checked })} />
        Include tax
      </label>
      <label className="ctl inline-flex items-center gap-2 cursor-pointer select-none" title="Invoice lines minus credit memos, header discount deducted, no freight or rounding (the reconciled sales basis)">
        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={draft.netOfCreditNotes} onChange={(e) => setDraft({ netOfCreditNotes: e.target.checked })} />
        Net of credit notes
      </label>
      <button type="submit" className="btn-primary btn-compact">Apply</button>
      <button type="button" className="btn-secondary btn-compact" onClick={reset}>Reset</button>
      <p className="basis-full text-xs text-ink-secondary" aria-live="polite">
        <span className="uppercase tracking-wide text-ink-tertiary">Selected</span>{' '}
        <strong className="text-sm text-ink-primary tabular-nums">{formatPeriod(applied.from, applied.to)}</strong>
        <span className="text-ink-tertiary">
          {' '}· {applied.unit ? (unitName(applied.unit)?.label || unitName(applied.unit)?.name || 'selected unit') : 'all units'} · amounts {taxLabel(applied.includeTax)}
          {applied.netOfCreditNotes ? ' · net of credit notes' : ' · invoices only'}
        </span>
      </p>
      {error ? (
        <p role="alert" className="text-sm text-danger basis-full">{error}</p>
      ) : dirty ? (
        <p className="text-xs text-warning basis-full">Filters changed — click Apply to refresh the data.</p>
      ) : null}
    </form>
  );
}
