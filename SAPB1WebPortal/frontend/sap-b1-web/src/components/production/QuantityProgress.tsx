/** Visual Planned / Produced / Remaining summary with a progress bar.
 * Progress is calculated purely from the real quantities passed in — never
 * hardcoded — and clamped to [0, 100] only for the bar width, while the
 * printed percentage still reflects the true (possibly >100%, over-produced)
 * ratio. */
export default function QuantityProgress({
  planned,
  produced,
  remaining,
  uom
}: {
  planned: number;
  produced: number;
  remaining: number;
  uom?: string | null;
}) {
  const pct = planned > 0 ? Math.round((produced / planned) * 100) : 0;
  const barPct = Math.max(0, Math.min(100, pct));

  return (
    <div className="card">
      <div className="grid grid-cols-3 gap-4 text-center mb-4">
        <div>
          <p className="text-xs font-medium text-ink-tertiary uppercase tracking-wide mb-1">Planned</p>
          <p className="text-xl font-semibold text-ink-primary tabular-nums">
            {planned.toLocaleString()}
            {uom && <span className="text-xs font-normal text-ink-tertiary ml-1">{uom}</span>}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-ink-tertiary uppercase tracking-wide mb-1">Produced</p>
          <p className="text-xl font-semibold text-success tabular-nums">{produced.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-ink-tertiary uppercase tracking-wide mb-1">Remaining</p>
          <p className={`text-xl font-semibold tabular-nums ${remaining > 0 ? 'text-warning' : 'text-ink-primary'}`}>
            {Math.max(0, remaining).toLocaleString()}
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-ink-secondary">Progress</span>
          <span className="text-xs font-semibold text-ink-primary tabular-nums">{pct}%</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-surface-tertiary overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-success' : 'bg-brand-500'}`}
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
