import type { LucideIcon } from 'lucide-react';
import { Construction } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  icon: LucideIcon;
  description: string;
  /** Exactly which backend work is missing — kept visible rather than hidden,
   * per the "don't fake it, tell me what's missing" rule this module follows. */
  requiredApis: string[];
}

export default function ComingSoon({ title, icon: Icon, description, requiredApis }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-4 max-w-lg mx-auto">
      <div className="h-14 w-14 rounded-2xl bg-info-bg text-info flex items-center justify-center mb-5">
        <Icon className="h-6 w-6" />
      </div>
      <h1 className="text-xl font-semibold text-ink-primary mb-2">{title}</h1>
      <p className="text-ink-secondary text-sm mb-6">{description}</p>

      <div className="w-full card text-left">
        <div className="flex items-center gap-2 mb-3">
          <Construction className="h-4 w-4 text-warning" />
          <p className="text-sm font-medium text-ink-primary">Backend not built yet</p>
        </div>
        <p className="text-xs text-ink-secondary mb-3">
          This module isn't shown with placeholder or made-up data — it needs these API endpoints first:
        </p>
        <ul className="space-y-1.5">
          {requiredApis.map((api) => (
            <li key={api} className="text-xs font-mono bg-surface-secondary text-ink-secondary rounded-md px-2.5 py-1.5">
              {api}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
