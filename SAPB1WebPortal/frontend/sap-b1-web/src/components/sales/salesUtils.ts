import { isNative } from '../../native/platform';
import { shareFile } from '../../native/files';
/** yyyy-MM-dd in local time (what <input type="date"> and the API expect). */
export function toIsoDate(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Start of the current Apr–Mar financial year. */
export function fyStartDate(today = new Date()) {
  return new Date(today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1, 3, 1);
}

/** Percentage change vs a previous value; null when there is nothing to compare against. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Saves rows as a CSV file (opens directly in Excel). */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][], preamble: (string | number | null | undefined)[][] = []) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [...preamble, header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  // In the installed app a blob can't be downloaded like in a browser: hand it to the system share sheet instead.
  if (isNative) { void shareFile(filename, blob); return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
