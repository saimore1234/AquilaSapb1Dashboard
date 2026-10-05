import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { fyStartDate, toIsoDate } from './salesUtils';

/**
 * The ONE global filter of the Sales dashboard/reports: From Date, To Date and
 * Include Tax. Sections read `applied` (what the user last applied); the bar
 * edits a `draft` and only `Apply` promotes it, so nothing reloads half-typed.
 * The applied value survives navigating between Sales pages (session storage).
 */
export interface SalesFilterValue {
  from: string; // yyyy-MM-dd, date only
  to: string;
  includeTax: boolean;
}

interface SalesFiltersContextValue {
  applied: SalesFilterValue;
  draft: SalesFilterValue;
  setDraft: (patch: Partial<SalesFilterValue>) => void;
  apply: () => void;
  error: string | null;
}

// v2: defaults changed (tax excluded) so older stored choices are not carried over.
const STORAGE_KEY = 'sales_global_filters_v2';

const defaults = (): SalesFilterValue => ({
  from: toIsoDate(fyStartDate()),
  to: toIsoDate(new Date()),
  includeTax: false // matches the client turnover report (tax excluded); users can tick Include Tax
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
      const v = JSON.parse(raw) as Partial<SalesFilterValue>;
      const merged = { ...defaults(), ...v } as SalesFilterValue;
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
  error: null
});

export const useSalesFilters = () => useContext(SalesFiltersContext);

export function SalesFilterProvider({ children }: { children: React.ReactNode }) {
  const [applied, setApplied] = useState<SalesFilterValue>(stored);
  const [draft, setDraftState] = useState<SalesFilterValue>(applied);
  const [error, setError] = useState<string | null>(null);

  const setDraft = useCallback((patch: Partial<SalesFilterValue>) => {
    setDraftState((d) => ({ ...d, ...patch }));
    setError(null);
  }, []);

  const apply = useCallback(() => {
    const problem = validate(draft);
    setError(problem);
    if (problem) return; // invalid range: do not run any report
    setApplied(draft);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // The choice just won't survive navigation.
    }
  }, [draft]);

  const value = useMemo(() => ({ applied, draft, setDraft, apply, error }), [applied, draft, setDraft, apply, error]);
  return <SalesFiltersContext.Provider value={value}>{children}</SalesFiltersContext.Provider>;
}

/** Label for the amount basis, used in headings/exports. */
export const taxLabel = (includeTax: boolean) => (includeTax ? 'incl. tax' : 'excl. tax');

/** Global bar: From Date · To Date · Include Tax · Apply. */
export function GlobalSalesFilterBar() {
  const { applied, draft, setDraft, apply, error } = useSalesFilters();
  const dirty = draft.from !== applied.from || draft.to !== applied.to || draft.includeTax !== applied.includeTax;
  const input = 'px-3 py-2 text-sm rounded-lg border border-border-strong bg-surface text-ink-primary';

  return (
    <form
      className="card !py-3 flex flex-wrap items-end gap-x-4 gap-y-3"
      aria-label="Sales period filter"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div className="flex items-center gap-2 text-ink-secondary self-center">
        <CalendarRange className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">Period</span>
      </div>
      <div>
        <label htmlFor="sf-from" className="block text-xs text-ink-secondary mb-1">From Date</label>
        <input id="sf-from" type="date" className={input} value={draft.from} onChange={(e) => setDraft({ from: e.target.value })} />
      </div>
      <div>
        <label htmlFor="sf-to" className="block text-xs text-ink-secondary mb-1">To Date</label>
        <input id="sf-to" type="date" className={input} value={draft.to} onChange={(e) => setDraft({ to: e.target.value })} />
      </div>
      <label className="inline-flex items-center gap-2 text-sm text-ink-primary pb-2 cursor-pointer select-none">
        <input
          type="checkbox"
          className="h-4 w-4 accent-brand-600"
          checked={draft.includeTax}
          onChange={(e) => setDraft({ includeTax: e.target.checked })}
        />
        Include Tax
      </label>
      <button type="submit" className="btn-primary">Apply</button>
      {error ? (
        <p role="alert" className="text-sm text-danger basis-full">{error}</p>
      ) : dirty ? (
        <p className="text-xs text-warning basis-full">Filters changed — click Apply to refresh all sales data.</p>
      ) : null}
    </form>
  );
}
