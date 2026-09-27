export default function ChartCard({
  title,
  subtitle,
  children,
  className = ''
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`card ${className}`}>
      <h2 className="font-semibold text-ink-primary mb-1">{title}</h2>
      {subtitle && <p className="text-xs text-ink-tertiary mb-4">{subtitle}</p>}
      {children}
    </div>
  );
}
