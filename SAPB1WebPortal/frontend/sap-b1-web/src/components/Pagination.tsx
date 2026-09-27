import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3">
      <span className="text-sm text-ink-secondary tabular-nums">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border-strong text-sm text-ink-primary hover:bg-surface-tertiary disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>
        <button
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border-strong text-sm text-ink-primary hover:bg-surface-tertiary disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
