import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getIncomingPayments } from '../../api/sales';
import type { IncomingPayment, PagedResult } from '../../types';
import SearchBar from '../../components/SearchBar';
import Pagination from '../../components/Pagination';
import { ErrorState, EmptyState } from '../../components/StateViews';
import { TableSkeleton } from '../../components/ui/Skeleton';
import ResponsiveTable, { type ColumnDef } from '../../components/ui/ResponsiveTable';
import Avatar from '../../components/ui/Avatar';
import SalesFilterBar, { emptySalesFilters, type SalesFilters } from '../../components/sales/SalesFilterBar';

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

const columns: ColumnDef<IncomingPayment>[] = [
  {
    key: 'customer',
    header: 'Customer',
    render: (r) => (
      <div className="flex items-center gap-3">
        <Avatar name={r.customerName || r.customerCode} size="sm" />
        <div className="min-w-0">
          <p className="font-medium text-ink-primary truncate">{r.customerName || r.customerCode}</p>
          <p className="text-ink-tertiary text-xs">Payment #{r.docNum}</p>
        </div>
      </div>
    )
  },
  { key: 'postingDate', header: 'Posting Date', render: (r) => formatDate(r.postingDate), className: 'hidden md:table-cell text-ink-secondary' },
  { key: 'paymentType', header: 'Payment Type', render: (r) => r.paymentType, className: 'hidden lg:table-cell text-ink-secondary' },
  { key: 'currency', header: 'Currency', render: (r) => r.currency || '—', className: 'hidden lg:table-cell text-ink-secondary' },
  {
    key: 'status',
    header: 'Status',
    render: (r) => <span className={r.status === 'Completed' ? 'badge-success' : 'badge-danger'}>{r.status}</span>
  },
  { key: 'amount', header: 'Amount', align: 'right', render: (r) => <span className="tabular-nums">{r.amount.toLocaleString()}</span> }
];

export default function IncomingPayments() {
  const navigate = useNavigate();
  const [result, setResult] = useState<PagedResult<IncomingPayment> | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<SalesFilters>(emptySalesFilters);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getIncomingPayments({
      page,
      pageSize: 20,
      search: search || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      customer: filters.customer || undefined
    })
      .then(setResult)
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load sales data.'))
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
          <h1 className="text-xl font-semibold text-ink-primary">Incoming Payments</h1>
          {result && <p className="text-sm text-ink-secondary mt-0.5">{result.totalCount.toLocaleString()} total</p>}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <SearchBar value={search} onChange={setSearch} placeholder="Payment #, customer…" />
          <SalesFilterBar
            value={filters}
            onApply={(f) => {
              setFilters(f);
              setPage(1);
            }}
            fields={['date', 'customer']}
          />
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading && <TableSkeleton cols={6} />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}
        {!loading && !error && result && result.items.length === 0 && (
          <EmptyState message="No incoming payments found." description="Try a different search or date range." />
        )}

        {!loading && !error && result && result.items.length > 0 && (
          <>
            <ResponsiveTable
              columns={columns}
              rows={result.items}
              keyField={(r) => String(r.docEntry)}
              onRowClick={(r) => navigate(`/sales/payments/${r.docEntry}`)}
              renderMobileCard={(r) => (
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <Avatar name={r.customerName || r.customerCode} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-primary truncate">{r.customerName || r.customerCode}</p>
                    <p className="text-ink-tertiary text-xs">
                      #{r.docNum} · {r.paymentType}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium tabular-nums text-ink-primary">{r.amount.toLocaleString()}</p>
                    <span className={r.status === 'Completed' ? 'badge-success' : 'badge-danger'}>{r.status}</span>
                  </div>
                </div>
              )}
            />
            <Pagination page={result.page} totalPages={result.totalPages} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
