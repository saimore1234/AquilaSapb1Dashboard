import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Banknote, CreditCard, Landmark } from 'lucide-react';
import { getIncomingPaymentByEntry } from '../../api/sales';
import type { IncomingPaymentDetail as IncomingPaymentDetailType } from '../../types';
import { ErrorState } from '../../components/StateViews';
import { DetailSkeleton } from '../../components/ui/Skeleton';
import StatCard from '../../components/StatCard';
import PrintButton from '../../components/PrintButton';

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

export default function IncomingPaymentDetail() {
  const { docEntry: docEntryParam = '' } = useParams();
  const docEntry = Number(docEntryParam);
  const [payment, setPayment] = useState<IncomingPaymentDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getIncomingPaymentByEntry(docEntry)
      .then(setPayment)
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load sales data.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [docEntry]);

  if (loading) return <DetailSkeleton />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!payment) return null;

  return (
    <div className="space-y-6 max-w-4xl">
      <Link to="/sales/payments" className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" />
        Back to Incoming Payments
      </Link>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-ink-tertiary uppercase tracking-wide mb-1">Incoming Payment</p>
            <h1 className="text-xl font-semibold text-ink-primary">
              {payment.customerName || payment.customerCode} <span className="text-ink-tertiary font-normal">#{payment.docNum}</span>
            </h1>
            <p className="text-ink-tertiary text-sm mt-0.5">{payment.customerCode}</p>
          </div>
          <div className="flex items-center gap-2">
            <PrintButton documentType="incoming-payment" docEntry={docEntry} />
            <span className={payment.status === 'Completed' ? 'badge-success' : 'badge-danger'}>{payment.status}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 text-sm">
          <Field label="Posting Date" value={formatDate(payment.postingDate)} />
          <Field label="Payment Type" value={payment.paymentType} />
          <Field label="Currency" value={payment.currency || '—'} />
          {payment.bankAccount && <Field label="Bank / Transfer Account" value={payment.bankAccount} />}
        </div>

        {payment.remarks && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-ink-tertiary text-xs mb-1">Remarks</p>
            <p className="text-sm text-ink-primary">{payment.remarks}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Cash" value={payment.cashAmount.toLocaleString()} icon={Banknote} accent="green" />
        <StatCard label="Check" value={payment.checkAmount.toLocaleString()} icon={CreditCard} accent="blue" />
        <StatCard label="Bank Transfer" value={payment.transferAmount.toLocaleString()} icon={Landmark} accent="slate" />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-ink-primary">Total Amount</h2>
          <p className="text-2xl font-semibold tabular-nums text-ink-primary">{payment.amount.toLocaleString()}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-ink-primary mb-4">Applied A/R Invoices</h2>
        {payment.appliedInvoices.length === 0 ? (
          <p className="text-sm text-ink-tertiary py-4 text-center">
            No invoice applications recorded for this payment in SAP B1's reconciliation data.
          </p>
        ) : (
          <div className="divide-y divide-border -mx-1">
            {payment.appliedInvoices.map((inv) => (
              <Link
                key={inv.invoiceDocEntry}
                to={`/sales/invoices/${inv.invoiceDocEntry}`}
                className="flex items-center justify-between py-2.5 px-1 text-sm hover:bg-surface-tertiary rounded-lg transition-colors"
              >
                <span className="font-medium text-brand-600 dark:text-brand-400">A/R Invoice #{inv.invoiceDocNum}</span>
                <span className="tabular-nums text-ink-primary">{inv.amountApplied.toLocaleString()}</span>
              </Link>
            ))}
          </div>
        )}
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
