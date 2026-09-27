import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SearchBar from '../SearchBar';
import Pagination from '../Pagination';
import { ErrorState, EmptyState } from '../StateViews';
import { TableSkeleton } from '../ui/Skeleton';
import ResponsiveTable, { type ColumnDef } from '../ui/ResponsiveTable';
import FinanceFilterBar, { emptyFinanceFilters, type FinanceFilters, type FinanceFilterField } from './FinanceFilterBar';
import type { PagedResult } from '../../types';

interface FinanceListPageProps<T, Q> {
  title: string;
  fetchFn: (query: Q) => Promise<PagedResult<T>>;
  buildQuery: (base: { page: number; pageSize: number; search?: string }, filters: FinanceFilters) => Q;
  columns: ColumnDef<T>[];
  keyField: (row: T, index: number) => string;
  routeBase?: string;
  docEntryField?: (row: T) => string | number;
  searchPlaceholder: string;
  filterFields: FinanceFilterField[];
  renderMobileCard: (row: T) => React.ReactNode;
  emptyMessage: string;
  /** Rendered above the table, e.g. summary/ageing cards. */
  headerExtra?: React.ReactNode;
}

export default function FinanceListPage<T, Q>({
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
  emptyMessage,
  headerExtra
}: FinanceListPageProps<T, Q>) {
  const navigate = useNavigate();
  const [result, setResult] = useState<PagedResult<T> | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FinanceFilters>(emptyFinanceFilters);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    fetchFn(buildQuery({ page, pageSize: 20, search: search || undefined }, filters))
      .then(setResult)
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load financial data.'))
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
            <FinanceFilterBar
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

      {headerExtra}

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
