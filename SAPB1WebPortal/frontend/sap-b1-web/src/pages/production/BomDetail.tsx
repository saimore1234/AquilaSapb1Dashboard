import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getBomByCode } from '../../api/production';
import type { BomDetail as BomDetailType } from '../../types';
import { ErrorState, EmptyState } from '../../components/StateViews';
import { DetailSkeleton } from '../../components/ui/Skeleton';
import BomTree from '../../components/production/BomTree';

export default function BomDetail() {
  const { code: codeParam = '' } = useParams();
  const code = decodeURIComponent(codeParam);
  const [bom, setBom] = useState<BomDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    setNotFound(false);
    getBomByCode(code)
      .then(setBom)
      .catch((err) => {
        if (err?.response?.status === 404) {
          setNotFound(true);
        } else {
          setError(err?.response?.data?.message || err.message || 'Unable to load production data.');
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [code]);

  return (
    <div className="space-y-6 max-w-4xl">
      <Link to="/production/boms" className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" />
        Back to Bill of Materials
      </Link>

      {loading && <DetailSkeleton />}
      {!loading && error && (
        <div className="card">
          <ErrorState message={error} onRetry={load} />
        </div>
      )}
      {!loading && notFound && (
        <div className="card">
          <EmptyState message="No BOM Found" description="No bill of materials is available for this item." />
        </div>
      )}

      {!loading && !error && !notFound && bom && (
        <>
          <div className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-ink-tertiary uppercase tracking-wide mb-1">Bill of Materials</p>
                <h1 className="text-xl font-semibold text-ink-primary">
                  {bom.itemName || bom.code} <span className="text-ink-tertiary font-normal">{bom.code}</span>
                </h1>
              </div>
              <span className="badge-neutral">{bom.treeType}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 text-sm">
              <Field label="Item Code" value={bom.code} />
              <Field label="Base Quantity" value={bom.quantity.toLocaleString()} />
              <Field label="Warehouse" value={bom.warehouse} />
            </div>
          </div>

          <div className="card">
            <h2 className="font-semibold text-ink-primary mb-5">Components</h2>
            <BomTree parentCode={bom.code} parentName={bom.itemName} quantity={bom.quantity} components={bom.components} />
          </div>

          {bom.components.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <h2 className="font-semibold text-ink-primary px-5 pt-5 mb-3">Component Detail</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-secondary text-ink-secondary text-left">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Component</th>
                      <th className="px-4 py-2.5 font-medium hidden md:table-cell">Warehouse</th>
                      <th className="px-4 py-2.5 font-medium text-right">Quantity</th>
                      <th className="px-4 py-2.5 font-medium hidden lg:table-cell">Issue Method</th>
                      <th className="px-4 py-2.5 font-medium hidden lg:table-cell">UoM</th>
                      <th className="px-4 py-2.5 font-medium text-right hidden md:table-cell">Additional/Scrap</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {bom.components.map((c) => (
                      <tr key={c.childNum}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-ink-primary">{c.itemName || c.itemCode}</p>
                          <p className="text-ink-tertiary text-xs">{c.itemCode}</p>
                        </td>
                        <td className="px-4 py-2.5 hidden md:table-cell text-ink-secondary">{c.warehouse || '—'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {c.quantity.toLocaleString()} {c.uom || ''}
                        </td>
                        <td className="px-4 py-2.5 hidden lg:table-cell text-ink-secondary">{c.issueMethod || '—'}</td>
                        <td className="px-4 py-2.5 hidden lg:table-cell text-ink-secondary">{c.uom || '—'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums hidden md:table-cell text-ink-secondary">
                          {c.additionalQuantity !== 0 ? c.additionalQuantity.toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
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
