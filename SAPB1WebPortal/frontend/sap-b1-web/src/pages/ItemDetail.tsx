import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Package, Boxes, PackageCheck } from 'lucide-react';
import { getItemByCode } from '../api/items';
import type { ItemDetail } from '../types';
import { ErrorState } from '../components/StateViews';
import { DetailSkeleton } from '../components/ui/Skeleton';
import StatusBadge from '../components/StatusBadge';
import Tabs from '../components/ui/Tabs';
import StatCard from '../components/StatCard';

export default function ItemDetailPage() {
  const { itemCode = '' } = useParams();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getItemByCode(itemCode)
      .then(setItem)
      .catch((err) => setError(err?.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [itemCode]);

  if (loading) return <DetailSkeleton />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!item) return null;

  const overviewTab = (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      <Field label="Item Group" value={item.itemGroup} />
      <Field label="Barcode" value={item.barcode} />
      <Field label="Inventory UoM" value={item.inventoryUom} />
      <Field label="Sales UoM" value={item.salesUom} />
      <Field label="Purchase UoM" value={item.purchaseUom} />
      <Field label="Last Purchase Price" value={item.lastPurchasePrice.toLocaleString()} />
      <Field label="Last Sales Price" value={item.lastSalesPrice.toLocaleString()} />
    </div>
  );

  const warehouseTab =
    item.warehouseStock.length === 0 ? (
      <p className="text-sm text-ink-tertiary py-6 text-center">No warehouse stock records.</p>
    ) : (
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm">
          <thead className="bg-surface-secondary text-ink-secondary text-left">
            <tr>
              <th className="px-3 py-2.5 font-medium rounded-l-lg">Warehouse</th>
              <th className="px-3 py-2.5 font-medium text-right">On Hand</th>
              <th className="px-3 py-2.5 font-medium text-right">Committed</th>
              <th className="px-3 py-2.5 font-medium text-right">Ordered</th>
              <th className="px-3 py-2.5 font-medium text-right rounded-r-lg">Available</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {item.warehouseStock.map((w) => (
              <tr key={w.warehouseCode}>
                <td className="px-3 py-2.5 text-ink-primary">{w.warehouseName || w.warehouseCode}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{w.onHand.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{w.committed.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{w.ordered.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium">{w.available.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <div className="space-y-6 max-w-4xl">
      <Link to="/items" className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" />
        Back to Items
      </Link>

      <div className="card">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-surface-tertiary text-ink-tertiary flex items-center justify-center shrink-0">
            <Package className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold text-ink-primary truncate">{item.itemName || item.itemCode}</h1>
              <StatusBadge active={item.active} />
            </div>
            <p className="text-ink-tertiary text-sm mt-0.5">{item.itemCode}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="On Hand" value={item.onHand.toLocaleString()} icon={Boxes} accent="blue" />
        <StatCard label="Committed" value={item.committed.toLocaleString()} icon={Package} accent="slate" />
        <StatCard label="Ordered" value={item.ordered.toLocaleString()} icon={Package} accent="amber" />
        <StatCard label="Available" value={item.available.toLocaleString()} icon={PackageCheck} accent="green" />
      </div>

      <div className="card">
        <Tabs
          tabs={[
            { key: 'overview', label: 'Overview', content: overviewTab },
            { key: 'warehouses', label: `Stock by Warehouse (${item.warehouseStock.length})`, content: warehouseTab }
          ]}
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
