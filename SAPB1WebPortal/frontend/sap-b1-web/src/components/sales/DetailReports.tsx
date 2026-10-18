import { getCustomersReport, getOpenPurchaseOrderLines, getOpenSalesOrderLines, getPendingDeliveries, getSalesAnalysis, getSalesRegister, getUnpaidInvoices } from '../../api/sales';
import type { CustomerReport, CustomerRow, OpenPurchaseOrderLine, OpenPurchaseOrderReport, OpenSalesOrderLine, OpenSalesOrderReport, PendingDeliveryReport, PendingDeliveryRow, SalesAnalysisReport, SalesAnalysisRow, SalesRegisterRow, SalesRegisterReport, UnpaidInvoiceReport, UnpaidInvoiceRow } from '../../types';
import DetailReport, { type Col } from './DetailReport';
import { formatDate } from './salesShared';
import { formatAmount, formatLongDate, formatQty } from './formatters';

// Shared formatting (formatters.ts): whole rupees with Indian grouping (a real zero is shown), quantities keep up to 3 decimals.
const rupees = { format: (v: number | null | undefined) => formatAmount(v, { zero: true }) };
const qty = { format: (v: number | null | undefined) => formatQty(v) };
const dash = (v: string | null | undefined) => v || '—';
const foot = 'px-3 py-2.5 font-semibold bg-surface-tertiary/60 border-t border-border-strong';

// ---------------------------------------------------------------- Open Sales Orders (line level — the client's definition)
const soCols: Col<OpenSalesOrderLine>[] = [
  { key: 'no', header: 'Order No.', render: (r) => `SO/${r.docNum}`, csv: (r) => r.docNum, nowrap: true },
  { key: 'date', header: 'Posting Date', render: (r) => formatDate(r.postingDate), csv: (r) => r.postingDate.slice(0, 10), nowrap: true },
  { key: 'cust', header: 'Customer', render: (r) => (<><div className="text-ink-primary">{r.customerName ?? r.customerCode}</div><div className="text-xs text-ink-tertiary">{r.customerCode}</div></>), csv: (r) => `${r.customerCode} - ${r.customerName ?? ''}` },
  { key: 'ic', header: 'Item Code', render: (r) => dash(r.itemCode), csv: (r) => r.itemCode, nowrap: true },
  { key: 'id', header: 'Item Description', render: (r) => dash(r.itemDescription), csv: (r) => r.itemDescription },
  { key: 'whs', header: 'Warehouse', render: (r) => dash(r.warehouse ?? r.warehouseCode), csv: (r) => r.warehouse ?? r.warehouseCode },
  { key: 'unit', header: 'Unit', render: (r) => dash(r.unit), csv: (r) => r.unit, nowrap: true },
  { key: 'sp', header: 'Salesperson', render: (r) => dash(r.salesperson), csv: (r) => r.salesperson },
  { key: 'oq', header: 'Ordered Qty', align: 'right', render: (r) => qty.format(r.orderedQuantity), csv: (r) => r.orderedQuantity },
  { key: 'bq', header: 'Open Qty', align: 'right', render: (r) => qty.format(r.openQuantity), csv: (r) => r.openQuantity },
  { key: 'pr', header: 'Unit Price', align: 'right', render: (r) => rupees.format(r.unitPrice), csv: (r) => r.unitPrice },
  { key: 'lt', header: 'Line Total', align: 'right', render: (r) => rupees.format(r.lineTotal), csv: (r) => r.lineTotal },
  { key: 'st', header: 'Status', render: (r) => (r.documentStatus === 'O' ? 'Open' : 'Closed'), csv: (r) => (r.documentStatus === 'O' ? 'Open' : 'Closed') }
];

