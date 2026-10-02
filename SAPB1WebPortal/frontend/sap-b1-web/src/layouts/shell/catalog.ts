import {
  Home,
  Users,
  ShoppingCart,
  ShoppingBag,
  Warehouse,
  Factory,
  Wallet,
  Landmark,
  FileBarChart,
  ShieldCheck,
  type LucideIcon
} from 'lucide-react';

/** A link in the mega-menu. `to` omitted = the screen doesn't exist yet; it's
 *  shown disabled with a "Soon" tag rather than linking to a fake page. */
export interface ShellLink {
  label: string;
  to?: string;
  requiredPermission?: string;
}

export interface ShellSection {
  title: string;
  links: ShellLink[];
}

export interface ShellModule {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Where the module bar tab navigates. */
  to: string;
  /** Route prefixes that make this module "active" in the module bar. */
  match: string[];
  sections: ShellSection[];
  requiredPermission?: string;
}

export const shellModules: ShellModule[] = [
  {
    key: 'home',
    label: 'Home',
    icon: Home,
    to: '/',
    match: ['/', '/dashboard'],
    sections: [
      {
        title: 'General',
        links: [{ label: 'Home', to: '/' }]
      }
    ]
  },
  {
    key: 'business-partners',
    label: 'Business Partners',
    icon: Users,
    to: '/customers',
    match: ['/customers', '/suppliers', '/business-partners'],
    sections: [
      {
        title: 'Business Partners',
        links: [
          { label: 'Customers', to: '/customers' },
          { label: 'Suppliers', to: '/suppliers' },
          { label: 'Business Partner Ledger', to: '/finance/bp-ledger' }
        ]
      }
    ]
  },
  {
    key: 'sales',
    label: 'Sales',
    icon: ShoppingCart,
    to: '/sales',
    match: ['/sales'],
    sections: [
      {
        title: 'Sales',
        links: [
          { label: 'Sales Dashboard', to: '/sales' },
          { label: 'Sales Quotations', to: '/sales/quotations' },
          { label: 'Sales Orders', to: '/sales/orders' },
          { label: 'Deliveries', to: '/sales/deliveries' },
          { label: 'A/R Invoices', to: '/sales/invoices' },
          { label: 'A/R Credit Memos', to: '/sales/credit-memos' },
          { label: 'Incoming Payments', to: '/sales/payments' }
        ]
      }
    ]
  },
  {
    key: 'purchase',
    label: 'Purchasing',
    icon: ShoppingBag,
    to: '/purchase',
    match: ['/purchase'],
    sections: [
      {
        title: 'Purchasing',
        links: [
          { label: 'Purchase Dashboard', to: '/purchase' },
          { label: 'Purchase Requests', to: '/purchase/requests' },
          { label: 'Purchase Quotations', to: '/purchase/quotations' },
          { label: 'Purchase Orders', to: '/purchase/orders' },
          { label: 'GRPO', to: '/purchase/grpo' },
          { label: 'A/P Invoices', to: '/purchase/invoices' },
          { label: 'A/P Credit Memos', to: '/purchase/credit-memos' },
          { label: 'Outgoing Payments', to: '/purchase/payments' }
        ]
      }
    ]
  },
  {
    key: 'inventory',
    label: 'Inventory',
    icon: Warehouse,
    to: '/inventory',
    match: ['/inventory', '/items'],
    sections: [
      {
        title: 'Inventory',
        links: [
          { label: 'Inventory Dashboard', to: '/inventory' },
          { label: 'Items', to: '/items' },
          { label: 'Warehouses' },
          { label: 'Stock', to: '/inventory' },
          { label: 'Stock Transfer' },
          { label: 'Inventory Reports', to: '/reports/inventory' }
        ]
      }
    ]
  },
  {
    key: 'production',
    label: 'Production',
    icon: Factory,
    to: '/production',
    match: ['/production'],
    sections: [
      {
        title: 'Production',
        links: [
          { label: 'Production Dashboard', to: '/production' },
          { label: 'Bill of Materials', to: '/production/boms' },
          { label: 'Production Orders', to: '/production/orders' },
          { label: 'Material Issue', to: '/production/consumption' },
          { label: 'Receipt from Production', to: '/production/receipts' },
          { label: 'Production Reports', to: '/reports/production' }
        ]
      }
    ]
  },
  {
    key: 'finance',
    label: 'Finance',
    icon: Wallet,
    to: '/finance',
    match: ['/finance'],
    sections: [
      {
        title: 'Finance',
        links: [
          { label: 'Finance Dashboard', to: '/finance' },
          { label: 'Chart of Accounts', to: '/finance/chart-of-accounts' },
          { label: 'Journal Entries', to: '/finance/journal-entries' },
          { label: 'General Ledger', to: '/finance/ledger' },
          { label: 'Receivables (A/R)', to: '/finance/receivables' },
          { label: 'Payables (A/P)', to: '/finance/payables' },
          { label: 'Trial Balance', to: '/finance/trial-balance' },
          { label: 'Profit & Loss', to: '/finance/profit-loss' },
          { label: 'Balance Sheet', to: '/finance/balance-sheet' }
        ]
      }
    ]
  },
  {
    key: 'banking',
    label: 'Banking',
    icon: Landmark,
    to: '/finance/bank-cash',
    match: ['/finance/bank-cash', '/finance/incoming-payments', '/finance/outgoing-payments'],
    sections: [
      {
        title: 'Banking',
        links: [
          { label: 'Bank / Cash', to: '/finance/bank-cash' },
          { label: 'Incoming Payments', to: '/finance/incoming-payments' },
          { label: 'Outgoing Payments', to: '/finance/outgoing-payments' }
        ]
      }
    ]
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: FileBarChart,
    to: '/reports',
    match: ['/reports'],
    sections: [
      {
        title: 'Reports',
        links: [
          { label: 'Report Center', to: '/reports' },
          { label: 'Sales Reports', to: '/reports/sales' },
          { label: 'Purchase Reports', to: '/reports/purchase' },
          { label: 'Inventory Reports', to: '/reports/inventory' },
          { label: 'Production Reports', to: '/reports/production' },
          { label: 'Finance Reports', to: '/reports/finance' },
          { label: 'Tax / GST Reports', to: '/reports/tax' },
          { label: 'Business Partner Reports', to: '/reports/business-partners' }
        ]
      }
    ]
  },
  {
    key: 'administration',
    label: 'Administration',
    icon: ShieldCheck,
    to: '/administration/users',
    match: ['/administration'],
    requiredPermission: 'Administration.View',
    sections: [
      {
        title: 'Administration',
        links: [
          { label: 'Users', to: '/administration/users' },
          { label: 'Roles', to: '/administration/roles' },
          { label: 'Permissions', to: '/administration/permissions' },
          { label: 'Server Configuration', to: '/administration/server-configuration', requiredPermission: 'ServerConfiguration.View' },
          { label: 'Audit Log' }
        ]
      }
    ]
  }
];

