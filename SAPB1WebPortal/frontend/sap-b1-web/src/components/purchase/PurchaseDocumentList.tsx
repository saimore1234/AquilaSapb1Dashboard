import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SearchBar from '../SearchBar';
import Pagination from '../Pagination';
import { ErrorState, EmptyState } from '../StateViews';
import { TableSkeleton } from '../ui/Skeleton';
import ResponsiveTable, { type ColumnDef } from '../ui/ResponsiveTable';
import PurchaseFilterBar, { emptyPurchaseFilters, type PurchaseFilters } from './PurchaseFilterBar';
import type { PagedResult, PurchaseDocumentQuery } from '../../types';

interface PurchaseDocumentListProps<T> {
  title: string;
  fetchFn: (query: PurchaseDocumentQuery) => Promise<PagedResult<T>>;
  columns: ColumnDef<T>[];
  keyField: (row: T, index: number) => string;
  docEntryField: (row: T) => number;
  routeBase: string;
  searchPlaceholder: string;
  filterFields: Array<'date' | 'status' | 'vendor' | 'buyer' | 'warehouse'>;
  renderMobileCard: (row: T) => React.ReactNode;
  emptyMessage: string;
  /** Optional action rendered next to the title (e.g. a "Create" button). Omitted by every read-only document list. */
  headerAction?: React.ReactNode;
}

export default function PurchaseDocumentList<T>({
  title,
  fetchFn,
  columns,
  keyField,
  docEntryField,
  routeBase,
  searchPlaceholder,
  filterFields,
  renderMobileCard,
  emptyMessage,
  headerAction
}: PurchaseDocumentListProps<T>) {
  const navigate = useNavigate();
  const [result, setResult] = useState<PagedResult<T> | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<PurchaseFilters>(emptyPurchaseFilters);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    fetchFn({
      page,
      pageSize: 20,
      search: search || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      status: filters.status || undefined,
      vendor: filters.vendor || undefined,
      buyer: filters.buyer || undefined,
      warehouse: filters.warehouse || undefined
    })
      .then(setResult)
      .catch((err) => setError(err?.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [page, filters]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      load();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">{title}</h1>
          {result && <p className="text-sm text-ink-secondary mt-0.5">{result.totalCount.toLocaleString()} total</p>}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <SearchBar value={search} onChange={setSearch} placeholder={searchPlaceholder} />
          <PurchaseFilterBar
            value={filters}
            onApply={(f) => {
              setFilters(f);
              setPage(1);
            }}
            fields={filterFields}
          />
          {headerAction}
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading && <TableSkeleton cols={columns.length} />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}
        {!loading && !error && result && result.items.length === 0 && (
          <EmptyState message={emptyMessage} description="Try adjusting your search or filters." />
        )}

        {!loading && !error && result && result.items.length > 0 && (
          <>
            <ResponsiveTable
              columns={columns}
              rows={result.items}
              keyField={keyField}
              onRowClick={(row) => navigate(`${routeBase}/${docEntryField(row)}`)}
              renderMobileCard={renderMobileCard}
            />
            <Pagination page={result.page} totalPages={result.totalPages} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
