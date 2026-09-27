import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search, Users, Truck, Package, CornerDownLeft } from 'lucide-react';
import Modal from './ui/Modal';
import { getCustomers } from '../api/customers';
import { getSuppliers } from '../api/suppliers';
import { getItems } from '../api/items';
import type { CustomerListItem, ItemListItem, SupplierListItem } from '../types';

interface Result {
  section: 'Customers' | 'Suppliers' | 'Items';
  key: string;
  title: string;
  subtitle: string;
  onSelect: () => void;
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierListItem[]>([]);
  const [items, setItems] = useState<ItemListItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCustomers([]);
      setSuppliers([]);
      setItems([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setCustomers([]);
      setSuppliers([]);
      setItems([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      Promise.allSettled([
        getCustomers({ page: 1, pageSize: 5, search: query }),
        getSuppliers({ page: 1, pageSize: 5, search: query }),
        getItems({ page: 1, pageSize: 5, search: query })
      ]).then(([c, s, i]) => {
        if (cancelled) return;
        setCustomers(c.status === 'fulfilled' ? c.value.items : []);
        setSuppliers(s.status === 'fulfilled' ? s.value.items : []);
        setItems(i.status === 'fulfilled' ? i.value.items : []);
        setLoading(false);
        setActiveIndex(0);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  const results = useMemo<Result[]>(() => {
    const r: Result[] = [];
    customers.forEach((c) =>
      r.push({
        section: 'Customers',
        key: `c-${c.cardCode}`,
        title: c.cardName || c.cardCode,
        subtitle: c.cardCode,
        onSelect: () => navigate(`/customers/${c.cardCode}`)
      })
    );
    suppliers.forEach((s) =>
      r.push({
        section: 'Suppliers',
        key: `s-${s.cardCode}`,
        title: s.cardName || s.cardCode,
        subtitle: s.cardCode,
        onSelect: () => navigate(`/suppliers/${s.cardCode}`)
      })
    );
    items.forEach((i) =>
      r.push({
        section: 'Items',
        key: `i-${i.itemCode}`,
        title: i.itemName || i.itemCode,
        subtitle: i.itemCode,
        onSelect: () => navigate(`/items/${i.itemCode}`)
      })
    );
    return r;
  }, [customers, suppliers, items, navigate]);

  function select(result: Result) {
    result.onSelect();
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[activeIndex]) {
      e.preventDefault();
      select(results[activeIndex]);
    }
  }

  const sections: { key: Result['section']; icon: React.ElementType }[] = [
    { key: 'Customers', icon: Users },
    { key: 'Suppliers', icon: Truck },
    { key: 'Items', icon: Package }
  ];

  return (
    <Modal open={open} onClose={onClose} variant="top" labelledBy="command-palette-label">
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
        <Search className="h-4.5 w-4.5 text-ink-tertiary shrink-0" />
        <input
          ref={inputRef}
          id="command-palette-label"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search customers, suppliers, items…"
          className="flex-1 bg-transparent border-none outline-none text-sm text-ink-primary placeholder:text-ink-tertiary"
          autoComplete="off"
        />
        {loading && <Loader2 className="h-4 w-4 animate-spin text-ink-tertiary" />}
        <kbd className="hidden sm:inline text-[10px] font-medium text-ink-tertiary border border-border rounded px-1.5 py-0.5">
          ESC
        </kbd>
      </div>

      <div className="overflow-y-auto flex-1 py-2">
        {query.trim().length < 2 && (
          <p className="px-4 py-8 text-sm text-ink-tertiary text-center">
            Type at least 2 characters to search across customers, suppliers, and items.
          </p>
        )}

        {query.trim().length >= 2 && !loading && results.length === 0 && (
          <p className="px-4 py-8 text-sm text-ink-tertiary text-center">No results for "{query}".</p>
        )}

        {sections.map(({ key: sectionKey, icon: SectionIcon }) => {
          const sectionResults = results.filter((r) => r.section === sectionKey);
          if (sectionResults.length === 0) return null;
          return (
            <div key={sectionKey} className="mb-1">
              <p className="px-4 pt-2 pb-1 text-[11px] font-semibold text-ink-tertiary uppercase tracking-wide">{sectionKey}</p>
              {sectionResults.map((r) => {
                const idx = results.indexOf(r);
                return (
                  <button
                    key={r.key}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => select(r)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      idx === activeIndex ? 'bg-surface-tertiary' : ''
                    }`}
                  >
                    <SectionIcon className="h-4 w-4 text-ink-tertiary shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink-primary truncate">{r.title}</span>
                      <span className="block text-xs text-ink-tertiary truncate">{r.subtitle}</span>
                    </span>
                    {idx === activeIndex && <CornerDownLeft className="h-3.5 w-3.5 text-ink-tertiary shrink-0" />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
