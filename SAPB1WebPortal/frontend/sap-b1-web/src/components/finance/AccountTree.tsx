import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FileText } from 'lucide-react';
import type { Account } from '../../types';

interface TreeNode {
  account: Account;
  children: TreeNode[];
}

function buildTree(accounts: Account[]): TreeNode[] {
  const byCode = new Map<string, TreeNode>();
  accounts.forEach((a) => byCode.set(a.acctCode, { account: a, children: [] }));

  const roots: TreeNode[] = [];
  byCode.forEach((node) => {
    const parentCode = node.account.parentCode;
    if (parentCode && byCode.has(parentCode)) {
      byCode.get(parentCode)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function formatCurrency(value: number, currency: string | null) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'INR', maximumFractionDigits: 0 }).format(value);
  } catch {
    return value.toLocaleString();
  }
}

export default function AccountTree({ accounts }: { accounts: Account[] }) {
  const tree = useMemo(() => buildTree(accounts), [accounts]);

  if (accounts.length === 0) return null;

  return (
    <div className="space-y-1">
      {tree.map((node) => (
        <TreeRow key={node.account.acctCode} node={node} depth={0} />
      ))}
    </div>
  );
}

function TreeRow({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <button
        className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-surface-tertiary transition-colors text-left"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => hasChildren && setOpen((o) => !o)}
      >
        {hasChildren ? (
          open ? <ChevronDown className="h-3.5 w-3.5 text-ink-tertiary shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-ink-tertiary shrink-0" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {hasChildren ? <Folder className="h-3.5 w-3.5 text-brand-500 shrink-0" /> : <FileText className="h-3.5 w-3.5 text-ink-tertiary shrink-0" />}
        <span className={`flex-1 min-w-0 truncate text-sm ${hasChildren ? 'font-medium text-ink-primary' : 'text-ink-secondary'}`}>
          {node.account.acctName}
        </span>
        <span className="text-[11px] text-ink-tertiary shrink-0 hidden sm:inline">{node.account.acctCode}</span>
        {node.account.postable && (
          <span className="text-xs font-medium tabular-nums text-ink-primary shrink-0 w-24 text-right">
            {formatCurrency(node.account.balance, node.account.currency)}
          </span>
        )}
      </button>
      {hasChildren && open && (
        <div>
          {node.children.map((child) => (
            <TreeRow key={child.account.acctCode} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
