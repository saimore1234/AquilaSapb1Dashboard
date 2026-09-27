export default function AvailabilityBadge({ status }: { status: string }) {
  const cls = status === 'Available' ? 'badge-success' : status === 'Shortage' ? 'badge-danger' : 'badge-warning';
  return <span className={cls}>{status}</span>;
}
