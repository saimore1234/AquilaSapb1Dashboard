import { useState } from 'react';
import { ChevronDown, ChevronRight, Package, Boxes } from 'lucide-react';
import type { BomComponent } from '../../types';

/** Modern BOM visualization: the finished item at the top, its real
 * components below. Desktop shows a connected tree; mobile collapses each
 * component into an expandable card. Every row comes straight from
 * ITT1 — nothing here is invented. */
export default function BomTree({
  parentCode,
  parentName,
  quantity,
  uom,
  components
}: {
  parentCode: string;
  parentName: string | null;
  quantity: number;
  uom?: string | null;
  components: BomComponent[];
}) {
  return (
    <div className="space-y-4">
      {/* Parent / finished good */}
      <div className="flex justify-center">
        <div className="rounded-xl border-2 border-brand-500 bg-brand-50 dark:bg-brand-500/10 px-5 py-3 text-center">
          <p className="text-[11px] font-medium text-brand-600 dark:text-brand-300 uppercase tracking-wide flex items-center justify-center gap-1.5">
            <Boxes className="h-3.5 w-3.5" /> Finished Product
          </p>
          <p className="text-sm font-semibold text-brand-700 dark:text-brand-200 mt-0.5">{parentName || parentCode}</p>
          <p className="text-xs text-ink-tertiary">
            {parentCode} · Base Qty {quantity.toLocaleString()}
            {uom ? ` ${uom}` : ''}
          </p>
        </div>
      </div>

      {components.length === 0 ? (
        <p className="text-sm text-ink-tertiary text-center py-6">This BOM has no component lines.</p>
      ) : (
        <>
          <div className="flex justify-center">
            <div className="h-6 w-px bg-border" />
          </div>

          {/* Desktop: connected tree */}
          <div className="hidden md:block">
            <div className="flex justify-center">
              <div className="border-t border-border" style={{ width: `${Math.min(components.length * 180, 960)}px` }} />
            </div>
            <div className="flex justify-center gap-4 flex-wrap pt-4">
              {components.map((c) => (
                <div key={c.childNum} className="w-44 shrink-0">
                  <div className="flex justify-center mb-2">
                    <div className="h-4 w-px bg-border" />
                  </div>
                  <ComponentCard component={c} />
                </div>
              ))}
            </div>
          </div>

          {/* Mobile: expandable cards */}
          <div className="md:hidden space-y-2">
            {components.map((c) => (
              <MobileComponentRow key={c.childNum} component={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ComponentCard({ component: c }: { component: BomComponent }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-center h-full">
      <Package className="h-4 w-4 mx-auto mb-1 text-ink-tertiary" />
      <p className="text-sm font-medium text-ink-primary truncate">{c.itemName || c.itemCode}</p>
      <p className="text-[11px] text-ink-tertiary truncate">{c.itemCode}</p>
      <p className="text-sm font-semibold text-ink-primary mt-1.5 tabular-nums">
        {c.quantity.toLocaleString()} {c.uom || ''}
      </p>
      {c.warehouse && <p className="text-[11px] text-ink-tertiary mt-0.5">{c.warehouse}</p>}
    </div>
  );
}

function MobileComponentRow({ component: c }: { component: BomComponent }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <button className="w-full flex items-center justify-between px-3.5 py-3" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center gap-2.5 min-w-0">
          <Package className="h-4 w-4 text-ink-tertiary shrink-0" />
          <div className="min-w-0 text-left">
            <p className="text-sm font-medium text-ink-primary truncate">{c.itemName || c.itemCode}</p>
            <p className="text-xs text-ink-tertiary">{c.itemCode}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-semibold tabular-nums text-ink-primary">
            {c.quantity.toLocaleString()} {c.uom || ''}
          </span>
          {open ? <ChevronDown className="h-4 w-4 text-ink-tertiary" /> : <ChevronRight className="h-4 w-4 text-ink-tertiary" />}
        </div>
      </button>
      {open && (
        <div className="px-3.5 pb-3 pt-0.5 grid grid-cols-2 gap-2 text-xs border-t border-border">
          <Field label="Warehouse" value={c.warehouse} />
          <Field label="Issue Method" value={c.issueMethod} />
          <Field label="Unit" value={c.uom} />
          {c.additionalQuantity !== 0 && <Field label="Additional/Scrap Qty" value={c.additionalQuantity.toLocaleString()} />}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="pt-2">
      <p className="text-ink-tertiary">{label}</p>
      <p className="text-ink-primary font-medium">{value || '—'}</p>
    </div>
  );
}
