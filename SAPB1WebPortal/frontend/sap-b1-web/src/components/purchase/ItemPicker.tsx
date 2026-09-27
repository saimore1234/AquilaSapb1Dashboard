import { useEffect, useRef, useState } from 'react';
import { Search, Loader2, Package } from 'lucide-react';
import Modal from '../ui/Modal';
import Pagination from '../Pagination';
import { getItems } from '../../api/items';
import type { ItemListItem } from '../../types';

interface ItemPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (item: ItemListItem) => void;
}

/** Choose-from-list style item search, reusing the existing GET /api/items — no
 * arbitrary item codes: a line's item always comes from a real, selected record. */
export default function ItemPicker({ open, onClose, onSelect }: ItemPickerProps) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ItemListItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setPage(1);
      setItems([]);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      getItems({ page, pageSize: 10, search: query || undefined, active: true })
        .then((result) => {
          if (cancelled) return;
          setItems(result.items);
          setTotalPages(result.totalPages);
          setError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err?.response?.data?.message || err.message || 'Failed to search items.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, page, open]);

  function handleSelect(item: ItemListItem) {
    onSelect(item);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} variant="top" labelledBy="item-picker-label">
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
        <Search className="h-4.5 w-4.5 text-ink-tertiary shrink-0" />
        <input
          ref={inputRef}
          id="item-picker-label"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search by item code or name…"
          className="flex-1 bg-transparent border-none outline-none text-sm text-ink-primary placeholder:text-ink-tertiary"
          autoComplete="off"
        />
        {loading && <Loader2 className="h-4 w-4 animate-spin text-ink-tertiary" />}
      </div>

      <div className="overflow-y-auto flex-1 py-2 min-h-[200px]">
        {error && <p className="px-4 py-8 text-sm text-danger text-center">{error}</p>}
        {!error && !loading && items.length === 0 && (
          <p className="px-4 py-8 text-sm text-ink-tertiary text-center">
            {query ? `No active items match "${query}".` : 'Start typing to search items.'}
          </p>
        )}
        {!error &&
          items.map((item) => (
            <button
              key={item.itemCode}
              onClick={() => handleSelect(item)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-tertiary transition-colors"
            >
              <Package className="h-4 w-4 text-ink-tertiary shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink-primary truncate">{item.itemName || item.itemCode}</span>
                <span className="block text-xs text-ink-tertiary truncate">
                  {item.itemCode} · Available {item.available.toLocaleString()} {item.inventoryUom || ''}
                </span>
              </span>
            </button>
          ))}
      </div>

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}
    </Modal>
  );
}
