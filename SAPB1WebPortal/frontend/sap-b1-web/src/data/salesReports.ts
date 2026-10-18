/**
 * The client-approved Sales Dashboard is made of eight sections. Each one is a
 * standalone report under Sales → Reports; the dashboard renders the same
 * section components and links each heading to its report. Sample Status is
 * present but says plainly that SAP has no sample source yet — no placeholder
 * numbers anywhere.
 */
export interface SalesReportEntry {
  id: string;
  number: number;
  name: string;
  description: string;
  path: string;
  built: boolean;
}

export const SALES_REPORTS_PATH = '/sales/reports';

export const salesReports: SalesReportEntry[] = [
  { id: 'key-metrics', number: 1, name: 'Key Metrics', description: 'Customers, open orders, pending invoices and total outstanding.', path: `${SALES_REPORTS_PATH}/key-metrics`, built: true },
  { id: 'sales-overview', number: 2, name: 'Sales Overview', description: 'Monthly sales vs last year, sales person, customer-wise and item-wise sales.', path: `${SALES_REPORTS_PATH}/sales-overview`, built: true },
  { id: 'open-sales-orders', number: 3, name: 'Open Sales Orders', description: 'Open orders with production status, progress, ETA and delivery status.', path: `${SALES_REPORTS_PATH}/open-sales-orders`, built: true },
  { id: 'invoice-register', number: 4, name: 'Invoice Register', description: 'A/R invoices for a period with dispatch status, search and CSV export.', path: `${SALES_REPORTS_PATH}/invoice-register`, built: true },
  { id: 'customer-outstanding', number: 5, name: 'Customer Outstanding', description: 'Receivables, ageing buckets and customer-wise risk.', path: `${SALES_REPORTS_PATH}/customer-outstanding`, built: true },
  { id: 'customer-ledger', number: 6, name: 'Customer Ledger', description: 'Customer statement with running balance and credit utilisation.', path: `${SALES_REPORTS_PATH}/customer-ledger`, built: true },
  { id: 'sales-analytics', number: 7, name: 'Sales Analytics', description: 'Slice sales by customer, sales person, item and period.', path: `${SALES_REPORTS_PATH}/sales-analytics`, built: true },
  { id: 'open-sales-order-lines', number: 9, name: 'Open Sales Orders (lines)', description: 'Open order lines with open quantity and full line value — the client\'s line-level definition.', path: `${SALES_REPORTS_PATH}/open-sales-order-lines`, built: true },
  { id: 'sales-register', number: 10, name: 'Sales Register', description: 'Invoice lines minus credit-memo lines by unit, salesperson, customer group and product category.', path: `${SALES_REPORTS_PATH}/sales-register`, built: true },
  { id: 'total-outstanding', number: 11, name: 'Total Outstanding (ledger)', description: 'Journal-based customer outstanding as of the selected To Date, by branch and ageing, with journal lines.', path: `${SALES_REPORTS_PATH}/total-outstanding`, built: true },
  { id: 'open-purchase-order-lines', number: 12, name: 'Open Purchase Orders (lines)', description: 'Open purchase order lines with open quantity and line value.', path: `${SALES_REPORTS_PATH}/open-purchase-order-lines`, built: true },
  { id: 'customers', number: 13, name: 'Customers', description: 'Active customer accounts behind the Total Customers tile, with new-this-quarter.', path: `${SALES_REPORTS_PATH}/customers`, built: true },
  { id: 'pending-deliveries', number: 14, name: 'Pending Invoices (open deliveries)', description: 'Deliveries dispatched but not yet invoiced — behind the Pending Invoices tile.', path: `${SALES_REPORTS_PATH}/pending-deliveries`, built: true },
  { id: 'sales-by-month', number: 15, name: 'Monthly Sales', description: 'Invoiced value per month for the selected period.', path: `${SALES_REPORTS_PATH}/sales-by-month`, built: true },
  { id: 'sales-by-salesperson', number: 16, name: 'Sales by Salesperson', description: 'Invoiced value per salesperson for the selected period.', path: `${SALES_REPORTS_PATH}/sales-by-salesperson`, built: true },
  { id: 'sales-by-customer', number: 17, name: 'Sales by Customer', description: 'Invoiced value per customer for the selected period.', path: `${SALES_REPORTS_PATH}/sales-by-customer`, built: true },
  { id: 'sales-by-item', number: 18, name: 'Sales by Item', description: 'Invoiced value and quantity per item for the selected period.', path: `${SALES_REPORTS_PATH}/sales-by-item`, built: true },
  { id: 'customer-group-sales', number: 19, name: 'Customer Group / Customer Sales', description: 'Sales by customer group with each group expanding to its customers.', path: `${SALES_REPORTS_PATH}/customer-group-sales`, built: true },
  { id: 'unpaid-invoices', number: 20, name: 'Outstanding Customer Invoices', description: 'Unpaid A/R invoices — payment status (invoice total minus paid), with days overdue.', path: `${SALES_REPORTS_PATH}/unpaid-invoices`, built: true },
  { id: 'lost-customers', number: 21, name: 'Lost Customer Analysis', description: 'Customers invoiced last financial year but not this year, with their previous-year sales.', path: `${SALES_REPORTS_PATH}/lost-customers`, built: true },
  { id: 'order-execution', number: 22, name: 'Order Execution', description: 'Days from sales order to invoice, per order and invoice, with pending orders and an ageing summary.', path: `${SALES_REPORTS_PATH}/order-execution`, built: true },
  { id: 'sample-status', number: 8, name: 'Sample Status', description: 'Sample requests and their stage progress.', path: `${SALES_REPORTS_PATH}/sample-status`, built: true }
];

export const salesReportPath = (id: string) => salesReports.find((r) => r.id === id)!.path;

/** Link to a report that carries its own filters (the global period travels separately, via the shared filter state). */
export const salesReportLink = (id: string, params: Record<string, string | number | undefined | null> = {}) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const qs = q.toString();
  return `${salesReportPath(id)}${qs ? `?${qs}` : ''}`;
};
