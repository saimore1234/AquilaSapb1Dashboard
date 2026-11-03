import { Link } from 'react-router-dom';
import { CheckCircle2, Wallet } from 'lucide-react';
import SalesDocumentDetail from '../../components/sales/SalesDocumentDetail';
import { getArInvoiceByEntry } from '../../api/sales';
import type { ArInvoiceDetail as ArInvoiceDetailModel } from '../../types';

function formatMoney(value: number, currency: string | null) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 2 }).format(value);
  } catch {
    return value.toLocaleString();
  }
}

const date = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString() : '—');

const statusClass: Record<ArInvoiceDetailModel['paymentStatus'], string> = {
  Paid: 'badge-success',
  'Partially paid': 'badge-warning',
  Unpaid: 'badge-warning',
  Cancelled: 'badge-neutral'
};

function PaymentDetails({ d }: { d: ArInvoiceDetailModel }) {
  const cur = d.currency;
  // Tolerate an older backend that doesn't send the payment breakdown yet.
  const payments = d.appliedPayments ?? [];
  const credits = d.creditNotes ?? [];
  const status = d.paymentStatus ?? (d.balance <= 0.005 ? 'Paid' : d.paid > 0.005 ? 'Partially paid' : 'Unpaid');
  const row = 'flex justify-between text-ink-secondary';
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold text-ink-primary">Payment Details</h2>
        <span className={statusClass[status]}>{status}</span>
      </div>
      <div className="max-w-xs space-y-1.5 text-sm">
        <div className={row}><span>Invoice Total</span><span className="tabular-nums">{formatMoney(d.grandTotal, cur)}</span></div>
        <div className={row}><span>Paid Amount</span><span className="tabular-nums">{formatMoney(d.paid, cur)}</span></div>
        <div className="flex justify-between text-base font-semibold text-ink-primary pt-1.5 border-t border-border"><span>Outstanding Balance</span><span className="tabular-nums">{formatMoney(d.balance, cur)}</span></div>
      </div>

      <h3 className="mt-5 mb-2 text-sm font-medium text-ink-primary">Applied Incoming Payments</h3>
      {payments.length === 0 ? (
        <p className="text-sm text-ink-tertiary">No incoming payment is applied to this invoice.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-ink-secondary text-left"><tr><th className="py-1.5 font-medium">Payment</th><th className="py-1.5 font-medium">Date</th><th className="py-1.5 font-medium text-right">Applied</th></tr></thead>
          <tbody className="divide-y divide-border">
            {payments.map((p) => (
              <tr key={p.docEntry}>
                <td className="py-1.5"><Link className="text-brand-600 dark:text-brand-400 hover:underline" to={`/sales/payments/${p.docEntry}`}>#{p.docNum}</Link></td>
                <td className="py-1.5">{date(p.paymentDate)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatMoney(p.amountApplied, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {credits.length > 0 && (
        <>
          <h3 className="mt-5 mb-2 text-sm font-medium text-ink-primary">Credit Notes</h3>
          <table className="w-full text-sm">
            <thead className="text-ink-secondary text-left"><tr><th className="py-1.5 font-medium">Credit memo</th><th className="py-1.5 font-medium">Date</th><th className="py-1.5 font-medium text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-border">
              {credits.map((c) => (
                <tr key={c.docEntry}>
                  <td className="py-1.5"><Link className="text-brand-600 dark:text-brand-400 hover:underline" to={`/sales/credit-memos/${c.docEntry}`}>#{c.docNum}</Link></td>
                  <td className="py-1.5">{date(c.postingDate)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatMoney(c.total, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {Math.abs(d.otherSettlements ?? 0) > 0.005 && (
        <p className="mt-4 text-xs text-ink-tertiary">
          {formatMoney(d.otherSettlements ?? 0, cur)} of the paid amount is settled outside the incoming payments listed above (for example by credit memo or internal reconciliation in SAP).
        </p>
      )}
    </div>
  );
}

export default function ArInvoiceDetail() {
  return (
    <SalesDocumentDetail
      printType="ar-invoice"
      documentLabel="A/R Invoice"
      backLabel="Back to A/R Invoices"
      backRoute="/sales/invoices"
      fetchFn={getArInvoiceByEntry}
      title={(d) => d.customerName || d.customerCode}
      subtitle={(d) => d.customerCode}
      extraFields={(d) => [
        { label: 'Customer Code', value: d.customerCode },
        { label: 'Document Date', value: date(d.documentDate) },
        { label: 'Due Date', value: date(d.dueDate) },
        { label: 'Payment Terms', value: d.paymentTerms },
        { label: 'Sales Employee', value: d.salesEmployee },
        { label: 'Branch', value: d.branch },
        { label: 'Customer Reference', value: d.customerReference }
      ]}
      extraStatCards={(d) => [
        { label: 'Paid', value: formatMoney(d.paid, d.currency), icon: CheckCircle2, accent: 'green' },
        { label: 'Balance', value: formatMoney(d.balance, d.currency), icon: Wallet, accent: d.balance > 0 ? 'amber' : 'slate' }
      ]}
      extraSections={(d) => <PaymentDetails d={d} />}
    />
  );
}
