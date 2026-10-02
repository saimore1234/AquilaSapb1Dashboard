import { useEffect, useRef, useState } from 'react';
import { Loader2, Printer, AlertCircle, ChevronDown, Check } from 'lucide-react';
import { fetchPrintLayouts, fetchPrintPdf, PrintError, type PrintDocumentType, type PrintLayout } from '../api/print';
import { useClickOutside } from '../hooks/useClickOutside';

/**
 * Print → pick one of the Crystal layouts SAP Business One holds for this
 * document type in the logged-in company → the PDF rendered from THAT layout
 * opens in a new tab (browser viewer = preview / print / download).
 * No layout is ever built here.
 *
 * The layout list is prefetched when the page opens, so the menu appears instantly.
 */
export default function PrintButton({ documentType, docEntry }: { documentType: PrintDocumentType; docEntry: number }) {
  const [layouts, setLayouts] = useState<PrintLayout[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [error, setError] = useState<PrintError | null>(null);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null!);
  useClickOutside(ref, () => setOpen(false), open);

  function loadLayouts() {
    setLoadFailed(false);
    fetchPrintLayouts(documentType, docEntry)
      .then(setLayouts)
      .catch(() => setLoadFailed(true));
  }

  useEffect(() => {
    setLayouts(null);
    loadLayouts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentType, docEntry]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  async function print(layout: PrintLayout) {
    if (busyCode) return;
    setBusyCode(layout.code);
    setLastCode(layout.code);
    setError(null);
    // Open the tab synchronously inside the click so popup blockers allow it.
    const tab = window.open('', '_blank');
    try {
      const blob = await fetchPrintPdf(documentType, docEntry, layout.code);
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else window.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setOpen(false);
    } catch (e) {
      tab?.close();
      setError(e instanceof PrintError ? e : new PrintError('render-failed', 'Unable to render the configured SAP Business One print format.'));
    } finally {
      setBusyCode(null);
    }
  }

  const retry = () => {
    const layout = layouts?.find((l) => l.code === lastCode);
    if (layout) void print(layout);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setError(null);
          if (loadFailed) loadLayouts();
        }}
        className="btn-secondary"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Print — choose a SAP Business One print layout"
      >
        <Printer className="h-4 w-4" />
        Print
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface text-ink-primary shadow-popover overflow-hidden animate-slide-up">
          <div className="px-3.5 py-2 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">
            SAP Business One print layouts
          </div>

          {error && (
            <div role="alert" className="m-2 rounded-md border border-danger/30 bg-danger-bg text-danger text-sm p-2.5 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p>{error.message}</p>
                {error.kind === 'render-failed' && (
                  <button type="button" onClick={retry} className="mt-1.5 text-xs font-medium underline">
                    Retry
                  </button>
                )}
              </div>
            </div>
          )}

          {loadFailed ? (
            <p className="px-3.5 py-4 text-sm text-ink-secondary">
              Unable to load the print layouts.{' '}
              <button type="button" onClick={loadLayouts} className="underline font-medium">
                Retry
              </button>
            </p>
          ) : layouts === null ? (
            <div className="px-3.5 py-4 text-sm text-ink-secondary flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading layouts…
            </div>
          ) : layouts.length === 0 ? (
            <p className="px-3.5 py-4 text-sm text-ink-secondary">No SAP Business One print layout is configured for this document.</p>
          ) : (
            <ul role="listbox" aria-label="Print layouts" className="max-h-72 overflow-y-auto py-1">
              {layouts.map((l) => (
                <li key={l.code} role="option" aria-selected={busyCode === l.code}>
                  <button
                    type="button"
                    disabled={busyCode !== null}
                    onClick={() => void print(l)}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-sm hover:bg-surface-tertiary disabled:opacity-60 focus-visible:outline-none focus-visible:bg-surface-tertiary"
                  >
                    {busyCode === l.code ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <Printer className="h-4 w-4 shrink-0 text-ink-tertiary" />}
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{l.name}</span>
                      <span className="block text-[11px] text-ink-tertiary">{l.code}</span>
                    </span>
                    {l.isDefault && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                        <Check className="h-3 w-3" /> Default
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
