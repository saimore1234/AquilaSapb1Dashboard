import { useEffect, useMemo, useState } from 'react';
import { Package, Boxes, PackageCheck, AlertTriangle, PackageX } from 'lucide-react';
import { getInventory } from '../api/inventory';
import type { InventoryListItem, PagedResult } from '../types';
import SearchBar from '../components/SearchBar';
import Pagination from '../components/Pagination';
import { StockStatusBadge } from '../components/StatusBadge';
import { ErrorState, EmptyState } from '../components/StateViews';
import { TableSkeleton, Skeleton } from '../components/ui/Skeleton';
import ResponsiveTable, { type ColumnDef } from '../components/ui/ResponsiveTable';
import StatCard from '../components/StatCard';

export default function Inventory() {
  const [result, setResult] = useState<PagedResult<InventoryListItem> | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getInventory({
      page,
      pageSize: 20,
      search: search || undefined,
      status: status === 'all' ? undefined : status
    })
      .then(setResult)
      .catch((err) => setError(err?.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [page, status]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      load();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Summary cards computed from the current page — a full cross-warehouse
  // total isn't returned by GET /api/inventory (it's paginated), so these
  // reflect what's visibly loaded rather than a separate summary endpoint.
  const pageSummary = useMemo(() => {
    if (!result) return null;
    return result.items.reduce(
      (acc, r) => {
        acc.onHand += r.onHand;
        acc.available += r.available;
        if (r.stockStatus === 'Low Stock') acc.low += 1;
        if (r.stockStatus === 'Out of Stock') acc.out += 1;
        return acc;
      },
      { onHand: 0, available: 0, low: 0, out: 0 }
    );
  }, [result]);

  const columns: ColumnDef<InventoryListItem>[] = [
    {
      key: 'item',
      header: 'Item',
      render: (row) => (
        <div>
          <p className="font-medium text-ink-primary">{row.itemName}</p>
          <p className="text-ink-tertiary text-xs">{row.itemCode}</p>
        </div>
      )
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      render: (row) => row.warehouseName || row.warehouseCode,
      className: 'hidden md:table-cell text-ink-secondary'
    },
    { key: 'onHand', header: 'On Hand', align: 'right', render: (row) => <span className="tabular-nums">{row.onHand.toLocaleString()}</span> },
    {
      key: 'committed',
      header: 'Committed',
      align: 'right',
      render: (row) => <span className="tabular-nums">{row.committed.toLocaleString()}</span>,
      className: 'hidden lg:table-cell'
    },
    {
      key: 'ordered',
      header: 'Ordered',
      align: 'right',
      render: (row) => <span className="tabular-nums">{row.ordered.toLocaleString()}</span>,
      className: 'hidden lg:table-cell'
    },
    { key: 'available', header: 'Available', align: 'right', render: (row) => <span className="tabular-nums">{row.available.toLocaleString()}</span> },
    {
      key: 'stockValue',
      header: 'Stock Value',
      align: 'right',
      render: (row) => <span className="tabular-nums">{row.stockValue.toLocaleString()}</span>,
      className: 'hidden md:table-cell'
    },
    { key: 'status', header: 'Status', render: (row) => <StockStatusBadge status={row.stockStatus} /> }
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-primary">Inventory</h1>
        {result && <p className="text-sm text-ink-secondary mt-0.5">{result.totalCount.toLocaleString()} stock records</p>}
      </div>

      {loading && !result ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card">
              <Skeleton className="h-3 w-20 mb-3" />
              <Skeleton className="h-7 w-16" />
            </div>
          ))}
        </div>
      ) : pageSummary ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="On Hand (page)" value={pageSummary.onHand.toLocaleString()} icon={Boxes} accent="blue" />
          <StatCard label="Available (page)" value={pageSummary.available.toLocaleString()} icon={PackageCheck} accent="green" />
          <StatCard label="Low Stock (page)" value={pageSummary.low} icon={AlertTriangle} accent="amber" />
          <StatCard label="Out of Stock (page)" value={pageSummary.out} icon={PackageX} accent="red" />
        </div>
      ) : null}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          <SearchBar value={search} onChange={setSearch} placeholder="Item code or name…" />
          <select className="input-field w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="In Stock">In Stock</option>
            <option value="Low Stock">Low Stock</option>
            <option value="Out of Stock">Out of Stock</option>
          </select>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading && <TableSkeleton cols={8} />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}
        {!loading && !error && result && result.items.length === 0 && (
          <EmptyState message="No stock records match your filters." description="Try a different search term or status." />
        )}

        {!loading && !error && result && result.items.length > 0 && (
          <>
            <ResponsiveTable
              columns={columns}
              rows={result.items}
              keyField={(row, idx = 0) => `${row.itemCode}-${row.warehouseCode}-${idx}`}
              renderMobileCard={(row) => (
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <div className="h-9 w-9 rounded-lg bg-surface-tertiary text-ink-tertiary flex items-center justify-center shrink-0">
                    <Package className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-primary truncate">{row.itemName}</p>
                    <p className="text-ink-tertiary text-xs">
                      {row.itemCode} · {row.warehouseName || row.warehouseCode}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium tabular-nums text-ink-primary">{row.available.toLocaleString()} avail.</p>
                    <div className="mt-1">
                      <StockStatusBadge status={row.stockStatus} />
                    </div>
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
