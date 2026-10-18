import { useEffect, useRef, useState } from 'react';
import { searchTargetItems } from '../../api/sales';
import type { SalesTargetItemOption } from '../../types';

const PAGE = 50;

interface Props {
  /** Currently chosen item (shown in the box); null = nothing chosen. */
  value: { code: string; name: string | null } | null;
  onSelect: (item: SalesTargetItemOption) => void;
  /** Item codes already used elsewhere on the target — they are hidden from the results. */
  excludeCodes?: string[];
  placeholder?: string;
  className?: string;
  /** Show a "clear" choice (used by the list filter). */
  onClear?: () => void;
  ariaLabel?: string;
}

/**
 * Searchable SAP item dropdown. Items are never loaded in bulk: each keystroke (debounced) asks the backend for the
 * next 50 matches of the SAP Item Master (code or name; sales items by default, all items on request), and "Load more" pages through the rest, so it works for any
 * item-master size.
 */
export default function ItemPicker({ value, onSelect, excludeCodes = [], placeholder = 'Search item code or name', className = '', onClear, ariaLabel }: Props) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [results, setResults] = useState<SalesTargetItemOption[]>([]);
  const [error, setError] = useState(false);
  const [allItems, setAllItems] = useState(false); // include purchase-only / non-sales items
  const wrap = useRef<HTMLDivElement>(null);

  // A new search (or opening the list) restarts from the first page.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(false);
    const t = setTimeout(() => {
      searchTargetItems(term.trim(), PAGE, 0, allItems)
        .then((r) => {
          setResults(r);
          setMore(r.length === PAGE);
        })
        .catch(() => {
          setResults([]);
          setMore(false);
          setError(true);
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [term, open, allItems]);

  function loadMore() {
    setLoading(true);
    searchTargetItems(term.trim(), PAGE, results.length, allItems)
      .then((r) => {
        setResults((cur) => [...cur, ...r]);
        setMore(r.length === PAGE);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const shown = results.filter((r) => !excludeCodes.some((c) => c.toLowerCase() === r.code.toLowerCase()));
  const input = 'px-3 py-2 text-sm rounded-lg border border-border-strong bg-surface text-ink-primary w-full min-w-0';

  return (
    <div className={`relative ${className}`} ref={wrap}>
      <input
        className={input}
        aria-label={ariaLabel ?? 'Item'}
        autoComplete="off"
        placeholder={value ? `${value.code} — ${value.name ?? ''}` : placeholder}
        value={open ? term : value ? `${value.code} — ${value.name ?? ''}` : ''}
        onFocus={() => { setTerm(''); setOpen(true); }}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
      />
      {open && (
        <ul className="absolute z-30 mt-1 w-full min-w-[20rem] max-h-72 overflow-auto rounded-lg border border-border-strong bg-surface shadow-elevated">
          <li className="px-3 py-2 border-b border-border sticky top-0 bg-surface">
            <label className="flex items-center gap-2 text-xs text-ink-secondary cursor-pointer select-none">
              <input type="checkbox" className="h-3.5 w-3.5 accent-brand-600" checked={allItems} onChange={(e) => setAllItems(e.target.checked)} />
              Include non-sales items (purchase / raw material)
            </label>
          </li>
          {onClear && value && (
            <li><button type="button" className="w-full text-left px-3 py-2 text-sm text-brand-600 dark:text-brand-400 hover:bg-surface-tertiary" onClick={() => { onClear(); setOpen(false); }}>Clear item filter</button></li>
          )}
          {error && shown.length === 0 ? (
            <li className="px-3 py-2 text-sm text-danger">Couldn’t load items. Try again.</li>
          ) : loading && shown.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-tertiary">Searching SAP items…</li>
          ) : shown.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-tertiary">{allItems ? 'No matching items.' : 'No matching sales items. Tick “Include non-sales items” to search all.'}</li>
          ) : (
            <>
              {shown.map((it) => (
                <li key={it.code}>
                  <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-surface-tertiary" onClick={() => { onSelect(it); setOpen(false); }}>
                    <span className="text-ink-primary font-medium">{it.code}</span> <span className="text-ink-secondary">{it.name}</span>
                    <span className="block text-xs text-ink-tertiary">{[it.group, it.uom].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              ))}
              <li className="px-3 py-2 text-xs text-ink-tertiary border-t border-border flex items-center justify-between gap-2">
                <span>{results.length} loaded{more ? ' — more available' : ' — end of list'}</span>
                {more && (
                  <button type="button" className="text-sm text-brand-600 dark:text-brand-400 hover:underline" disabled={loading} onClick={loadMore}>
                    {loading ? 'Loading…' : 'Load more'}
                  </button>
                )}
              </li>
            </>
          )}
        </ul>
      )}
    </div>
  );
}
