import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Wallet, CreditCard } from 'lucide-react';
import { getSupplierByCode } from '../api/suppliers';
import type { SupplierDetail } from '../types';
import { ErrorState } from '../components/StateViews';
import { DetailSkeleton } from '../components/ui/Skeleton';
import StatusBadge from '../components/StatusBadge';
import Avatar from '../components/ui/Avatar';
import Tabs from '../components/ui/Tabs';
import StatCard from '../components/StatCard';

export default function SupplierDetailPage() {
  const { cardCode = '' } = useParams();
  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getSupplierByCode(cardCode)
      .then(setSupplier)
      .catch((err) => setError(err?.response?.data?.message || err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [cardCode]);

  if (loading) return <DetailSkeleton />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!supplier) return null;

  const overviewTab = (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      <Field label="Group" value={supplier.groupName} />
      <Field label="Phone" value={supplier.phone} />
      <Field label="Email" value={supplier.email} />
      <Field label="GSTIN" value={supplier.gsTin} />
    </div>
  );

  const addressesTab =
    supplier.addresses.length === 0 ? (
      <p className="text-sm text-ink-tertiary py-6 text-center">No addresses on file.</p>
    ) : (
      <div className="grid sm:grid-cols-2 gap-4">
        {supplier.addresses.map((a, idx) => (
          <div key={idx} className="border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="h-4 w-4 text-ink-tertiary" />
              <p className="font-medium text-sm text-ink-primary">{a.addressType}</p>
            </div>
            <p className="text-ink-secondary text-sm leading-relaxed">
              {[a.street, a.city, a.state, a.zipCode, a.country].filter(Boolean).join(', ') || '—'}
            </p>
          </div>
        ))}
      </div>
    );

  return (
    <div className="space-y-6 max-w-4xl">
      <Link to="/suppliers" className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" />
        Back to Suppliers
      </Link>

      <div className="card">
        <div className="flex items-start gap-4">
          <Avatar name={supplier.cardName || supplier.cardCode} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold text-ink-primary truncate">{supplier.cardName || supplier.cardCode}</h1>
              <StatusBadge active={supplier.active} />
            </div>
            <p className="text-ink-tertiary text-sm mt-0.5">{supplier.cardCode}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Credit Limit" value={supplier.creditLimit.toLocaleString()} icon={CreditCard} accent="blue" />
        <StatCard label="Balance" value={supplier.balance.toLocaleString()} icon={Wallet} accent="amber" />
      </div>

      <div className="card">
        <Tabs
          tabs={[
            { key: 'overview', label: 'Overview', content: overviewTab },
            { key: 'addresses', label: `Addresses (${supplier.addresses.length})`, content: addressesTab }
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
