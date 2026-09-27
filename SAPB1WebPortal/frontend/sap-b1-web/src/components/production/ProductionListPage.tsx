import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SearchBar from '../SearchBar';
import Pagination from '../Pagination';
import { ErrorState, EmptyState } from '../StateViews';
import { TableSkeleton } from '../ui/Skeleton';
import ResponsiveTable, { type ColumnDef } from '../ui/ResponsiveTable';
import ProductionFilterBar, { emptyProductionFilters, type ProductionFilters } from './ProductionFilterBar';
import type { PagedResult } from '../../types';

interface ProductionListPageProps<T, Q> {
  title: string;
  fetchFn: (query: Q) => Promise<PagedResult<T>>;
  /** Builds the module-specific query object (BomQuery vs ProductionOrderQuery
   * have different shapes) from the generic page/search/filters state. */
  buildQuery: (base: { page: number; pageSize: number; search?: string }, filters: ProductionFilters) => Q;
  columns: ColumnDef<T>[];
  keyField: (row: T, index: number) => string;
  /** Rows are only clickable when both are supplied — Material Requirements,
   * Consumption and Receipts have no detail page. */
  routeBase?: string;
  docEntryField?: (row: T) => string | number;
  searchPlaceholder: string;
  filterFields: Array<'date' | 'status' | 'item' | 'warehouse' | 'type'>;
  renderMobileCard: (row: T) => React.ReactNode;
  emptyMessage: string;
}

export default function ProductionListPage<T, Q>({
  title,
  fetchFn,
  buildQuery,
  columns,
  keyField,
  routeBase,
  docEntryField,
  searchPlaceholder,
  filterFields,
  renderMobileCard,
  emptyMessage
}: ProductionListPageProps<T, Q>) {
  const navigate = useNavigate();
  const [result, setResult] = useState<PagedResult<T> | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<ProductionFilters>(emptyProductionFilters);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    fetchFn(buildQuery({ page, pageSize: 20, search: search || undefined }, filters))
      .then(setResult)
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load production data.'))
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

  const clickable = Boolean(routeBase && docEntryField);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">{title}</h1>
          {result && <p className="text-sm text-ink-secondary mt-0.5">{result.totalCount.toLocaleString()} total</p>}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <SearchBar value={search} onChange={setSearch} placeholder={searchPlaceholder} />
          {filterFields.length > 0 && (
            <ProductionFilterBar
              value={filters}
              onApply={(f) => {
                setFilters(f);
                setPage(1);
              }}
              fields={filterFields}
            />
          )}
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
              onRowClick={clickable ? (row) => navigate(`${routeBase}/${docEntryField!(row)}`) : undefined}
              renderMobileCard={renderMobileCard}
            />
            <Pagination page={result.page} totalPages={result.totalPages} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