export function OpenSalesOrderLinesSection() {
  return (
    <DetailReport<OpenSalesOrderLine, OpenSalesOrderReport>
      id="osl"
      title="Open Sales Orders — line level"
      definition="Counts individual open order lines (line status Open, order not cancelled), not whole orders. Line total is the full value of each open line; open quantity is the undelivered balance. Orders are filtered by the order date in the selected period; tick 'All open orders' to include older open orders too (use this to compare with a report that lists every open order)."
      fetcher={getOpenSalesOrderLines}
      columns={soCols}
      filters={['unit', 'warehouse', 'branch', 'salesperson', 'customerGroup', 'customer', 'category', 'item', 'allDates']}
      rowKey={(r, i) => `${r.docEntry}-${r.itemCode}-${i}`}
      csvName="open-sales-order-lines"
      footer={(rep) => (
        <tr>
          <td className={foot} colSpan={8}>Open lines: {rupees.format(rep.totals.openLines)} · Distinct orders: {rupees.format(rep.totals.distinctOrders)} (all pages)</td>
          <td className={`${foot} text-right tabular-nums`}>{qty.format(rep.totals.orderedQuantity)}</td>
          <td className={`${foot} text-right tabular-nums`}>{qty.format(rep.totals.openQuantity)}</td>
          <td className={foot} />
          <td className={`${foot} text-right tabular-nums`}>{rupees.format(rep.totals.lineTotal)}</td>
          <td className={foot} />
        </tr>
      )}
      footerCsv={(rep) => ['TOTAL', `Open lines ${rep.totals.openLines}`, `Distinct orders ${rep.totals.distinctOrders}`, '', '', '', '', '', rep.totals.orderedQuantity, rep.totals.openQuantity, '', rep.totals.lineTotal, '']}
    />
  );
}

// ---------------------------------------------------------------- Open Purchase Orders
const poCols: Col<OpenPurchaseOrderLine>[] = [
  { key: 'no', header: 'PO No.', render: (r) => `PO/${r.docNum}`, csv: (r) => r.docNum, nowrap: true },
  { key: 'date', header: 'Posting Date', render: (r) => formatDate(r.postingDate), csv: (r) => r.postingDate.slice(0, 10), nowrap: true },
  { key: 'v', header: 'Vendor', render: (r) => (<><div className="text-ink-primary">{r.vendorName ?? r.vendorCode}</div><div className="text-xs text-ink-tertiary">{r.vendorCode}</div></>), csv: (r) => `${r.vendorCode} - ${r.vendorName ?? ''}` },
  { key: 'ic', header: 'Item Code', render: (r) => dash(r.itemCode), csv: (r) => r.itemCode, nowrap: true },
  { key: 'id', header: 'Item Description', render: (r) => dash(r.itemDescription), csv: (r) => r.itemDescription },
  { key: 'whs', header: 'Warehouse', render: (r) => dash(r.warehouse ?? r.warehouseCode), csv: (r) => r.warehouse ?? r.warehouseCode },
  { key: 'due', header: 'Due Date', render: (r) => (r.dueDate ? formatDate(r.dueDate) : '—'), csv: (r) => r.dueDate?.slice(0, 10), nowrap: true },
  { key: 'oq', header: 'Ordered Qty', align: 'right', render: (r) => qty.format(r.orderedQuantity), csv: (r) => r.orderedQuantity },
  { key: 'bq', header: 'Open Qty', align: 'right', render: (r) => qty.format(r.openQuantity), csv: (r) => r.openQuantity },
  { key: 'pr', header: 'Rate', align: 'right', render: (r) => rupees.format(r.unitPrice), csv: (r) => r.unitPrice },
  { key: 'lt', header: 'Line Total', align: 'right', render: (r) => rupees.format(r.lineTotal), csv: (r) => r.lineTotal }
];

export function OpenPurchaseOrderLinesSection() {
  return (
    <DetailReport<OpenPurchaseOrderLine, OpenPurchaseOrderReport>
      id="opl"
      title="Open Purchase Orders — line level"
      definition="Open purchase order lines (line status Open, order not cancelled), filtered by order date. Line total is the full line value; open quantity is the balance still to receive."
      fetcher={getOpenPurchaseOrderLines}
      columns={poCols}
      filters={['warehouse', 'branch', 'customer', 'item']}
      rowKey={(r, i) => `${r.docEntry}-${r.itemCode}-${i}`}
      csvName="open-purchase-order-lines"
      footer={(rep) => (
        <tr>
          <td className={foot} colSpan={7}>Open lines: {rupees.format(rep.totals.openLines)} · Distinct orders: {rupees.format(rep.totals.distinctOrders)} (all pages)</td>
          <td className={`${foot} text-right tabular-nums`}>{qty.format(rep.totals.orderedQuantity)}</td>
          <td className={`${foot} text-right tabular-nums`}>{qty.format(rep.totals.openQuantity)}</td>
          <td className={foot} />
          <td className={`${foot} text-right tabular-nums`}>{rupees.format(rep.totals.lineTotal)}</td>
        </tr>
      )}
      footerCsv={(rep) => ['TOTAL', `Open lines ${rep.totals.openLines}`, `Distinct orders ${rep.totals.distinctOrders}`, '', '', '', '', rep.totals.orderedQuantity, rep.totals.openQuantity, '', rep.totals.lineTotal]}
    />
  );
}

