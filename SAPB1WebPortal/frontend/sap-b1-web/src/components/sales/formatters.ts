/**
 * One place for every number/date the Sales pages display, so KPIs, tables, charts and exports can't drift apart.
 * Display only — nothing here changes a value; values are formatted from the numbers the API returned and never parsed back.
 *
 *  - Money:      whole rupees, Indian grouping (12,34,56,789). Symbol only where a figure stands alone (KPIs).
 *  - Quantities: up to 3 decimals, separate from money.
 *  - Missing:    null / undefined / non-finite → "–"; a zero inside a financial grid is shown as "–" too, so empty cells read
 *                consistently (use `formatAmount(v, { zero: true })` where a real 0 must be shown).
 */

export const MISSING = '–';

const nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const nf3 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
const nf1 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const finite = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/** Whole-rupee amount without a symbol, for table cells. A zero/missing value shows "–" unless `zero` is set. */
export function formatAmount(v: number | null | undefined, opts: { zero?: boolean } = {}): string {
  if (!finite(v)) return MISSING;
  if (v === 0 && !opts.zero) return MISSING;
  return nf0.format(v);
}

/** Whole-rupee amount with the ₹ symbol, for headline figures. Negative values keep their minus sign (credit memos). */
export function formatInr(v: number | null | undefined): string {
  if (!finite(v)) return MISSING;
  const r = nf0.format(Math.abs(v));
  return `${v < 0 ? '-' : ''}₹ ${r}`;
}

export function formatQty(v: number | null | undefined): string {
  return finite(v) ? nf3.format(v) : MISSING;
}

export function formatCount(v: number | null | undefined): string {
  return finite(v) ? nf0.format(v) : MISSING;
}

export function formatPct(v: number | null | undefined): string {
  return finite(v) ? `${nf1.format(v)}%` : MISSING;
}

/** Tailwind class for a numeric cell: red for negatives, muted for the "–" placeholder. */
export function amountTone(v: number | null | undefined, opts: { zero?: boolean } = {}): string {
  if (!finite(v) || (v === 0 && !opts.zero)) return 'text-ink-tertiary';
  return v < 0 ? 'text-danger' : '';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-04-01" → "01 Apr 2026" (pure string maths: no timezone shifting). */
export function formatLongDate(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return MISSING;
  const m = Number(iso.slice(5, 7));
  return `${iso.slice(8, 10)} ${MONTHS[m - 1] ?? '???'} ${iso.slice(0, 4)}`;
}

/** "01 Apr 2026 – 15 Oct 2026". */
export const formatPeriod = (from: string, to: string) => `${formatLongDate(from)} – ${formatLongDate(to)}`;

/** Indian financial year (April–March) the date falls in, e.g. "FY 2026-27". */
export function formatFy(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const start = Number(iso.slice(5, 7)) >= 4 ? y : y - 1;
  return `FY ${start}-${String(start + 1).slice(2)}`;
}

/** "Local Customer" → "Local Sales"; other group names are shown exactly as SAP names them. */
export const salesTypeLabel = (group: string) => (/\bcustomer\b/i.test(group) ? group.replace(/\bcustomer\b/i, 'Sales') : group);
