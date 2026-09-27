import { Link } from 'react-router-dom';
import { ArrowRight, ArrowDown, FileText } from 'lucide-react';
import type { RelatedDocument } from '../../types';

type FlowNode =
  | { kind: 'current'; label: string; docNum: number }
  | { kind: 'related'; doc: RelatedDocument };

/**
 * Renders the real document chain around the document currently being
 * viewed — built entirely from RelatedDocumentDto entries the API resolved
 * from SAP B1's own BaseType/BaseEntry / TargetType/TrgetEntry fields.
 * Never assumes a fixed chain: a document with no links (a standalone Sales
 * Order, say) simply shows itself with nothing before or after it, rather
 * than greyed-out placeholder steps for a chain that doesn't exist for this
 * specific document. Mirrors components/purchase/DocumentFlow.tsx but links
 * into the /sales/* route tree instead of /purchase/*.
 */
export default function SalesDocumentFlow({
  currentLabel,
  currentDocNum,
  related
}: {
  currentLabel: string;
  currentDocNum: number;
  related: RelatedDocument[];
}) {
  const base = related.filter((r) => r.direction === 'Base');
  const targets = related.filter((r) => r.direction === 'Target');

  if (base.length === 0 && targets.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-tertiary">
        <FileText className="h-4 w-4" />
        No related documents — this {currentLabel.toLowerCase()} wasn't created from another document, and nothing has been created from it yet.
      </div>
    );
  }

  const nodes: FlowNode[] = [
    ...base.map((doc): FlowNode => ({ kind: 'related', doc })),
    { kind: 'current', label: currentLabel, docNum: currentDocNum },
    ...targets.map((doc): FlowNode => ({ kind: 'related', doc }))
  ];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 flex-wrap">
      {nodes.map((node, idx) => (
        <div key={idx} className="flex items-center gap-2 sm:gap-3">
          {idx > 0 && (
            <>
              <ArrowRight className="hidden sm:block h-4 w-4 text-ink-tertiary shrink-0" />
              <ArrowDown className="sm:hidden h-4 w-4 text-ink-tertiary shrink-0" />
            </>
          )}
          {node.kind === 'current' ? (
            <div className="shrink-0 rounded-xl border-2 border-brand-500 bg-brand-50 dark:bg-brand-500/10 px-3.5 py-2.5 text-center">
              <p className="text-[11px] font-medium text-brand-600 dark:text-brand-300 uppercase tracking-wide">{node.label}</p>
              <p className="text-sm font-semibold text-brand-700 dark:text-brand-200">#{node.docNum}</p>
            </div>
          ) : (
            <Link
              to={`/sales/${node.doc.routeSegment}/${node.doc.docEntry}`}
              className="shrink-0 rounded-xl border border-border bg-surface hover:bg-surface-tertiary transition-colors px-3.5 py-2.5 text-center"
            >
              <p className="text-[11px] font-medium text-ink-tertiary uppercase tracking-wide">{node.doc.documentType}</p>
              <p className="text-sm font-semibold text-brand-600 dark:text-brand-400">#{node.doc.docNum}</p>
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
