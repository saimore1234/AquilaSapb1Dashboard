import { AlertTriangle, Loader2, SearchX } from 'lucide-react';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-ink-secondary text-sm">
      <Loader2 className="animate-spin h-4 w-4 mr-2 text-brand-600 dark:text-brand-400" />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="h-11 w-11 rounded-full bg-danger-bg text-danger flex items-center justify-center mb-3">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-ink-primary font-medium mb-1">Unable to load this data</p>
      <p className="text-ink-secondary text-sm mb-4 max-w-sm">{message}</p>
      {onRetry && (
        <button className="btn-primary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message = 'No records found.', description }: { message?: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="h-11 w-11 rounded-full bg-surface-tertiary text-ink-tertiary flex items-center justify-center mb-3">
        <SearchX className="h-5 w-5" />
      </div>
      <p className="text-ink-primary font-medium">{message}</p>
      {description && <p className="text-ink-secondary text-sm mt-1 max-w-sm">{description}</p>}
    </div>
  );
}
