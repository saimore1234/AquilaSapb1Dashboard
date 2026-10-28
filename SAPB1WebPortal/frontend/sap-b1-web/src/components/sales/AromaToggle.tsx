import { useSyncExternalStore } from 'react';

/**
 * One shared "Aroma Code" tick box for every table that has an Aroma Code column (reports, Sales Overview, Items, Inventory).
 * Ticked (the default) = the column is shown; unticked = it is hidden, in the grid and in the CSV export. The choice is remembered on this
 * device and applies to all those tables at once.
 */
const KEY = 'show_aroma_code';
const read = () => {
  try { return localStorage.getItem(KEY) !== '0'; } catch { return true; }
};
let value = read();
const listeners = new Set<() => void>();

export function setShowAroma(next: boolean) {
  value = next;
  try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* storage blocked: the choice just won't be remembered */ }
  listeners.forEach((l) => l());
}

export function useShowAroma(): boolean {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => value,
    () => true
  );
}

export default function AromaToggle({ className = '' }: { className?: string }) {
  const show = useShowAroma();
  return (
    <label className={`inline-flex items-center gap-2 text-sm text-ink-primary cursor-pointer select-none ${className}`} title="Show or hide the Aroma Code column">
      <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={show} onChange={(e) => setShowAroma(e.target.checked)} />
      Aroma Code
    </label>
  );
}
