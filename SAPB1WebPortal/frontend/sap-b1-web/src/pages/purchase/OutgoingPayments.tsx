import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOutgoingPayments } from '../../api/purchase';
import type { OutgoingPayment, PagedResult } from '../../types';
import SearchBar from '../../components/SearchBar';
import Pagination from '../../components/Pagination';
import { ErrorState, EmptyState } from '../../components/StateViews';
import { TableSkeleton } from '../../components/ui/Skeleton';
import ResponsiveTable, { type ColumnDef } from '../../components/ui/ResponsiveTable';
import Avatar from '../../components/ui/Avatar';
import PurchaseFilterBar, { emptyPurchaseFilters, type PurchaseFilters } from '../../components/purchase/PurchaseFilterBar';

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

const columns: ColumnDef<OutgoingPayment>[] = [
  {
    key: 'vendor',
    header: 'Vendor',
    render: (r) => (
      <div className="flex items-center gap-3">
        <Avatar name={r.vendorName || r.vendorCode} size="sm" />
        <div className="min-w-0">
          <p className="font-medium text-ink-primary truncate">{r.vendorName || r.vendorCode}</p>
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

export default function OutgoingPayments() {
  const navigate = useNavigate();
  const [result, setResult] = useState<PagedResult<OutgoingPayment> | null>(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<PurchaseFilters>(emptyPurchaseFilters);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getOutgoingPayments({
      page,
      pageSize: 20,
      search: search || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      vendor: filters.vendor || undefined
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
          <h1 className="text-xl font-semibold text-ink-primary">Outgoing Payments</h1>
          {result && <p className="text-sm text-ink-secondary mt-0.5">{result.totalCount.toLocaleString()} total</p>}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <SearchBar value={search} onChange={setSearch} placeholder="Payment #, vendor…" />
          <PurchaseFilterBar
            value={filters}
            onApply={(f) => {
              setFilters(f);
              setPage(1);
            }}
            fields={['date', 'vendor']}
          />
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading && <TableSkeleton cols={6} />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}
        {!loading && !error && result && result.items.length === 0 && (
          <EmptyState message="No outgoing payments found." description="Try a different search or date range." />
        )}

        {!loading && !error && result && result.items.length > 0 && (
          <>
            <ResponsiveTable
              columns={columns}
              rows={result.items}
              keyField={(r) => String(r.docEntry)}
              onRowClick={(r) => navigate(`/purchase/payments/${r.docEntry}`)}
              renderMobileCard={(r) => (
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <Avatar name={r.vendorName || r.vendorCode} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-primary truncate">{r.vendorName || r.vendorCode}</p>
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

