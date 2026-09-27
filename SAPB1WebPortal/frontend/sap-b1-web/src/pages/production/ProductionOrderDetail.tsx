import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getProductionOrderByEntry } from '../../api/production';
import type { ProductionOrderDetail as ProductionOrderDetailType } from '../../types';
import { ErrorState } from '../../components/StateViews';
import { DetailSkeleton } from '../../components/ui/Skeleton';
import QuantityProgress from '../../components/production/QuantityProgress';
import AvailabilityBadge from '../../components/production/AvailabilityBadge';
import ProductionFlow from '../../components/production/ProductionFlow';

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

function statusBadgeClass(status: string) {
  if (status === 'Released') return 'badge-success';
  if (status === 'Closed') return 'badge-neutral';
  if (status === 'Cancelled') return 'badge-danger';
  return 'badge-warning';
}

export default function ProductionOrderDetail() {
  const { docEntry: docEntryParam = '' } = useParams();
  const docEntry = Number(docEntryParam);
  const [order, setOrder] = useState<ProductionOrderDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getProductionOrderByEntry(docEntry)
      .then(setOrder)
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load production data.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [docEntry]);

  if (loading) return <DetailSkeleton />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!order) return null;

  const anyIssued = order.components.some((c) => c.issuedQty > 0);
  const isComplete = order.status === 'Closed' || (order.plannedQty > 0 && order.completedQty >= order.plannedQty);

  return (
    <div className="space-y-6 max-w-4xl">
      <Link to="/production/orders" className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" />
        Back to Production Orders
      </Link>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-ink-tertiary uppercase tracking-wide mb-1">Production Order</p>
            <h1 className="text-xl font-semibold text-ink-primary">
              {order.itemName || order.itemCode} <span className="text-ink-tertiary font-normal">#{order.docNum}</span>
            </h1>
            <p className="text-ink-tertiary text-sm mt-0.5">{order.itemCode}</p>
          </div>
          <span className={statusBadgeClass(order.status)}>{order.status}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 text-sm">
          <Field label="Posting Date" value={formatDate(order.postingDate)} />
          <Field label="Due Date" value={formatDate(order.dueDate)} />
          <Field label="Warehouse" value={order.warehouse} />
          <Field label="Order Type" value={order.orderType} />
          {order.priority != null && <Field label="Priority" value={order.priority} />}
          {order.origin && <Field label="Origin" value={order.origin} />}
        </div>

        {order.remarks && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-ink-tertiary text-xs mb-1">Remarks</p>
            <p className="text-sm text-ink-primary">{order.remarks}</p>
          </div>
        )}
      </div>

      <QuantityProgress planned={order.plannedQty} produced={order.completedQty} remaining={order.remainingQty} />

      {order.components.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <h2 className="font-semibold text-ink-primary px-5 pt-5 mb-3">Components</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-secondary text-ink-secondary text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Component</th>
                  <th className="px-4 py-2.5 font-medium hidden md:table-cell">Warehouse</th>
                  <th className="px-4 py-2.5 font-medium text-right">Planned</th>
                  <th className="px-4 py-2.5 font-medium text-right">Issued</th>
                  <th className="px-4 py-2.5 font-medium text-right hidden lg:table-cell">Remaining</th>
                  <th className="px-4 py-2.5 font-medium hidden lg:table-cell">Issue Method</th>
                  <th className="px-4 py-2.5 font-medium">Availability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {order.components.map((c) => {
                  const issuedPct = c.plannedQty > 0 ? Math.min(100, Math.round((c.issuedQty / c.plannedQty) * 100)) : 0;
                  return (
                    <tr key={c.lineNum}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-ink-primary">{c.itemName || c.itemCode}</p>
                        <p className="text-ink-tertiary text-xs">{c.itemCode}</p>
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell text-ink-secondary">{c.warehouse || '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {c.plannedQty.toLocaleString()} {c.uom || ''}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="tabular-nums">{c.issuedQty.toLocaleString()}</span>
                        <div className="h-1 w-16 rounded-full bg-surface-tertiary overflow-hidden mt-1 ml-auto">
                          <div className={`h-full rounded-full ${issuedPct >= 100 ? 'bg-success' : 'bg-brand-500'}`} style={{ width: `${issuedPct}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums hidden lg:table-cell">{Math.max(0, c.remainingQty).toLocaleString()}</td>
                      <td className="px-4 py-2.5 hidden lg:table-cell text-ink-secondary">{c.issueMethod || '—'}</td>
                      <td className="px-4 py-2.5">
                        <AvailabilityBadge status={c.availabilityStatus} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="font-semibold text-ink-primary mb-4">Manufacturing Flow</h2>
        <ProductionFlow
          itemCode={order.itemCode}
          hasBom={order.hasBom}
          docNum={order.docNum}
          anyIssued={anyIssued}
          receiptCount={order.receipts.length}
          isComplete={isComplete}
        />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-ink-tertiary text-xs mb-0.5">{label}</p>
      <p className="font-medium text-ink-primary text-sm">{value ?? '—'}</p>
    </div>
  );
}
