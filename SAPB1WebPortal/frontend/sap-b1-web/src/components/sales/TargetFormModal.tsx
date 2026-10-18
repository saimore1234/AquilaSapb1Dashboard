import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { createSalesTarget, submitSalesTarget, updateSalesTarget } from '../../api/sales';
import type { SalesTarget, SalesTargetLine, SalesTargetOptions, SalesTargetPeriodType } from '../../types';
import Modal from '../ui/Modal';
import ItemPicker from './ItemPicker';

const rupees = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const qtyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });
const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
const QUARTERS = ['Q1 (Apr–Jun)', 'Q2 (Jul–Sep)', 'Q3 (Oct–Dec)', 'Q4 (Jan–Mar)'];

const periodChoices = (type: SalesTargetPeriodType) =>
  type === 'Monthly' ? MONTHS.map((m, i) => ({ value: i + 1, label: m })) : type === 'Quarterly' ? QUARTERS.map((q, i) => ({ value: i + 1, label: q })) : [{ value: 1, label: 'Full financial year' }];

/** Period dates shown as a preview; the server derives the authoritative dates itself. */
function periodDates(fy: string, type: SalesTargetPeriodType, index: number) {
  const y = Number(fy.slice(0, 4));
  if (!y || type === 'Custom') return null;
  const step = type === 'Monthly' ? 1 : type === 'Quarterly' ? 3 : 12;
  const start = new Date(y, 3 + (index - 1) * step, 1);
  const end = new Date(y, 3 + index * step, 0);
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return { start: fmt(start), end: fmt(end) };
}

/** Index (1-based) of a stored period start within its financial year. */
function indexFromStart(startIso: string, type: SalesTargetPeriodType) {
  const m = new Date(startIso).getMonth(); // 0=Jan
  const fyMonth = (m + 9) % 12; // April -> 0
  return type === 'Monthly' ? fyMonth + 1 : type === 'Quarterly' ? Math.floor(fyMonth / 3) + 1 : 1;
}

interface Row {
  key: number;
  itemCode: string;
  itemName: string | null;
  itemGroup: string | null;
  uom: string | null;
  quantity: string;
  amount: string;
  remarks: string;
}

let rowKey = 0;
const blankRow = (): Row => ({ key: ++rowKey, itemCode: '', itemName: null, itemGroup: null, uom: null, quantity: '', amount: '', remarks: '' });
const fromLine = (l: SalesTargetLine): Row => ({
  key: ++rowKey, itemCode: l.itemCode, itemName: l.itemName, itemGroup: l.itemGroup, uom: l.uom,
  quantity: String(l.targetQuantity), amount: String(Math.round(l.targetAmount)), remarks: l.remarks ?? ''
});

const num = (v: string) => Number(v.replace(/,/g, ''));
const isoDate = (d: string) => d.slice(0, 10);

