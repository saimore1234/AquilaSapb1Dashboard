import { Link } from 'react-router-dom';
import { ArrowRight, ArrowDown, FileStack, ClipboardList, PackageMinus, Factory, PackagePlus, CheckCircle2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface FlowStep {
  label: string;
  icon: LucideIcon;
  active: boolean;
  sublabel?: string;
  to?: string;
}

/**
 * Visual manufacturing flow: BOM -> Production Order -> Material Issue ->
 * Production -> Receipt from Production -> Finished Goods. Every step's
 * "active" state is driven entirely by real data already on the production
 * order (hasBom, whether any component has been issued, real receipt rows)
 * — never invented or assumed present.
 */
export default function ProductionFlow({
  itemCode,
  hasBom,
  docNum,
  anyIssued,
  receiptCount,
  isComplete
}: {
  itemCode: string;
  hasBom: boolean;
  docNum: number;
  anyIssued: boolean;
  receiptCount: number;
  isComplete: boolean;
}) {
  const steps: FlowStep[] = [
    { label: 'BOM', icon: FileStack, active: hasBom, sublabel: hasBom ? itemCode : 'None found', to: hasBom ? `/production/boms/${encodeURIComponent(itemCode)}` : undefined },
    { label: 'Production Order', icon: ClipboardList, active: true, sublabel: `#${docNum}` },
    { label: 'Material Issue', icon: PackageMinus, active: anyIssued, sublabel: anyIssued ? 'Issued' : 'Not yet issued' },
    { label: 'Production', icon: Factory, active: anyIssued },
    { label: 'Receipt from Production', icon: PackagePlus, active: receiptCount > 0, sublabel: receiptCount > 0 ? `${receiptCount} receipt${receiptCount === 1 ? '' : 's'}` : 'None yet' },
    { label: 'Finished Goods', icon: CheckCircle2, active: isComplete }
  ];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2 flex-wrap">
      {steps.map((step, idx) => {
        const Icon = step.icon;
        const content = (
          <div
            className={`shrink-0 rounded-xl border px-3.5 py-2.5 text-center min-w-[120px] ${
              step.active
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
                : 'border-border bg-surface-secondary opacity-60'
            }`}
          >
            <Icon className={`h-4 w-4 mx-auto mb-1 ${step.active ? 'text-brand-600 dark:text-brand-300' : 'text-ink-tertiary'}`} />
            <p className={`text-[11px] font-medium uppercase tracking-wide ${step.active ? 'text-brand-600 dark:text-brand-300' : 'text-ink-tertiary'}`}>
              {step.label}
            </p>
            {step.sublabel && <p className="text-xs text-ink-secondary mt-0.5">{step.sublabel}</p>}
          </div>
        );
        return (
          <div key={step.label} className="flex items-center gap-2 sm:gap-2">
            {idx > 0 && (
              <>
                <ArrowRight className="hidden sm:block h-4 w-4 text-ink-tertiary shrink-0" />
                <ArrowDown className="sm:hidden h-4 w-4 text-ink-tertiary shrink-0" />
              </>
            )}
            {step.to ? (
              <Link to={step.to} className="hover:opacity-80 transition-opacity">
                {content}
              </Link>
            ) : (
              content
            )}
          </div>
        );
      })}
    </div>
  );
}
