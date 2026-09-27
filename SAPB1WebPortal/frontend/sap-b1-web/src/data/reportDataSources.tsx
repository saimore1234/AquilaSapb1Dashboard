import type { ColumnDef } from '../components/ui/ResponsiveTable';
import { getSalesAnalytics } from '../api/sales';
import { getPurchaseAnalytics } from '../api/purchase';
import { getProductionAnalytics } from '../api/production';
import { getFinanceAnalytics, getTax } from '../api/finance';
import { getStockAgeing, getInventoryMovement } from '../api/reports';
import { getInventory } from '../api/inventory';

// ---------------------------------------------------------------
// Every report in the catalog that renders as a table pulls its rows from
// one of these data sources — each one wraps an ALREADY-EXISTING API call
// (Sales/Purchase/Production/Finance Analytics, or the small set of new
// Reports endpoints). Nothing here invents data: a data source is just a
// (fetch real rows) + (how to display them) pair, reused across every
// catalog entry that names the same underlying real dataset. This is what
// lets the ~200-report catalog exist without ~200 bespoke queries.
// ---------------------------------------------------------------

export interface ReportDataSource<T = Record<string, unknown>> {
  fetch: () => Promise<T[]>;
  columns: ColumnDef<T>[];
  /** Optional summary row(s) shown as stat cards above the table. */
  summary?: (rows: T[]) => { label: string; value: string }[];
}

