import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  accent?: 'blue' | 'green' | 'amber' | 'red' | 'slate';
  /** Optional secondary line, e.g. "vs previous period" trend text. */
  hint?: string;
  /** When set the tile links to the report behind the figure. */
  to?: string;
  /**
   * 'compact' = flat, dense reporting tile (small muted icon, no coloured badge). The default keeps the original look so
   * other modules are unaffected.
   */
  variant?: 'default' | 'compact';
  /** Compact tiles only: what the figure measures, e.g. "Selected period", "Current position", "As of 30 Sep 2026". */
  basis?: string;
  /** Compact tiles only: the metric's definition, shown as a tooltip on the label and value. */
  definition?: string;
}

const accentClasses: Record<string, string> = {
  blue: 'bg-info-bg text-info',
  green: 'bg-success-bg text-success',
  amber: 'bg-warning-bg text-warning',
  red: 'bg-danger-bg text-danger',
  slate: 'bg-surface-tertiary text-ink-secondary'
};

export default function StatCard({ label, value, icon: Icon, accent = 'blue', hint, to, variant = 'default', basis, definition }: StatCardProps) {
  const body =
    variant === 'compact' ? (
      <div className={`panel p-3.5 h-full flex flex-col transition-colors ${to ? 'hover:border-brand-400' : ''}`} title={definition}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wide leading-snug">{label}</p>
          {Icon && <Icon className="h-4 w-4 shrink-0 text-ink-tertiary" aria-hidden="true" />}
        </div>
        <p className="mt-1 text-xl font-semibold tabular-nums text-ink-primary truncate" title={String(value)}>{value}</p>
        {hint && <p className="mt-1 text-xs text-ink-secondary leading-snug">{hint}</p>}
        <div className="mt-auto pt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[10px] font-medium uppercase tracking-wide">
          {basis ? <span className="text-ink-tertiary">{basis}</span> : <span />}
          {to && <span className="text-brand-600 dark:text-brand-400 normal-case text-xs font-medium whitespace-nowrap ml-auto">View report →</span>}
        </div>
      </div>
    ) : (
      <div className="card hover:shadow-elevated transition-shadow duration-200 h-full">
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
        {to && <p className="text-xs text-brand-600 dark:text-brand-400 mt-2">View report →</p>}
      </div>
    );

  return to ? (
    <Link to={to} className="block h-full rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={`${label}: open the report`}>
      {body}
    </Link>
  ) : (
    body
  );
}
