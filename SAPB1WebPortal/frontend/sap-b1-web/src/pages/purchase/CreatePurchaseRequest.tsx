import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  PartyPopper
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { createPurchaseRequest } from '../../api/purchase';
import { getWarehouses } from '../../api/warehouses';
import ItemPicker from '../../components/purchase/ItemPicker';
import Modal from '../../components/ui/Modal';
import type { CreatePurchaseRequestLine, CreatePurchaseRequestResult, ItemListItem, Warehouse } from '../../types';

interface LineRow {
  id: number;
  itemCode: string;
  itemName: string;
  quantity: string;
  warehouseCode: string;
  capitalOrRevenue: 'Revenue' | 'Capital';
  requiredDate: string;
  remarks: string;
}

let nextLineId = 1;

function emptyLine(): LineRow {
  return {
    id: nextLineId++,
    itemCode: '',
    itemName: '',
    quantity: '',
    warehouseCode: '',
    capitalOrRevenue: 'Revenue',
    requiredDate: '',
    remarks: ''
  };
}

export default function CreatePurchaseRequest() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [requester, setRequester] = useState(user?.username || '');
  const [requiredDate, setRequiredDate] = useState('');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<LineRow[]>([emptyLine()]);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehousesError, setWarehousesError] = useState<string | null>(null);

  const [itemPickerLineId, setItemPickerLineId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreatePurchaseRequestResult | null>(null);

  useEffect(() => {
    getWarehouses()
      .then(setWarehouses)
      .catch((err) => setWarehousesError(err?.response?.data?.message || err.message || 'Failed to load warehouses.'));
  }, []);

  function updateLine(id: number, patch: Partial<LineRow>) {
    setLines((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addLine() {
    setLines((rows) => [...rows, emptyLine()]);
  }

  function removeLine(id: number) {
    setLines((rows) => rows.filter((r) => r.id !== id));
  }

  function handleItemSelect(lineId: number, item: ItemListItem) {
    updateLine(lineId, { itemCode: item.itemCode, itemName: item.itemName });
  }

  function validate(): string | null {
    if (!requiredDate) return 'Required Date is required.';
    if (lines.length === 0) return 'At least one line is required.';

    const seen = new Set<string>();
    for (const line of lines) {
      if (!line.itemCode) return 'Every line needs an item — use the search button to pick one.';
      const qty = Number(line.quantity);
      if (!line.quantity || Number.isNaN(qty) || qty <= 0) return `Quantity for '${line.itemCode}' must be greater than zero.`;
      if (!line.warehouseCode) return `Warehouse is required for item '${line.itemCode}'.`;

      const key = `${line.itemCode.toUpperCase()}::${line.warehouseCode.toUpperCase()}`;
      if (seen.has(key)) return `Duplicate line: item '${line.itemCode}' in warehouse '${line.warehouseCode}' appears more than once.`;
      seen.add(key);
    }
    return null;
  }

  function resetForm() {
    setRequester(user?.username || '');
    setRequiredDate('');
    setRemarks('');
    setLines([emptyLine()]);
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return; // duplicate-submission guard

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const payloadLines: CreatePurchaseRequestLine[] = lines.map((l) => ({
        itemCode: l.itemCode,
        quantity: Number(l.quantity),
        warehouseCode: l.warehouseCode,
        requiredDate: l.requiredDate || undefined,
        remarks: l.remarks || undefined,
        capitalOrRevenue: l.capitalOrRevenue
      }));

      const created = await createPurchaseRequest({
        requester: requester || undefined,
        requiredDate,
        remarks: remarks || undefined,
        lines: payloadLines
      });

      setResult(created);
      toast.show({ variant: 'success', title: 'Purchase Request created', description: `SAP B1 DocNum #${created.docNum}` });
    } catch (err: any) {
      const message = err?.response?.data?.message || err.message || 'Failed to create the purchase request.';
      setError(message);
      toast.show({ variant: 'error', title: 'Purchase Request not created', description: message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <Link to="/purchase/requests" className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" />
        Back to Purchase Requests
      </Link>

      <div className="card">
        <div className="mb-6">
          <p className="text-xs font-medium text-ink-tertiary uppercase tracking-wide mb-1">New Document</p>
          <h1 className="text-xl font-semibold text-ink-primary">Purchase Request</h1>
          <p className="text-ink-secondary text-sm mt-0.5">
            Creates a real Purchase Request in SAP Business One ({user?.companyName || user?.company}).
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="flex items-start gap-2 bg-danger-bg text-danger text-sm rounded-lg px-3.5 py-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {warehousesError && (
            <div className="flex items-start gap-2 bg-danger-bg text-danger text-sm rounded-lg px-3.5 py-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {warehousesError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-1.5">Requester</label>
              <input className="input-field" value={requester} onChange={(e) => setRequester(e.target.value)} placeholder="Requester name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-secondary mb-1.5">Required Date *</label>
              <input
                type="date"
                className="input-field"
                value={requiredDate}
                onChange={(e) => setRequiredDate(e.target.value)}
                required
              />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-sm font-medium text-ink-secondary mb-1.5">Remarks</label>
              <input className="input-field" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional note" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-ink-primary">Items</h2>
              <button type="button" onClick={addLine} className="btn-secondary text-sm py-1.5 px-3">
                <Plus className="h-4 w-4" />
                Add Line
              </button>
            </div>

            <div className="space-y-3">
              {lines.map((line, index) => (
                <div key={line.id} className="rounded-xl border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-ink-tertiary uppercase tracking-wide">Line {index + 1}</span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="text-ink-tertiary hover:text-danger"
                        aria-label={`Remove line ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-ink-secondary mb-1.5">Item *</label>
                      {line.itemCode ? (
                        <button
                          type="button"
                          onClick={() => setItemPickerLineId(line.id)}
                          className="input-field text-left flex items-center justify-between"
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-medium text-ink-primary">{line.itemCode}</span>
                            {line.itemName && <span className="text-ink-tertiary"> — {line.itemName}</span>}
                          </span>
                          <Search className="h-4 w-4 text-ink-tertiary shrink-0 ml-2" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setItemPickerLineId(line.id)}
                          className="input-field text-left flex items-center gap-2 text-ink-tertiary"
                        >
                          <Search className="h-4 w-4 shrink-0" />
                          Search for an item…
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-ink-secondary mb-1.5">Quantity *</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          className="input-field"
                          value={line.quantity}
                          onChange={(e) => updateLine(line.id, { quantity: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-ink-secondary mb-1.5">Warehouse *</label>
                        <select
                          className="input-field appearance-none"
                          value={line.warehouseCode}
                          onChange={(e) => updateLine(line.id, { warehouseCode: e.target.value })}
                          disabled={warehouses.length === 0}
                        >
                          <option value="">Select…</option>
                          {warehouses.map((w) => (
                            <option key={w.warehouseCode} value={w.warehouseCode}>
                              {w.warehouseCode} — {w.warehouseName}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-ink-secondary mb-1.5">Line Required Date</label>
                      <input
                        type="date"
                        className="input-field"
                        value={line.requiredDate}
                        onChange={(e) => updateLine(line.id, { requiredDate: e.target.value })}
                        placeholder="Same as header"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-ink-secondary mb-1.5">
                        Type * <span className="normal-case text-ink-tertiary">(SAP B1 required)</span>
                      </label>
                      <select
                        className="input-field appearance-none"
                        value={line.capitalOrRevenue}
                        onChange={(e) => updateLine(line.id, { capitalOrRevenue: e.target.value as 'Revenue' | 'Capital' })}
                      >
                        <option value="Revenue">Revenue</option>
                        <option value="Capital">Capital</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-ink-secondary mb-1.5">Line Remarks</label>
                      <input
                        className="input-field"
                        value={line.remarks}
                        onChange={(e) => updateLine(line.id, { remarks: e.target.value })}
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button type="submit" className="btn-primary px-6" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating Purchase Request…
                </>
              ) : (
                'Create Purchase Request'
              )}
            </button>
          </div>
        </form>
      </div>

      <ItemPicker
        open={itemPickerLineId !== null}
        onClose={() => setItemPickerLineId(null)}
        onSelect={(item) => {
          if (itemPickerLineId !== null) handleItemSelect(itemPickerLineId, item);
        }}
      />

      <Modal open={result !== null} onClose={() => {}} variant="sheet" labelledBy="pr-success-label">
        {result && (
          <div className="p-6 text-center">
            <div className="h-14 w-14 rounded-full bg-success-bg text-success flex items-center justify-center mx-auto mb-4">
              <PartyPopper className="h-6 w-6" />
            </div>
            <h2 id="pr-success-label" className="text-lg font-semibold text-ink-primary mb-1">
              Purchase Request Created
            </h2>
            <p className="text-ink-secondary text-sm mb-5">Created successfully in SAP Business One.</p>

            <div className="rounded-xl border border-border divide-y divide-border text-sm text-left mb-6">
              <Row label="Purchase Request #" value={`#${result.docNum}`} />
              <Row label="SAP Business One DocEntry" value={String(result.docEntry)} />
              <Row label="Company" value={result.company} />
              <Row
                label="Status"
                value={
                  <span className="inline-flex items-center gap-1 text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {result.status}
                  </span>
                }
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                className="btn-secondary flex-1"
                onClick={() => {
                  const entry = result.docEntry;
                  setResult(null);
                  navigate(`/purchase/requests/${entry}`);
                }}
              >
                View Purchase Request
              </button>
              <button
                className="btn-primary flex-1"
                onClick={() => {
                  setResult(null);
                  resetForm();
                }}
              >
                Create Another
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-ink-tertiary">{label}</span>
      <span className="font-medium text-ink-primary">{value}</span>
    </div>
  );
}
