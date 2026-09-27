import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  accent?: 'blue' | 'green' | 'amber' | 'red' | 'slate';
  /** Optional secondary line, e.g. "vs previous period" trend text. */
  hint?: string;
}

const accentClasses: Record<string, string> = {
  blue: 'bg-info-bg text-info',
  green: 'bg-success-bg text-success',
  amber: 'bg-warning-bg text-warning',
  red: 'bg-danger-bg text-danger',
  slate: 'bg-surface-tertiary text-ink-secondary'
};

export default function StatCard({ label, value, icon: Icon, accent = 'blue', hint }: StatCardProps) {
  return (
    <div className="card hover:shadow-elevated transition-shadow duration-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-secondary uppercase tracking-wide truncate">{label}</p>
          <p className="text-2xl font-semibold mt-1.5 tabular-nums text-ink-primary">{value}</p>
          {hint && <p className="text-xs text-ink-tertiary mt-1">{hint}</p>}
        </div>
        {Icon && (
          <div className={`h-10 w-10 shrink-0 rounded-lg flex items-center justify-center ${accentClasses[accent]}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}