export function isModuleActive(m: ShellModule, pathname: string): boolean {
  if (m.key === 'home') return pathname === '/' || pathname === '/dashboard';
  return m.match.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

/** Banking claims its three finance routes, so Finance must not light up for them. */
export function activeModuleKey(pathname: string): string | null {
  const banking = shellModules.find((m) => m.key === 'banking')!;
  if (isModuleActive(banking, pathname)) return 'banking';
  return shellModules.find((m) => isModuleActive(m, pathname))?.key ?? null;
}

/** Human title for a route, used by Recent Documents and Favorites. */
const TITLES: Array<[RegExp, string]> = [
  [/^\/customers\/(.+)$/, 'Customer $1'],
  [/^\/suppliers\/(.+)$/, 'Supplier $1'],
  [/^\/items\/(.+)$/, 'Item $1'],
  [/^\/sales\/quotations\/(.+)$/, 'Sales Quotation $1'],
  [/^\/sales\/orders\/(.+)$/, 'Sales Order $1'],
  [/^\/sales\/deliveries\/(.+)$/, 'Delivery $1'],
  [/^\/sales\/invoices\/(.+)$/, 'A/R Invoice $1'],
  [/^\/sales\/credit-memos\/(.+)$/, 'A/R Credit Memo $1'],
  [/^\/sales\/payments\/(.+)$/, 'Incoming Payment $1'],
  [/^\/purchase\/requests\/(?!new$)(.+)$/, 'Purchase Request $1'],
  [/^\/purchase\/quotations\/(.+)$/, 'Purchase Quotation $1'],
  [/^\/purchase\/orders\/(.+)$/, 'Purchase Order $1'],
  [/^\/purchase\/grpo\/(.+)$/, 'GRPO $1'],
  [/^\/purchase\/invoices\/(.+)$/, 'A/P Invoice $1'],
  [/^\/purchase\/credit-memos\/(.+)$/, 'A/P Credit Memo $1'],
  [/^\/purchase\/payments\/(.+)$/, 'Outgoing Payment $1'],
  [/^\/production\/boms\/(.+)$/, 'BOM $1'],
  [/^\/production\/orders\/(.+)$/, 'Production Order $1'],
  [/^\/finance\/journal-entries\/(.+)$/, 'Journal Entry $1']
];

/** Document-detail routes get a title; list/dashboard pages return null (not tracked as "documents"). */
export function documentTitle(pathname: string): string | null {
  for (const [re, tpl] of TITLES) {
    const m = pathname.match(re);
    if (m) return tpl.replace('$1', decodeURIComponent(m[1]));
  }
  return null;
}

/** Title for any route, for Favorites. Falls back to the matching mega-menu link, then the path. */
export function pageTitle(pathname: string): string {
  const doc = documentTitle(pathname);
  if (doc) return doc;
  for (const m of shellModules) {
    for (const s of m.sections) {
      const l = s.links.find((x) => x.to === pathname);
      if (l) return l.label;
    }
  }
  return pathname === '/' ? 'Home' : pathname;
}