interface Props {
  open: boolean;
  target: SalesTarget | null;
  /** Item rows of the target being edited (loaded by the page). */
  targetLines: SalesTargetLine[];
  options: SalesTargetOptions | null;
  defaultFinancialYear: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export default function TargetFormModal({ open, target, targetLines, options, defaultFinancialYear, onClose, onSaved }: Props) {
  const [slp, setSlp] = useState<number | ''>('');
  const [slpSearch, setSlpSearch] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [unit, setUnit] = useState(-1);
  const [fy, setFy] = useState(defaultFinancialYear);
  const [type, setType] = useState<SalesTargetPeriodType>('Monthly');
  const [index, setIndex] = useState(1);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clear = () => {
    setSlp(''); setSlpSearch(''); setListOpen(false); setUnit(-1); setFy(defaultFinancialYear); setType('Monthly'); setIndex(1);
    setFromDate(''); setToDate(''); setAmount(''); setRemarks(''); setRows([]); setError(null);
  };

  useEffect(() => {
    if (!open) return;
    if (target) {
      setSlp(target.sapSlpCode);
      setSlpSearch(target.salespersonName);
      setUnit(target.unitCode);
      setFy(target.financialYear);
      setType(target.periodType);
      setIndex(target.periodType === 'Custom' ? 1 : indexFromStart(target.periodStart, target.periodType));
      setFromDate(isoDate(target.periodStart));
      setToDate(isoDate(target.periodEnd));
      setAmount(String(Math.round(target.targetAmount)));
      setRemarks(target.remarks ?? '');
      setRows(targetLines.map(fromLine));
      setError(null);
    } else {
      clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target, targetLines]);

  // New assignments are limited to active salespersons; a draft keeps its current (possibly now-inactive) one.
  const selectable = useMemo(
    () => (options?.salespersons ?? []).filter((s) => s.active || s.code === target?.sapSlpCode),
    [options, target]
  );
  const matches = useMemo(() => {
    const q = slpSearch.trim().toLowerCase();
    return selectable.filter((s) => !q || s.name.toLowerCase().includes(q) || String(s.code) === q);
  }, [selectable, slpSearch]);
  const chosen = selectable.find((s) => s.code === slp);
  const dates = periodDates(fy, type, index);
  const itemWise = rows.length > 0;
  const totalQty = rows.reduce((s, r) => s + (Number.isFinite(num(r.quantity)) ? num(r.quantity) || 0 : 0), 0);
  const totalAmt = rows.reduce((s, r) => s + (Number.isFinite(num(r.amount)) ? num(r.amount) || 0 : 0), 0);
  const amountNum = itemWise ? totalAmt : num(amount);
  const usedCodes = rows.map((r) => r.itemCode).filter(Boolean);

  const patchRow = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function body() {
    return {
      sapSlpCode: Number(slp), unitCode: unit, financialYear: fy, periodType: type, periodIndex: index,
      fromDate: type === 'Custom' ? fromDate : undefined, toDate: type === 'Custom' ? toDate : undefined,
      targetAmount: amountNum, remarks: remarks.trim() || undefined,
      lines: itemWise ? rows.map((r) => ({ itemCode: r.itemCode, targetQuantity: num(r.quantity) || 0, targetAmount: num(r.amount) || 0, remarks: r.remarks.trim() || undefined })) : undefined
    };
  }

  function validate(): string | null {
    if (!slp) return 'Select a salesperson.';
    if (type === 'Custom') {
      if (!fromDate || !toDate) return 'Select both From Date and To Date.';
      if (fromDate > toDate) return 'From Date must be on or before To Date.';
    }
    if (itemWise) {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const n = i + 1;
        if (!r.itemCode) return `Row ${n}: select an item.`;
        const q = num(r.quantity) || 0;
        const a = num(r.amount) || 0;
        if (q < 0 || a < 0) return `Row ${n}: quantity and amount can't be negative.`;
        if (q === 0 && a === 0) return `Row ${n}: enter a target quantity or amount.`;
        if (!Number.isInteger(a)) return `Row ${n}: the amount must be a whole number of rupees.`;
      }
    } else {
      if (!amount || !Number.isFinite(amountNum) || amountNum <= 0) return 'Enter a target amount greater than zero, or add item rows.';
      if (!Number.isInteger(amountNum)) return 'The target must be a whole number of rupees.';
    }
    return null;
  }

  async function save(thenSubmit: boolean) {
    if (busy) return; // prevent duplicate submissions
    const problem = validate();
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      const id = target ? await updateSalesTarget(target.id, body()).then(() => target.id) : await createSalesTarget(body());
      if (thenSubmit) await submitSalesTarget(id);
      onSaved(thenSubmit ? 'Target saved and submitted for approval.' : 'Draft saved.');
    } catch (err) {
      // Entered data is kept so the user can correct and retry.
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e?.response?.data?.message || e?.message || 'Unable to save the target.');
    } finally {
      setBusy(false);
    }
  }

  const field = 'px-3 py-2 text-sm rounded-lg border border-border-strong bg-surface text-ink-primary w-full min-w-0';
  const label = 'block text-xs text-ink-secondary mb-1';

  return (
    <Modal open={open} onClose={onClose} labelledBy="tg-form-title" variant="large">
      <form className="p-5 space-y-4 w-full" onSubmit={(e) => { e.preventDefault(); void save(false); }}>
        <h2 id="tg-form-title" className="text-lg font-semibold text-ink-primary">{target ? `Edit target #${target.id}` : 'New salesperson target'}</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="sm:col-span-2 relative">
            <label className={label} htmlFor="tf-sp">Salesperson (live from SAP)</label>
            <input id="tf-sp" className={field} placeholder={`Click to list all ${selectable.length} active salespersons, or type to search`} autoComplete="off" value={slpSearch}
              onFocus={() => setListOpen(true)}
              onChange={(e) => { setSlpSearch(e.target.value); setSlp(''); setListOpen(true); }} />
            {!chosen && listOpen && (
              <ul className="absolute z-30 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-border-strong bg-surface shadow-elevated">
                {matches.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-ink-tertiary">{selectable.length === 0 ? 'No active salespersons found in SAP.' : 'No active salesperson matches.'}</li>
                ) : matches.map((s) => (
                  <li key={s.code}>
                    <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-surface-tertiary" onClick={() => { setSlp(s.code); setSlpSearch(s.name); setListOpen(false); }}>
                      <span className="text-ink-primary">{s.name}</span> <span className="text-xs text-ink-tertiary">#{s.code}{s.active ? '' : ' · inactive'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <label className={label} htmlFor="tf-code">SAP salesperson code</label>
            <input id="tf-code" className={`${field} bg-surface-tertiary`} readOnly value={slp === '' ? '' : slp} placeholder="Filled after selecting" />
          </div>
          <div>
            <label className={label} htmlFor="tf-unit">Unit / branch</label>
            <select id="tf-unit" className={field} value={unit} onChange={(e) => setUnit(Number(e.target.value))}>
              <option value={-1}>All units (company-wide)</option>
              {options?.units.map((u) => <option key={u.code} value={u.code}>{u.label || u.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="tf-type">Target period</label>
            <select id="tf-type" className={field} value={type} onChange={(e) => { setType(e.target.value as SalesTargetPeriodType); setIndex(1); }}>
              <option value="Monthly">Monthly</option><option value="Quarterly">Quarterly</option><option value="Annual">Annual (financial year)</option><option value="Custom">Custom dates</option>
            </select>
          </div>
          {type === 'Custom' ? (
            <>
              <div>
                <label className={label} htmlFor="tf-from">From date</label>
                <input id="tf-from" type="date" className={field} value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor="tf-to">To date</label>
                <input id="tf-to" type="date" className={field} value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className={label} htmlFor="tf-fy">Financial year</label>
                <select id="tf-fy" className={field} value={fy} onChange={(e) => setFy(e.target.value)}>
                  {(options?.financialYears ?? [fy]).map((y) => <option key={y} value={y}>FY {y}</option>)}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="tf-idx">{type === 'Monthly' ? 'Month' : type === 'Quarterly' ? 'Quarter' : 'Year'}</label>
                <select id="tf-idx" className={field} value={index} onChange={(e) => setIndex(Number(e.target.value))}>
                  {periodChoices(type).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Period start – end</label>
                <input className={`${field} bg-surface-tertiary`} readOnly value={dates ? `${dates.start} – ${dates.end}` : ''} />
              </div>
            </>
          )}
          <div>
            <label className={label} htmlFor="tf-amt">{itemWise ? 'Total target amount (sum of item rows)' : 'Target amount (₹, whole rupees)'}</label>
            <input id="tf-amt" className={`${field} tabular-nums ${itemWise ? 'bg-surface-tertiary' : ''}`} inputMode="numeric" placeholder="e.g. 5000000"
              readOnly={itemWise} value={itemWise ? rupees.format(totalAmt) : amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))} />
            {!itemWise && amountNum > 0 && <p className="text-xs text-ink-tertiary mt-1">₹ {rupees.format(amountNum)}</p>}
          </div>
          <div>
            <label className={label} htmlFor="tf-cur">Currency</label>
            <input id="tf-cur" className={`${field} bg-surface-tertiary`} readOnly value="INR" />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="tf-rem">Remarks</label>
            <textarea id="tf-rem" rows={2} maxLength={500} className={field} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </div>

        <div className="border border-border rounded-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border">
            <div>
              <h3 className="font-semibold text-ink-primary">Item-wise targets <span className="text-xs font-normal text-ink-tertiary">(optional)</span></h3>
              <p className="text-xs text-ink-tertiary">Add rows to set a quantity and amount per SAP item; the total above is then calculated for you.</p>
            </div>
            <button type="button" className="btn-secondary" onClick={() => setRows((rs) => [...rs, blankRow()])}>
              <Plus className="h-4 w-4" /> Add item
            </button>
          </div>
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink-tertiary border-b border-border">
                    <th className="px-3 py-2 font-medium w-[22rem]">Item</th>
                    <th className="px-3 py-2 font-medium">Group</th>
                    <th className="px-3 py-2 font-medium">UOM</th>
                    <th className="px-3 py-2 font-medium text-right">Target quantity</th>
                    <th className="px-3 py-2 font-medium text-right">Target amount (₹)</th>
                    <th className="px-3 py-2 font-medium">Remarks</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.key} className="border-b border-border last:border-0 align-top">
                      <td className="px-3 py-2">
                        <ItemPicker
                          ariaLabel={`Item row ${i + 1}`}
                          value={r.itemCode ? { code: r.itemCode, name: r.itemName } : null}
                          excludeCodes={usedCodes.filter((c) => c !== r.itemCode)}
                          onSelect={(it) => patchRow(r.key, { itemCode: it.code, itemName: it.name, itemGroup: it.group, uom: it.uom })}
                        />
                      </td>
                      <td className="px-3 py-2 text-ink-secondary">{r.itemGroup ?? '—'}</td>
                      <td className="px-3 py-2 text-ink-secondary">{r.uom ?? '—'}</td>
                      <td className="px-3 py-2">
                        <input className={`${field} text-right tabular-nums`} inputMode="decimal" aria-label={`Quantity row ${i + 1}`} value={r.quantity}
                          onChange={(e) => patchRow(r.key, { quantity: e.target.value.replace(/[^\d.]/g, '') })} />
                      </td>
                      <td className="px-3 py-2">
                        <input className={`${field} text-right tabular-nums`} inputMode="numeric" aria-label={`Amount row ${i + 1}`} value={r.amount}
                          onChange={(e) => patchRow(r.key, { amount: e.target.value.replace(/[^\d]/g, '') })} />
                      </td>
                      <td className="px-3 py-2">
                        <input className={field} maxLength={300} aria-label={`Remarks row ${i + 1}`} value={r.remarks} onChange={(e) => patchRow(r.key, { remarks: e.target.value })} />
                      </td>
                      <td className="px-3 py-2">
                        <button type="button" className="btn-secondary !px-2 !py-1.5" title="Remove row" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold bg-surface-tertiary/60">
                    <td className="px-3 py-2" colSpan={3}>Total ({rows.length} item{rows.length === 1 ? '' : 's'})</td>
                    <td className="px-3 py-2 text-right tabular-nums">{qtyFmt.format(totalQty)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">₹ {rupees.format(totalAmt)}</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}

        <div className="flex flex-wrap justify-between gap-2">
          <button type="button" className="btn-secondary" onClick={clear} disabled={busy}>Clear</button>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn-secondary" disabled={busy}>{busy ? 'Saving…' : 'Save draft'}</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void save(true)}>{busy ? 'Saving…' : 'Save & submit'}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
