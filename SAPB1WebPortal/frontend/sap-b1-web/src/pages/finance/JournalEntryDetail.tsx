import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getJournalEntryByTransId } from '../../api/finance';
import type { JournalEntryDetail as JournalEntryDetailType } from '../../types';
import { ErrorState } from '../../components/StateViews';
import { DetailSkeleton } from '../../components/ui/Skeleton';

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

export default function JournalEntryDetail() {
  const { transId: transIdParam = '' } = useParams();
  const transId = Number(transIdParam);
  const [entry, setEntry] = useState<JournalEntryDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    getJournalEntryByTransId(transId)
      .then(setEntry)
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Unable to load financial data.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [transId]);

  if (loading) return <DetailSkeleton />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!entry) return null;

  const isBalanced = Math.abs(entry.balanceDifference) < 0.01;

  return (
    <div className="space-y-6 max-w-4xl">
      <Link to="/finance/journal-entries" className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" />
        Back to Journal Entries
      </Link>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-ink-tertiary uppercase tracking-wide mb-1">Journal Entry</p>
            <h1 className="text-xl font-semibold text-ink-primary">
              #{entry.transId} {entry.documentNumber != null && <span className="text-ink-tertiary font-normal text-base">(Doc #{entry.documentNumber})</span>}
            </h1>
            <p className="text-ink-tertiary text-sm mt-0.5">{formatDate(entry.postingDate)}</p>
          </div>
          <span className={isBalanced ? 'badge-success' : 'badge-danger'}>{isBalanced ? 'Balanced' : 'Unbalanced'}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 text-sm">
          <Field label="Due Date" value={formatDate(entry.dueDate)} />
          <Field label="Tax Date" value={formatDate(entry.taxDate)} />
          <Field label="Reference" value={entry.reference} />
          <Field label="Reference 2" value={entry.reference2} />
          <Field label="Origin" value={entry.origin} />
        </div>

        {entry.memo && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-ink-tertiary text-xs mb-1">Memo</p>
            <p className="text-sm text-ink-primary">{entry.memo}</p>
          </div>
        )}
      </div>

      {entry.lines.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <h2 className="font-semibold text-ink-primary px-5 pt-5 mb-3">Lines</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-secondary text-ink-secondary text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Account</th>
                  <th className="px-4 py-2.5 font-medium hidden md:table-cell">Business Partner</th>
                  <th className="px-4 py-2.5 font-medium hidden lg:table-cell">Line Memo</th>
                  <th className="px-4 py-2.5 font-medium text-right">Debit</th>
                  <th className="px-4 py-2.5 font-medium text-right">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entry.lines.map((l) => (
                  <tr key={l.lineId}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-ink-primary">{l.accountName || l.accountCode}</p>
                      <p className="text-ink-tertiary text-xs">{l.accountCode}</p>
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell text-ink-secondary">{l.businessPartnerName || l.businessPartnerCode || '—'}</td>
                    <td className="px-4 py-2.5 hidden lg:table-cell text-ink-secondary">{l.lineMemo || '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{l.debit === 0 ? '—' : l.debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{l.credit === 0 ? '—' : l.credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-border p-5 flex justify-end">
            <div className="w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between text-ink-secondary">
                <span>Total Debit</span>
                <span className="tabular-nums">{entry.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-ink-secondary">
                <span>Total Credit</span>
                <span className="tabular-nums">{entry.totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-base font-semibold text-ink-primary pt-1.5 border-t border-border">
                <span>Balance Difference</span>
                <span className={`tabular-nums ${isBalanced ? 'text-success' : 'text-danger'}`}>
                  {entry.balanceDifference.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>
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
