import StatCard from '../StatCard';
import { CardGridSkeleton } from '../ui/Skeleton';
import type { AgeingSummary } from '../../types';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

export default function AgeingSummaryCards({ summary, loading }: { summary: AgeingSummary | null; loading: boolean }) {
  if (loading) return <CardGridSkeleton count={4} />;
  if (!summary) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total" value={formatCurrency(summary.total)} accent="blue" />
        <StatCard label="Current" value={formatCurrency(summary.current)} accent="green" />
        <StatCard label="Overdue" value={formatCurrency(summary.overdue)} accent={summary.overdue > 0 ? 'red' : 'slate'} />
        <StatCard label="Overdue %" value={`${summary.overduePercent.toFixed(1)}%`} accent="amber" />
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        <AgeBucket label="Current" value={summary.current} />
        <AgeBucket label="1-30" value={summary.days1To30} />
        <AgeBucket label="31-60" value={summary.days31To60} />
        <AgeBucket label="61-90" value={summary.days61To90} />
        <AgeBucket label="91-120" value={summary.days91To120} />
        <AgeBucket label="120+" value={summary.days120Plus} />
      </div>
      <p className="text-xs text-ink-tertiary">Ageing calculated as of {new Date(summary.reportingDate).toLocaleDateString()}</p>
    </div>
  );
}

function AgeBucket({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5 text-center">
      <p className="text-[11px] font-medium text-ink-tertiary uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold text-ink-primary tabular-nums mt-0.5">{formatCurrency(value)}</p>
    </div>
  );
}