// ---------------------------------------------------------------- Sales Register
const regCols: Col<SalesRegisterRow>[] = [
  { key: 'type', header: 'Type', render: (r) => (r.docType === 'A/R Invoice' ? 'Invoice' : 'Credit memo'), csv: (r) => r.docType, nowrap: true },
  { key: 'date', header: 'Posting Date', render: (r) => formatDate(r.postingDate), csv: (r) => r.postingDate.slice(0, 10), nowrap: true },
  { key: 'no', header: 'Doc No.', render: (r) => r.docNum, csv: (r) => r.docNum, nowrap: true },
  { key: 'cust', header: 'Customer', render: (r) => (<><div className="text-ink-primary">{r.customerName ?? r.customerCode}</div><div className="text-xs text-ink-tertiary">{[r.customerCode, r.customerGroup].filter(Boolean).join(' · ')}</div></>), csv: (r) => `${r.customerCode} - ${r.customerName ?? ''}` },
  { key: 'grp', header: 'Customer Group', render: (r) => dash(r.customerGroup), csv: (r) => r.customerGroup },
  { key: 'sp', header: 'Salesperson', render: (r) => dash(r.salesperson), csv: (r) => r.salesperson },
  { key: 'ic', header: 'Item Code', render: (r) => dash(r.itemCode), csv: (r) => r.itemCode, nowrap: true },
  { key: 'id', header: 'Item Description', render: (r) => dash(r.itemDescription), csv: (r) => r.itemDescription },
  { key: 'cat', header: 'Category', render: (r) => dash(r.productCategory), csv: (r) => r.productCategory },
  { key: 'unit', header: 'Unit', render: (r) => dash(r.unit), csv: (r) => r.unit, nowrap: true },
  { key: 'whs', header: 'Warehouse', render: (r) => dash(r.warehouse), csv: (r) => r.warehouse },
  { key: 'q', header: 'Qty', align: 'right', render: (r) => qty.format(r.quantity), csv: (r) => r.quantity },
  { key: 'rate', header: 'Rate', align: 'right', render: (r) => rupees.format(r.rate), csv: (r) => r.rate },
  { key: 'basic', header: 'Basic Amount', align: 'right', render: (r) => rupees.format(r.basicAmount), csv: (r) => r.basicAmount },
  { key: 'net', header: 'Net Sales (excl. tax)', align: 'right', render: (r) => rupees.format(r.netSales), csv: (r) => r.netSales },
  { key: 'tax', header: 'Tax', align: 'right', render: (r) => rupees.format(r.taxAmount), csv: (r) => r.taxAmount },
  { key: 'netinc', header: 'Net Sales (incl. tax)', align: 'right', render: (r) => rupees.format(r.netSalesInclTax), csv: (r) => r.netSalesInclTax }
];

export function SalesRegisterSection() {
  return (
    <DetailReport<SalesRegisterRow, SalesRegisterReport>
      id="reg"
      title="Sales Register — invoice lines minus credit-memo lines"
      definition="A/R invoice lines as positive sales and A/R credit-memo lines with the sign reversed; cancelled documents excluded. Unit is the line's location; salesperson is the document's. Net Sales spreads each document's header discount over its lines (no freight or rounding) and reconciles with Total Turnover on the Sales Overview."
      fetcher={getSalesRegister}
      columns={regCols}
      filters={['docType', 'unit', 'warehouse', 'branch', 'salesperson', 'customerGroup', 'customer', 'category', 'item']}
      rowKey={(r, i) => `${r.docType}-${r.docEntry}-${r.itemCode}-${i}`}
      csvName="sales-register"
      footer={(rep) => (
        <tr>
          <td className={foot} colSpan={11}>Total · {rupees.format(rep.totals.lines)} lines (all pages)</td>
          <td className={`${foot} text-right tabular-nums`}>{qty.format(rep.totals.quantity)}</td>
          <td className={foot} />
          <td className={`${foot} text-right tabular-nums`}>{rupees.format(rep.totals.basicAmount)}</td>
          <td className={`${foot} text-right tabular-nums`}>{rupees.format(rep.totals.netSales)}</td>
          <td className={`${foot} text-right tabular-nums`}>{rupees.format(rep.totals.taxAmount)}</td>
          <td className={`${foot} text-right tabular-nums`}>{rupees.format(rep.totals.netSalesInclTax)}</td>
        </tr>
      )}
      footerCsv={(rep) => ['TOTAL', `${rep.totals.lines} lines`, '', '', '', '', '', '', '', '', '', rep.totals.quantity, '', rep.totals.basicAmount, rep.totals.netSales, rep.totals.taxAmount, rep.totals.netSalesInclTax]}
    />
  );
}

