export default function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={active ? 'badge-success' : 'badge-neutral'}>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-success' : 'bg-ink-tertiary'}`} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

const stockStatusStyles: Record<string, string> = {
  'In Stock': 'badge-success',
  'Low Stock': 'badge-warning',
  'Out of Stock': 'badge-danger'
};

export function StockStatusBadge({ status }: { status: string }) {
  return <span className={stockStatusStyles[status] ?? 'badge-neutral'}>{status}</span>;
}
