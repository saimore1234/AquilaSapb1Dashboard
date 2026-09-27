import {
  LayoutDashboard,
  Users,
  Package,
  Warehouse,
  ShoppingCart,
  ShoppingBag,
  Factory,
  Wallet,
  Contact,
  FileBarChart,
  ShieldCheck,
  type LucideIcon
} from 'lucide-react';

export interface NavChild {
  to: string;
  label: string;
  end?: boolean;
  /** Hides this item unless the current user has this permission (see AuthContext.can). Omitted = always visible to any authenticated user, same as before RBAC existed. */
  requiredPermission?: string;
}

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  to?: string;
  end?: boolean;
  children?: NavChild[];
  /** true = a real, working module backed by the current API.
   *  false = shown in the UI (per the requested navigation structure) but
   *  routes to a "Coming soon" page because the backend doesn't expose this
   *  module yet — see README section 14 / the roadmap. Never fabricated data. */
  available: boolean;
  /** Hides this item (and, for a group, all its children) unless the current
   *  user has this permission. Omitted = always visible, same as before RBAC existed. */
  requiredPermission?: string;
}

export const navItems: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/', end: true, available: true },
  {
    key: 'business-partners',
    label: 'Business Partners',
    icon: Users,
    available: true,
    children: [
      { to: '/customers', label: 'Customers' },
      { to: '/suppliers', label: 'Suppliers' }
    ]
  },
  { key: 'items', label: 'Items', icon: Package, to: '/items', available: true },
  { key: 'inventory', label: 'Inventory', icon: Warehouse, to: '/inventory', available: true },
  {
    key: 'sales',
    label: 'Sales',
    icon: ShoppingCart,
    available: true,
    children: [
      { to: '/sales', label: 'Dashboard', end: true },
      { to: '/sales/quotations', label: 'Quotations' },
      { to: '/sales/orders', label: 'Orders' },
      { to: '/sales/deliveries', label: 'Deliveries' },
      { to: '/sales/invoices', label: 'A/R Invoices' },
      { to: '/sales/credit-memos', label: 'Credit Memos' },
      { to: '/sales/payments', label: 'Payments' },
      { to: '/sales/analytics', label: 'Analytics' }
    ]
  },
  {
    key: 'purchase',
    label: 'Purchase',
    icon: ShoppingBag,
    available: true,
    children: [
      { to: '/purchase', label: 'Dashboard', end: true },
      { to: '/purchase/requests', label: 'Requests' },
      { to: '/purchase/quotations', label: 'Quotations' },
      { to: '/purchase/orders', label: 'Orders' },
      { to: '/purchase/grpo', label: 'GRPO' },
      { to: '/purchase/invoices', label: 'A/P Invoices' },
      { to: '/purchase/credit-memos', label: 'Credit Memos' },
      { to: '/purchase/payments', label: 'Payments' },
      { to: '/purchase/analytics', label: 'Analytics' }
    ]
  },
  {
    key: 'production',
    label: 'Production',
    icon: Factory,
    available: true,
    children: [
      { to: '/production', label: 'Dashboard', end: true },
      { to: '/production/boms', label: 'BOM' },
      { to: '/production/orders', label: 'Production Orders' },
      { to: '/production/material-requirements', label: 'Material Requirements' },
      { to: '/production/consumption', label: 'Consumption' },
      { to: '/production/receipts', label: 'Receipts' },
      { to: '/production/analytics', label: 'Analytics' }
    ]
  },
  {
    key: 'finance',
    label: 'Finance',
    icon: Wallet,
    available: true,
    children: [
      { to: '/finance', label: 'Dashboard', end: true },
      { to: '/finance/chart-of-accounts', label: 'Chart of Accounts' },
      { to: '/finance/ledger', label: 'General Ledger' },
      { to: '/finance/journal-entries', label: 'Journal Entries' },
      { to: '/finance/bp-ledger', label: 'BP Ledger' },
      { to: '/finance/receivables', label: 'Receivables' },
      { to: '/finance/payables', label: 'Payables' },
      { to: '/finance/incoming-payments', label: 'Incoming Payments' },
      { to: '/finance/outgoing-payments', label: 'Outgoing Payments' },
      { to: '/finance/bank-cash', label: 'Bank / Cash' },
      { to: '/finance/trial-balance', label: 'Trial Balance' },
      { to: '/finance/profit-loss', label: 'Profit & Loss' },
      { to: '/finance/balance-sheet', label: 'Balance Sheet' },
      { to: '/finance/tax', label: 'Tax / GST' },
      { to: '/finance/analytics', label: 'Analytics' }
    ]
  },
  { key: 'crm', label: 'CRM', icon: Contact, to: '/crm', available: false },
  {
    key: 'reports',
    label: 'Reports',
    icon: FileBarChart,
    available: true,
    children: [
      { to: '/reports', label: 'All Reports', end: true },
      { to: '/reports/sales', label: 'Sales' },
      { to: '/reports/purchase', label: 'Purchase' },
      { to: '/reports/inventory', label: 'Inventory' },
      { to: '/reports/production', label: 'Production' },
      { to: '/reports/finance', label: 'Finance' },
      { to: '/reports/business-partners', label: 'Business Partners' },
      { to: '/reports/tax', label: 'Tax / GST' },
      { to: '/reports/warehouse', label: 'Warehouse' },
      { to: '/reports/items', label: 'Items' },
      { to: '/reports/management', label: 'Management' },
      { to: '/reports/operational', label: 'Operations' }
    ]
  },
  {
    key: 'administration',
    label: 'Administration',
    icon: ShieldCheck,
    available: true,
    requiredPermission: 'Administration.View',
    children: [
      { to: '/administration/users', label: 'Users' },
      { to: '/administration/roles', label: 'Roles' },
      { to: '/administration/permissions', label: 'Permissions' },
      { to: '/administration/server-configuration', label: 'Server Configuration', requiredPermission: 'ServerConfiguration.View' }
    ]
  }
];

/** Primary routes shown directly in the mobile bottom tab bar; everything
 * else (including "Coming soon" modules) lives behind the "More" sheet. */
export const mobilePrimaryKeys = ['dashboard', 'business-partners', 'items', 'inventory'];