// ---------------------------------------------------------------- Customers (the Total Customers tile)
const custCols: Col<CustomerRow>[] = [
  { key: 'code', header: 'Code', render: (r) => r.customerCode, csv: (r) => r.customerCode, nowrap: true },
  { key: 'name', header: 'Customer', render: (r) => r.customerName ?? '—', csv: (r) => r.customerName },
  { key: 'grp', header: 'Customer Group', render: (r) => dash(r.customerGroup), csv: (r) => r.customerGroup },
  { key: 'sp', header: 'Salesperson', render: (r) => dash(r.salesperson), csv: (r) => r.salesperson },
  { key: 'city', header: 'City', render: (r) => dash(r.city), csv: (r) => r.city },
  { key: 'cd', header: 'Created', render: (r) => (r.createdDate ? formatDate(r.createdDate) : '—'), csv: (r) => r.createdDate?.slice(0, 10), nowrap: true },
  { key: 'bal', header: 'Balance (now)', align: 'right', render: (r) => rupees.format(r.balance), csv: (r) => r.balance }
];

export function CustomersSection() {
  return (
    <DetailReport<CustomerRow, CustomerReport>
      id="cus"
      title="Customers"
      note="current position — not period-based"
      definition="Active customer accounts (not frozen) in SAP: the figure on the Total Customers tile. Tick 'New this quarter' to list customers created since the current financial-year quarter began, as in the tile's hint. Balance is the live account balance. With a unit selected the list shows customers that have A/R invoices in that unit during the selected dates (a customer buying in several units is counted once per unit, never twice within one)."
      fetcher={getCustomersReport}
      columns={custCols}
      filters={['customerGroup', 'salesperson', 'search', 'newOnly']}
      rowKey={(r) => r.customerCode}
      csvName="customers"
      footer={(rep) => (
        <tr>
          <td className={foot} colSpan={7}>
            Customers listed: {rupees.format(rep.totalCount)} (all pages) · created since {formatLongDate(rep.totals.quarterStart.slice(0, 10))}: {rupees.format(rep.totals.newThisQuarter)}
          </td>
        </tr>
      )}
      footerCsv={(rep) => ['TOTAL', `${rep.totalCount} customers`, '', '', '', '', '']}
    />
  );
}

// ---------------------------------------------------------------- Pending Invoices = open deliveries not yet invoiced
const pendCols: Col<PendingDeliveryRow>[] = [
  { key: 'no', header: 'Delivery No.', render: (r) => `DLV/${r.docNum}`, csv: (r) => r.docNum, nowrap: true },
  { key: 'date', header: 'Posting Date', render: (r) => formatDate(r.postingDate), csv: (r) => r.postingDate.slice(0, 10), nowrap: true },
  { key: 'due', header: 'Due Date', render: (r) => (r.dueDate ? formatDate(r.dueDate) : '—'), csv: (r) => r.dueDate?.slice(0, 10), nowrap: true },
  { key: 'cust', header: 'Customer', render: (r) => (<><div className="text-ink-primary">{r.customerName ?? r.customerCode}</div><div className="text-xs text-ink-tertiary">{r.customerCode}</div></>), csv: (r) => `${r.customerCode} - ${r.customerName ?? ''}` },
  { key: 'sp', header: 'Salesperson', render: (r) => dash(r.salesperson), csv: (r) => r.salesperson },
  { key: 'br', header: 'Branch', render: (r) => dash(r.branch), csv: (r) => r.branch },
  { key: 'ln', header: 'Lines', align: 'right', render: (r) => r.lines, csv: (r) => r.lines },
  { key: 'days', header: 'Days open', align: 'right', render: (r) => r.daysOpen, csv: (r) => r.daysOpen },
  { key: 'tot', header: 'Delivery Total', align: 'right', render: (r) => rupees.format(r.docTotal), csv: (r) => r.docTotal }
];

