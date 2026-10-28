import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Shown to a salesperson (restricted) login: which salespersons' customers, orders, invoices and targets it can see — or that it has not been linked
 * to a salesperson yet and therefore sees nothing. The SERVER enforces this; the banner only explains what the user is looking at.
 */
export default function SalesScopeBanner() {
  const { salesScope } = useAuth();
  if (!salesScope?.restricted) return null;

  if (!salesScope.linked) {
    return (
      <div role="alert" className="panel px-3 py-2 mb-4 flex items-start gap-2 text-sm border-warning">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
        <p className="text-ink-secondary">
          <strong className="text-ink-primary">Your login is not linked to a salesperson yet</strong>, so no customers, orders, invoices or targets are shown.
          Please ask an administrator to link your login to your SAP salesperson (Administration → Users).
        </p>
      </div>
    );
  }
  return (
    <div className="panel px-3 py-2 mb-4 flex items-start gap-2 text-sm">
      <ShieldCheck className="h-4 w-4 mt-0.5 text-brand-600 dark:text-brand-400 shrink-0" />
      <p className="text-ink-secondary">
        Showing the customers, orders, invoices and targets of <strong className="text-ink-primary">{salesScope.salespersons.map((s) => s.name).join(', ') || 'your salesperson'}</strong> only.
      </p>
    </div>
  );
}