function money(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// --- Sales ---
const salesByMonth: ReportDataSource<{ period: string; value: number }> = {
  fetch: async () => (await getSalesAnalytics()).salesByMonth,
  columns: [
    { key: 'period', header: 'Month', render: (r) => r.period },
    { key: 'value', header: 'Sales Value', align: 'right', render: (r) => money(r.value) }
  ]
};
const salesByCustomer: ReportDataSource<{ customerCode: string; customerName: string | null; value: number }> = {
  fetch: async () => (await getSalesAnalytics()).topCustomers,
  columns: [
    { key: 'customerName', header: 'Customer', render: (r) => r.customerName || r.customerCode },
    { key: 'customerCode', header: 'Code', render: (r) => r.customerCode, className: 'hidden md:table-cell text-ink-secondary' },
    { key: 'value', header: 'Revenue', align: 'right', render: (r) => money(r.value) }
  ]
};
const salesByItem: ReportDataSource<{ itemCode: string; itemName: string | null; value: number; quantity: number }> = {
  fetch: async () => (await getSalesAnalytics()).topItems,
  columns: [
    { key: 'itemName', header: 'Item', render: (r) => r.itemName || r.itemCode },
    { key: 'itemCode', header: 'Code', render: (r) => r.itemCode, className: 'hidden md:table-cell text-ink-secondary' },
    { key: 'quantity', header: 'Qty Sold', align: 'right', render: (r) => money(r.quantity) },
    { key: 'value', header: 'Sales Value', align: 'right', render: (r) => money(r.value) }
  ]
};
const salesByWarehouse: ReportDataSource<{ warehouseCode: string; warehouseName: string | null; value: number }> = {
  fetch: async () => (await getSalesAnalytics()).salesByWarehouse,
  columns: [
    { key: 'warehouseName', header: 'Warehouse', render: (r) => r.warehouseName || r.warehouseCode },
    { key: 'value', header: 'Sales Value', align: 'right', render: (r) => money(r.value) }
  ]
};
const salesByEmployee: ReportDataSource<{ salesEmployeeCode: number; salesEmployeeName: string | null; value: number }> = {
  fetch: async () => (await getSalesAnalytics()).salesBySalesEmployee,
  columns: [
    { key: 'name', header: 'Sales Employee', render: (r) => r.salesEmployeeName || `#${r.salesEmployeeCode}` },
    { key: 'value', header: 'Sales Value', align: 'right', render: (r) => money(r.value) }
  ]
};

// --- Purchase ---
const purchaseByMonth: ReportDataSource<{ period: string; value: number }> = {
  fetch: async () => (await getPurchaseAnalytics()).purchaseByMonth,
  columns: [
    { key: 'period', header: 'Month', render: (r) => r.period },
    { key: 'value', header: 'Purchase Value', align: 'right', render: (r) => money(r.value) }
  ]
};
const purchaseByVendor: ReportDataSource<{ vendorCode: string; vendorName: string | null; value: number }> = {
  fetch: async () => (await getPurchaseAnalytics()).topVendors,
  columns: [
    { key: 'vendorName', header: 'Vendor', render: (r) => r.vendorName || r.vendorCode },
    { key: 'vendorCode', header: 'Code', render: (r) => r.vendorCode, className: 'hidden md:table-cell text-ink-secondary' },
    { key: 'value', header: 'Purchase Value', align: 'right', render: (r) => money(r.value) }
  ]
};
const purchaseByItem: ReportDataSource<{ itemCode: string; itemName: string | null; value: number; quantity: number }> = {
  fetch: async () => (await getPurchaseAnalytics()).topItems,
  columns: [
    { key: 'itemName', header: 'Item', render: (r) => r.itemName || r.itemCode },
    { key: 'quantity', header: 'Qty Purchased', align: 'right', render: (r) => money(r.quantity) },
    { key: 'value', header: 'Purchase Value', align: 'right', render: (r) => money(r.value) }
  ]
};
const purchaseByWarehouse: ReportDataSource<{ warehouseCode: string; warehouseName: string | null; value: number }> = {
  fetch: async () => (await getPurchaseAnalytics()).purchaseByWarehouse,
  columns: [
    { key: 'warehouseName', header: 'Warehouse', render: (r) => r.warehouseName || r.warehouseCode },
    { key: 'value', header: 'Purchase Value', align: 'right', render: (r) => money(r.value) }
  ]
};

// --- Production ---
const productionByMonth: ReportDataSource<{ period: string; orderCount: number; plannedQty: number; producedQty: number }> = {
  fetch: async () => (await getProductionAnalytics()).productionByMonth,
  columns: [
    { key: 'period', header: 'Month', render: (r) => r.period },
    { key: 'orderCount', header: 'Orders', align: 'right', render: (r) => r.orderCount },
    { key: 'plannedQty', header: 'Planned', align: 'right', render: (r) => money(r.plannedQty) },
    { key: 'producedQty', header: 'Produced', align: 'right', render: (r) => money(r.producedQty) }
  ]
};
const productionByStatus: ReportDataSource<{ status: string; count: number }> = {
  fetch: async () => (await getProductionAnalytics()).productionByStatus,
  columns: [
    { key: 'status', header: 'Status', render: (r) => r.status },
    { key: 'count', header: 'Orders', align: 'right', render: (r) => r.count }
  ]
};
const topProducedItems: ReportDataSource<{ itemCode: string; itemName: string | null; quantity: number }> = {
  fetch: async () => (await getProductionAnalytics()).topProducedItems,
  columns: [
    { key: 'itemName', header: 'Item', render: (r) => r.itemName || r.itemCode },
    { key: 'quantity', header: 'Produced Qty', align: 'right', render: (r) => money(r.quantity) }
  ]
};
const topConsumedMaterials: ReportDataSource<{ itemCode: string; itemName: string | null; quantity: number }> = {
  fetch: async () => (await getProductionAnalytics()).topConsumedMaterials,
  columns: [
    { key: 'itemName', header: 'Material', render: (r) => r.itemName || r.itemCode },
    { key: 'quantity', header: 'Issued Qty', align: 'right', render: (r) => money(r.quantity) }
  ]
};
const productionByWarehouse: ReportDataSource<{ warehouseCode: string; warehouseName: string | null; orderCount: number; producedQty: number }> = {
  fetch: async () => (await getProductionAnalytics()).productionByWarehouse,
  columns: [
    { key: 'warehouseName', header: 'Warehouse', render: (r) => r.warehouseName || r.warehouseCode },
    { key: 'orderCount', header: 'Orders', align: 'right', render: (r) => r.orderCount },
    { key: 'producedQty', header: 'Produced', align: 'right', render: (r) => money(r.producedQty) }
  ]
};

// --- Finance trends (shared shape: period/value) ---
function financeTrend(name: keyof Awaited<ReturnType<typeof getFinanceAnalytics>>): ReportDataSource<{ period: string; value: number }> {
  return {
    fetch: async () => (await getFinanceAnalytics())[name] as { period: string; value: number }[],
    columns: [
      { key: 'period', header: 'Month', render: (r) => r.period },
      { key: 'value', header: 'Value', align: 'right', render: (r) => money(r.value) }
    ]
  };
}
const financeTopCustomers: ReportDataSource<{ code: string; name: string | null; value: number }> = {
  fetch: async () => (await getFinanceAnalytics()).topCustomersByRevenue,
  columns: [
    { key: 'name', header: 'Customer', render: (r) => r.name || r.code },
    { key: 'value', header: 'Revenue', align: 'right', render: (r) => money(r.value) }
  ]
};
const financeTopVendors: ReportDataSource<{ code: string; name: string | null; value: number }> = {
  fetch: async () => (await getFinanceAnalytics()).topVendorsByPurchase,
  columns: [
    { key: 'name', header: 'Vendor', render: (r) => r.name || r.code },
    { key: 'value', header: 'Purchase Value', align: 'right', render: (r) => money(r.value) }
  ]
};
const financeTopExpenseAccounts: ReportDataSource<{ acctCode: string; acctName: string | null; value: number }> = {
  fetch: async () => (await getFinanceAnalytics()).topExpenseAccounts,
  columns: [
    { key: 'acctName', header: 'Expense Account', render: (r) => r.acctName || r.acctCode },
    { key: 'value', header: 'Amount', align: 'right', render: (r) => money(r.value) }
  ]
};

// --- Tax ---
const salesTaxByCode: ReportDataSource<{ taxCode: string; taxCodeName: string | null; taxRate: number | null; taxableAmount: number; taxAmount: number }> = {
  fetch: async () => (await getTax({})).salesTaxByCode,
  columns: [
    { key: 'taxCode', header: 'Tax Code', render: (r) => r.taxCodeName || r.taxCode },
    { key: 'taxRate', header: 'Rate', render: (r) => (r.taxRate != null ? `${r.taxRate}%` : '—') },
    { key: 'taxableAmount', header: 'Taxable Amount', align: 'right', render: (r) => money(r.taxableAmount) },
    { key: 'taxAmount', header: 'Tax Amount', align: 'right', render: (r) => money(r.taxAmount) }
  ]
};
const purchaseTaxByCode: ReportDataSource<{ taxCode: string; taxCodeName: string | null; taxRate: number | null; taxableAmount: number; taxAmount: number }> = {
  fetch: async () => (await getTax({})).purchaseTaxByCode,
  columns: salesTaxByCode.columns
};
const taxByMonth: ReportDataSource<{ period: string; outputTax: number; inputTax: number }> = {
  fetch: async () => (await getTax({})).taxByMonth,
  columns: [
    { key: 'period', header: 'Month', render: (r) => r.period },
    { key: 'outputTax', header: 'Output Tax', align: 'right', render: (r) => money(r.outputTax) },
    { key: 'inputTax', header: 'Input Tax', align: 'right', render: (r) => money(r.inputTax) }
  ]
};

// --- Inventory (genuinely new endpoints) ---
const stockAgeing: ReportDataSource<{ itemCode: string; itemName: string | null; warehouseName: string | null; onHand: number; stockValue: number; ageDays: number | null; ageingBucket: string }> = {
  fetch: async () => (await getStockAgeing({ page: 1, pageSize: 500 })).items,
  columns: [
    { key: 'itemName', header: 'Item', render: (r) => r.itemName || r.itemCode },
    { key: 'warehouseName', header: 'Warehouse', render: (r) => r.warehouseName || '—' },
    { key: 'onHand', header: 'On Hand', align: 'right', render: (r) => money(r.onHand) },
    { key: 'stockValue', header: 'Stock Value', align: 'right', render: (r) => money(r.stockValue) },
    { key: 'ageDays', header: 'Age (Days)', align: 'right', render: (r) => r.ageDays ?? '—' },
    { key: 'ageingBucket', header: 'Bucket', render: (r) => r.ageingBucket }
  ]
};
const inventoryMovement: ReportDataSource<{ transNum: number; postingDate: string; itemCode: string; itemName: string | null; warehouse: string | null; inQty: number; outQty: number }> = {
  fetch: async () => (await getInventoryMovement({ page: 1, pageSize: 200 })).items,
  columns: [
    { key: 'postingDate', header: 'Date', render: (r) => new Date(r.postingDate).toLocaleDateString() },
    { key: 'itemName', header: 'Item', render: (r) => r.itemName || r.itemCode },
    { key: 'warehouse', header: 'Warehouse', render: (r) => r.warehouse || '—' },
    { key: 'inQty', header: 'In', align: 'right', render: (r) => (r.inQty ? money(r.inQty) : '—') },
    { key: 'outQty', header: 'Out', align: 'right', render: (r) => (r.outQty ? money(r.outQty) : '—') }
  ]
};
const stockSummary: ReportDataSource<{ itemCode: string; itemName: string; warehouseCode: string; onHand: number; committed: number; available: number; stockValue: number; stockStatus: string }> = {
  fetch: async () => (await getInventory({ page: 1, pageSize: 500 })).items,
  columns: [
    { key: 'itemName', header: 'Item', render: (r) => r.itemName || r.itemCode },
    { key: 'warehouseCode', header: 'Warehouse', render: (r) => r.warehouseCode },
    { key: 'onHand', header: 'On Hand', align: 'right', render: (r) => money(r.onHand) },
    { key: 'committed', header: 'Committed', align: 'right', render: (r) => money(r.committed) },
    { key: 'available', header: 'Available', align: 'right', render: (r) => money(r.available) },
    { key: 'stockValue', header: 'Stock Value', align: 'right', render: (r) => money(r.stockValue) },
    { key: 'stockStatus', header: 'Status', render: (r) => r.stockStatus }
  ]
};
const negativeStock: ReportDataSource<{ itemCode: string; itemName: string; warehouseCode: string; onHand: number; committed: number; available: number }> = {
  fetch: async () => {
    const rows = (await getInventory({ page: 1, pageSize: 500 })).items;
    return rows.filter((r) => r.onHand < 0 || r.available < 0);
  },
  columns: [
    { key: 'itemName', header: 'Item', render: (r) => r.itemName || r.itemCode },
    { key: 'warehouseCode', header: 'Warehouse', render: (r) => r.warehouseCode },
    { key: 'onHand', header: 'On Hand', align: 'right', render: (r) => money(r.onHand) },
    { key: 'available', header: 'Available', align: 'right', render: (r) => money(r.available) }
  ]
};
const zeroStock: ReportDataSource<{ itemCode: string; itemName: string; warehouseCode: string; onHand: number }> = {
  fetch: async () => {
    const rows = (await getInventory({ page: 1, pageSize: 500 })).items;
    return rows.filter((r) => r.onHand === 0);
  },
  columns: [
    { key: 'itemName', header: 'Item', render: (r) => r.itemName || r.itemCode },
    { key: 'warehouseCode', header: 'Warehouse', render: (r) => r.warehouseCode },
    { key: 'onHand', header: 'On Hand', align: 'right', render: (r) => money(r.onHand) }
  ]
};
const lowStock: ReportDataSource<{ itemCode: string; itemName: string; warehouseCode: string; onHand: number; stockStatus: string }> = {
  fetch: async () => {
    const rows = (await getInventory({ page: 1, pageSize: 500 })).items;
    return rows.filter((r) => r.stockStatus === 'Low Stock');
  },
  columns: [
    { key: 'itemName', header: 'Item', render: (r) => r.itemName || r.itemCode },
    { key: 'warehouseCode', header: 'Warehouse', render: (r) => r.warehouseCode },
    { key: 'onHand', header: 'On Hand', align: 'right', render: (r) => money(r.onHand) },
    { key: 'stockStatus', header: 'Status', render: (r) => r.stockStatus }
  ]
};

export const reportDataSources = {
  salesByMonth,
  salesByCustomer,
  salesByItem,
  salesByWarehouse,
  salesByEmployee,
  purchaseByMonth,
  purchaseByVendor,
  purchaseByItem,
  purchaseByWarehouse,
  productionByMonth,
  productionByStatus,
  topProducedItems,
  topConsumedMaterials,
  productionByWarehouse,
  financeRevenueTrend: financeTrend('revenueTrend'),
  financePurchaseTrend: financeTrend('purchaseTrend'),
  financeGrossProfitTrend: financeTrend('grossProfitTrend'),
  financeNetProfitTrend: financeTrend('netProfitTrend'),
  financeReceivablesTrend: financeTrend('receivablesTrend'),
  financePayablesTrend: financeTrend('payablesTrend'),
  financeCashFlow: financeTrend('cashFlow'),
  financeExpenseTrend: financeTrend('expenseTrend'),
  financeTaxTrend: financeTrend('taxTrend'),
  financeTopCustomers,
  financeTopVendors,
  financeTopExpenseAccounts,
  salesTaxByCode,
  purchaseTaxByCode,
  taxByMonth,
  stockAgeing,
  inventoryMovement,
  stockSummary,
  negativeStock,
  zeroStock,
  lowStock
} satisfies Record<string, ReportDataSource<never> | ReportDataSource<any>>;

export type ReportDataSourceKey = keyof typeof reportDataSources;
