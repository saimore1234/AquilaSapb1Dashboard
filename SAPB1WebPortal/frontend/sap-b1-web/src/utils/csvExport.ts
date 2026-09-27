/** Exports the given rows (already the currently-filtered, currently-loaded
 * real data — never anything else) as a downloaded CSV file. */
export function exportRowsToCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: string; header: string; value: (row: T) => string | number }[],
  filename: string
) {
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = columns.map((c) => escape(c.header)).join(',');
  const lines = rows.map((row) => columns.map((c) => escape(c.value(row))).join(','));
  const csv = [header, ...lines].join('\r\n');

  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