export function PendingDeliveriesSection() {
  return (
    <DetailReport<PendingDeliveryRow, PendingDeliveryReport>
      id="pdl"
      title="Pending Invoices — open deliveries"
      note="current position — not period-based"
      definition="Deliveries that are still open: goods dispatched but not yet invoiced, not cancelled. This is pending BILLING, not pending payment (see Total Outstanding for that). Delivery total includes tax."
      fetcher={getPendingDeliveries}
      columns={pendCols}
      filters={['branch', 'salesperson', 'customer']}
      rowKey={(r) => String(r.docEntry)}
      csvName="pending-deliveries"
      footer={(rep) => (
        <tr>
          <td className={foot} colSpan={8}>Open deliveries: {rupees.format(rep.totals.deliveries)} (all pages)</td>
          <td className={`${foot} text-right tabular-nums`}>{rupees.format(rep.totals.docTotal)}</td>
        </tr>
      )}
      footerCsv={(rep) => ['TOTAL', `${rep.totals.deliveries} deliveries`, '', '', '', '', '', '', rep.totals.docTotal]}
    />
  );
}

// ---------------------------------------------------------------- Sales analysis (the dashboard charts, in full)
const ANALYSIS = {
  month: { title: 'Monthly Sales', label: 'Month', definition: 'Invoiced value per month for the selected period (A/R invoices, cancelled excluded; header amount, so credit memos are not netted). The dashboard chart shows the same months against last year.' },
  salesperson: { title: 'Sales by Salesperson', label: 'Salesperson', definition: 'Invoiced value per salesperson (the invoice header\'s sales employee). The dashboard donut shows the top 8; this report lists all of them, so its total can be larger.' },
  customer: { title: 'Sales by Customer', label: 'Customer', definition: 'Invoiced value per customer. The dashboard list shows the top 8; this report lists every customer, so its total can be larger.' },
  item: { title: 'Sales by Item', label: 'Item', definition: 'Invoiced value per item at invoice-LINE level (before any document-level discount or freight, so it can differ slightly from the header-based totals). The dashboard chart shows the top 6.' }
} as const;

export function SalesAnalysisSection({ by }: { by: keyof typeof ANALYSIS }) {
  const cfg = ANALYSIS[by];
  const cols: Col<SalesAnalysisRow>[] = [
    ...(by === 'item'
      ? [{ key: 'code', header: 'Item Code', render: (r: SalesAnalysisRow) => r.key, csv: (r: SalesAnalysisRow) => r.key, nowrap: true } as Col<SalesAnalysisRow>]
      : by === 'customer'
        ? [{ key: 'code', header: 'Code', render: (r: SalesAnalysisRow) => r.key, csv: (r: SalesAnalysisRow) => r.key, nowrap: true } as Col<SalesAnalysisRow>]
        : []),
    { key: 'name', header: cfg.label === 'Item' ? 'Description' : cfg.label, render: (r) => r.name, csv: (r) => r.name },
    { key: 'inv', header: 'Invoices', align: 'right', render: (r) => rupees.format(r.invoices), csv: (r) => r.invoices },
    { key: 'qty', header: 'Quantity', align: 'right', render: (r) => qty.format(r.quantity), csv: (r) => r.quantity },
    { key: 'val', header: 'Value', align: 'right', render: (r) => rupees.format(r.value), csv: (r) => r.value },
    { key: 'pct', header: '% of total', align: 'right', render: (r) => `${r.percentage.toFixed(1)}%`, csv: (r) => r.percentage }
  ];
  const lead = cols.length - 4;
  return (
    <DetailReport<SalesAnalysisRow, SalesAnalysisReport>
      id={`sa-${by}`}
      title={cfg.title}
      definition={cfg.definition}
      fetcher={getSalesAnalysis}
      columns={cols}
      filters={by === 'month' ? [] : ['search']}
      rowKey={(r) => r.key}
      csvName={`sales-by-${by}`}
      showTaxBasis
      extra={{ by }}
      pageSize={by === 'month' ? 60 : 25}
      footer={(rep) => (
        <tr>
          <td className={foot} colSpan={Math.max(1, lead)}>Total · {rupees.format(rep.totals.rows)} rows (all pages)</td>
          <td className={`${foot} text-right tabular-nums`}>{rupees.format(rep.totals.invoices)}</td>
          <td className={`${foot} text-right tabular-nums`}>{qty.format(rep.totals.quantity)}</td>
          <td className={`${foot} text-right tabular-nums`}>{rupees.format(rep.totals.value)}</td>
          <td className={`${foot} text-right tabular-nums`}>100.0%</td>
        </tr>
      )}
      footerCsv={(rep) => ['TOTAL', ...Array(Math.max(0, lead - 1)).fill(''), rep.totals.invoices, rep.totals.quantity, rep.totals.value, 100]}
    />
  );
}

