const palette = [
  'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
];

function colorFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = { sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-xs', lg: 'h-12 w-12 text-sm' }[size];
  return (
    <div
      className={`shrink-0 rounded-full flex items-center justify-center font-semibold ${sizeClasses} ${colorFor(name || '?')}`}
      aria-hidden="true"
    >
      {initialsFor(name || '?')}
    </div>
  );
}