// ---------------------------------------------------------------- Outstanding Customer Invoices (payment status)
const unpaidCols: Col<UnpaidInvoiceRow>[] = [
  { key: 'no', header: 'Invoice No.', render: (r) => `INV/${r.docNum}`, csv: (r) => r.docNum, nowrap: true },
  { key: 'date', header: 'Posting Date', render: (r) => formatDate(r.postingDate), csv: (r) => r.postingDate.slice(0, 10), nowrap: true },
  { key: 'due', header: 'Due Date', render: (r) => (r.dueDate ? formatDate(r.dueDate) : '—'), csv: (r) => r.dueDate?.slice(0, 10), nowrap: true },
  { key: 'cust', header: 'Customer', render: (r) => (<><div className="text-ink-primary">{r.customerName ?? r.customerCode}</div><div className="text-xs text-ink-tertiary">{r.customerCode}</div></>), csv: (r) => `${r.customerCode} - ${r.customerName ?? ''}` },
  { key: 'sp', header: 'Salesperson', render: (r) => dash(r.salesperson), csv: (r) => r.salesperson },
  { key: 'br', header: 'Branch', render: (r) => dash(r.branch), csv: (r) => r.branch },
  { key: 'tot', header: 'Invoice Total', align: 'right', render: (r) => rupees.format(r.docTotal), csv: (r) => r.docTotal },
  { key: 'paid', header: 'Paid', align: 'right', render: (r) => rupees.format(r.paidToDate), csv: (r) => r.paidToDate },
  { key: 'bal', header: 'Balance', align: 'right', render: (r) => rupees.format(r.balance), csv: (r) => r.balance },
  { key: 'od', header: 'Days overdue', align: 'right', render: (r) => (r.daysOverdue > 0 ? r.daysOverdue : 'Not due'), csv: (r) => r.daysOverdue }
];

export function UnpaidInvoicesSection() {
  return (
    <DetailReport<UnpaidInvoiceRow, UnpaidInvoiceReport>
      id="unp"
      title="Outstanding Customer Invoices — payment status"
      note="current position — not period-based"
      definition="A/R invoices still open (not fully paid), not cancelled: invoice total minus paid to date, including tax. This is PAYMENT status. Pending billing (deliveries not yet invoiced) is a separate report, and the journal-based Total Outstanding (which also nets credits and payments on account) is the client's ageing definition."
      fetcher={getUnpaidInvoices}
      columns={unpaidCols}
      filters={['branch', 'salesperson', 'customerGroup', 'customer']}
      rowKey={(r) => String(r.docEntry)}
      csvName="outstanding-customer-invoices"
      footer={(rep) => (
        <tr>
          <td className={foot} colSpan={6}>Open invoices: {rupees.format(rep.totals.invoices)} (all pages) · overdue balance: {rupees.format(rep.totals.overdue)}</td>
          <td className={`${foot} text-right tabular-nums`}>{rupees.format(rep.totals.docTotal)}</td>
          <td className={`${foot} text-right tabular-nums`}>{rupees.format(rep.totals.paidToDate)}</td>
          <td className={`${foot} text-right tabular-nums`}>{rupees.format(rep.totals.balance)}</td>
          <td className={foot} />
        </tr>
      )}
      footerCsv={(rep) => ['TOTAL', `${rep.totals.invoices} invoices`, '', '', '', '', rep.totals.docTotal, rep.totals.paidToDate, rep.totals.balance, '']}
    />
  );
}
