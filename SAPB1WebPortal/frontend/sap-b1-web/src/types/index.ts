export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message: string | null;
  errors: string[];
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface LoginResponse {
  token: string;
  expiresAtUtc: string;
  expiresIn: number;
  username: string;
  company: string;
  companyName: string;
  role: string;
}

export interface CompanyOption {
  code: string;
  name: string;
}

export interface DashboardSummary {
  totalCustomers: number;
  totalVendors: number;
  totalItems: number;
  openSalesOrders: number;
  openPurchaseOrders: number;
  openDeliveries: number;
  openArInvoices: number;
  openApInvoices: number;
  currentStockValue: number;
  lowStockItemsCount: number;
  lowStockItems: LowStockItem[];
}

export interface LowStockItem {
  itemCode: string;
  itemName: string;
  onHand: number;
  committed: number;
  available: number;
}

export interface CustomerListItem {
  cardCode: string;
  cardName: string;
  groupName: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  salesEmployee: string | null;
  balance: number;
  creditLimit: number;
  active: boolean;
}

export interface CustomerAddress {
  addressType: string;
  street: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string | null;
}

export interface CustomerDetail {
  cardCode: string;
  cardName: string;
  groupName: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  gsTin: string | null;
  salesEmployee: string | null;
  territory: string | null;
  creditLimit: number;
  balance: number;
  active: boolean;
  addresses: CustomerAddress[];
}

export interface SupplierListItem {
  cardCode: string;
  cardName: string;
  groupName: string | null;
  phone: string | null;
  email: string | null;
  balance: number;
  creditLimit: number;
  active: boolean;
}

export interface SupplierDetail {
  cardCode: string;
  cardName: string;
  groupName: string | null;
  phone: string | null;
  email: string | null;
  gsTin: string | null;
  creditLimit: number;
  balance: number;
  active: boolean;
  addresses: CustomerAddress[];
}

export interface ItemListItem {
  /** Item master user-defined field "Aroma Code". */
  aromaCode: string | null;
  itemCode: string;
  itemName: string;
  itemGroup: string | null;
  inventoryUom: string | null;
  onHand: number;
  committed: number;
  available: number;
  active: boolean;
}

export interface ItemWarehouseStock {
  warehouseCode: string;
  warehouseName: string | null;
  onHand: number;
  committed: number;
  ordered: number;
  available: number;
}

export interface ItemDetail {
  itemCode: string;
  itemName: string;
  itemGroup: string | null;
  inventoryUom: string | null;
  salesUom: string | null;
  purchaseUom: string | null;
  barcode: string | null;
  onHand: number;
  committed: number;
  ordered: number;
  available: number;
  lastPurchasePrice: number;
  lastSalesPrice: number;
  active: boolean;
  warehouseStock: ItemWarehouseStock[];
}

export interface InventoryListItem {
  /** Item master user-defined field "Aroma Code". */
  aromaCode: string | null;
  itemCode: string;
  itemName: string;
  itemGroup: string;
  warehouseCode: string;
  warehouseName: string | null;
  onHand: number;
  committed: number;
  ordered: number;
  available: number;
  stockValue: number;
  stockStatus: 'In Stock' | 'Low Stock' | 'Out of Stock' | string;
}

export interface PagedQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  active?: boolean;
}

// ---------------------------------------------------------------
// Purchase module
// ---------------------------------------------------------------

export interface PurchaseDocumentQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: 'Open' | 'Closed' | string;
  vendor?: string;
  warehouse?: string;
  buyer?: string;
}

export interface PurchaseDocumentLine {
  lineNum: number;
  itemCode: string;
  itemName: string | null;
  quantity: number;
  openQuantity: number | null;
  warehouse: string | null;
  price: number;
  discountPercent: number;
  taxCode: string | null;
  lineTotal: number;
  requiredDate: string | null;
}

export interface RelatedDocument {
  documentType: string;
  docEntry: number;
  docNum: number;
  routeSegment: string;
  direction: 'Base' | 'Target';
}

interface PurchaseDocumentDetailBase {
  docEntry: number;
  docNum: number;
  postingDate: string;
  status: string;
  remarks: string | null;
  currency: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
  lines: PurchaseDocumentLine[];
  relatedDocuments: RelatedDocument[];
}

export interface PurchaseRequest {
  docEntry: number;
  docNum: number;
  requester: string | null;
  postingDate: string;
  requiredDate: string | null;
  status: string;
  total: number;
  currency: string | null;
}
export interface PurchaseRequestDetail extends PurchaseDocumentDetailBase {
  requester: string | null;
  requiredDate: string | null;
}

// ---- Purchase Request write-back (the only write path in the app) --------

export interface CreatePurchaseRequestLine {
  itemCode: string;
  quantity: number;
  warehouseCode: string;
  requiredDate?: string;
  remarks?: string;
  /** SAP B1's mandatory "Capital/Revenue" line classification for this company. */
  capitalOrRevenue: 'Revenue' | 'Capital';
}

export interface CreatePurchaseRequestPayload {
  requester?: string;
  requiredDate: string;
  remarks?: string;
  lines: CreatePurchaseRequestLine[];
}

export interface CreatePurchaseRequestResult {
  docEntry: number;
  docNum: number;
  status: string;
  company: string;
}

export interface Warehouse {
  warehouseCode: string;
  warehouseName: string;
}

// ---------------------------------------------------------------
// Administration (RBAC: Users / Roles / Permissions)
// ---------------------------------------------------------------

export interface CurrentUser {
  username: string;
  role: string;
  company: string;
  companyName: string;
  /** True for full-access roles (portal admin / Administrator): every module and page, including future ones. */
  isSuperUser: boolean;
  permissions: string[];
  /** Explicit page rules, "{module}.{page}.{action}" -> granted. */
  pageRules: Record<string, boolean>;
  /** Which SAP salespersons this login is limited to (restricted logins only see their own customers, orders, invoices and targets). */
  salesScope?: SalesScope | null;
}

export interface SalesScope {
  restricted: boolean;
  /** Sales-role login: adds/edits its own salesperson targets only; cannot approve. */
  ownTargetsOnly?: boolean;
  /** false = restricted but not linked to a salesperson yet: sees nothing. */
  linked: boolean;
  salespersons: { code: number; name: string }[];
}

export interface UserSalespersonLinks {
  links: Record<string, number[]>;
  salespersons: { code: number; name: string }[];
}

export interface AdminUser {
  id: number;
  username: string;
  displayName: string;
  roleName: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface CreateUserPayload {
  username: string;
  displayName: string;
  password: string;
  roleId: number;
}

export interface UpdateUserPayload {
  displayName: string;
  isActive: boolean;
  roleId: number;
}

export interface AdminRole {
  id: number;
  name: string;
  description: string | null;
  isSystemRole: boolean;
  userCount: number;
}

export interface CreateRolePayload {
  name: string;
  description?: string;
}

export interface Permission {
  id: number;
  module: string;
  action: string;
  permissionKey: string;
  description: string | null;
}

export interface PagePermission {
  moduleKey: string;
  pageKey: string;
  action: string;
  isGranted: boolean;
}

export interface RolePermissions {
  roleId: number;
  roleName: string;
  permissionKeys: string[];
  pagePermissions: PagePermission[];
}

// ---------------------------------------------------------------
// Administration: Server / Company Configuration (database-driven SAP B1
// company/server config — replaces manually editing appsettings/user-secrets
// for each new client). Never carries a password, encrypted or plaintext.
// ---------------------------------------------------------------

export interface ServerConfiguration {
  id: number;
  companyCode: string;
  companyName: string;
  sapCompanyDb: string;
  serviceLayerUrl: string;
  sapUsername: string;
  sqlServer: string;
  sqlDatabase: string;
  sqlUsername: string;
  sqlExtraOptions: string | null;
  hasSapPassword: boolean;
  hasSqlPassword: boolean;
  isActive: boolean;
  lastTestedAtUtc: string | null;
  lastTestResult: 'Success' | 'Failed' | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateServerConfigurationPayload {
  companyCode: string;
  companyName: string;
  sapCompanyDb: string;
  serviceLayerUrl: string;
  sapUsername: string;
  sapPassword: string;
  sqlServer: string;
  sqlDatabase: string;
  sqlUsername: string;
  sqlPassword: string;
  sqlExtraOptions: string | null;
  isActive: boolean;
}

/** CompanyCode is intentionally absent — it's the unique key baked into the
 * JWT companyDb claim and is not editable. Passwords are blank = unchanged. */
export interface UpdateServerConfigurationPayload {
  companyName: string;
  sapCompanyDb: string;
  serviceLayerUrl: string;
  sapUsername: string;
  sapPassword: string | null;
  sqlServer: string;
  sqlDatabase: string;
  sqlUsername: string;
  sqlPassword: string | null;
  sqlExtraOptions: string | null;
  isActive: boolean;
}

/** Plaintext form payload for testing an in-progress Add/Edit form before it's saved. */
export interface TestConnectionPayload {
  sapCompanyDb: string;
  serviceLayerUrl: string;
  sapUsername: string;
  sapPassword: string;
  sqlServer: string;
  sqlDatabase: string;
  sqlUsername: string;
  sqlPassword: string;
  sqlExtraOptions: string | null;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
}

export interface TestAllResult {
  sql: TestConnectionResult;
  sap: TestConnectionResult;
}

export interface PurchaseQuotation {
  docEntry: number;
  docNum: number;
  vendorCode: string;
  vendorName: string | null;
  postingDate: string;
  dueDate: string | null;
  buyer: string | null;
  status: string;
  total: number;
  currency: string | null;
}
export interface PurchaseQuotationDetail extends PurchaseDocumentDetailBase {
  vendorCode: string;
  vendorName: string | null;
  dueDate: string | null;
  buyer: string | null;
}

export interface PurchaseOrder {
  docEntry: number;
  docNum: number;
  vendorCode: string;
  vendorName: string | null;
  postingDate: string;
  dueDate: string | null;
  buyer: string | null;
  status: string;
  total: number;
  currency: string | null;
}
export interface PurchaseOrderDetail extends PurchaseDocumentDetailBase {
  vendorCode: string;
  vendorName: string | null;
  dueDate: string | null;
  buyer: string | null;
}

export interface Grpo {
  docEntry: number;
  docNum: number;
  vendorCode: string;
  vendorName: string | null;
  postingDate: string;
  dueDate: string | null;
  status: string;
  total: number;
  currency: string | null;
}
export interface GrpoDetail extends PurchaseDocumentDetailBase {
  vendorCode: string;
  vendorName: string | null;
  dueDate: string | null;
}

export interface ApInvoice {
  docEntry: number;
  docNum: number;
  vendorCode: string;
  vendorName: string | null;
  postingDate: string;
  dueDate: string | null;
  status: string;
  total: number;
  paid: number;
  balance: number;
  currency: string | null;
}
export interface ApInvoiceDetail extends PurchaseDocumentDetailBase {
  vendorCode: string;
  vendorName: string | null;
  dueDate: string | null;
  paid: number;
  balance: number;
}

export interface ApCreditMemo {
  docEntry: number;
  docNum: number;
  vendorCode: string;
  vendorName: string | null;
  postingDate: string;
  status: string;
  total: number;
  currency: string | null;
}
export interface ApCreditMemoDetail extends PurchaseDocumentDetailBase {
  vendorCode: string;
  vendorName: string | null;
}

export interface OutgoingPayment {
  docEntry: number;
  docNum: number;
  vendorCode: string;
  vendorName: string | null;
  postingDate: string;
  paymentType: string;
  currency: string | null;
  amount: number;
  status: string;
}
export interface ApInvoiceApplication {
  invoiceDocEntry: number;
  invoiceDocNum: number;
  amountApplied: number;
}
export interface OutgoingPaymentDetail {
  docEntry: number;
  docNum: number;
  vendorCode: string;
  vendorName: string | null;
  postingDate: string;
  paymentType: string;
  currency: string | null;
  amount: number;
  status: string;
  remarks: string | null;
  cashAmount: number;
  checkAmount: number;
  transferAmount: number;
  bankAccount: string | null;
  appliedInvoices: ApInvoiceApplication[];
}

export interface PurchaseDashboard {
  totalPurchaseOrders: number;
  openPurchaseOrders: number;
  purchaseOrdersThisMonth: number;
  purchaseOrdersThisYear: number;
  totalGrpo: number;
  openGrpo: number;
  totalApInvoices: number;
  openApInvoices: number;
  overdueApInvoices: number;
  outstandingPayables: number;
  monthlyPurchaseValue: number;
  yearlyPurchaseValue: number;
  openPurchaseOrderValue: number;
}

export interface PurchaseByPeriod {
  period: string;
  value: number;
}
export interface PurchaseByVendor {
  vendorCode: string;
  vendorName: string | null;
  value: number;
}
export interface PurchaseByItem {
  itemCode: string;
  itemName: string | null;
  value: number;
  quantity: number;
}
export interface PurchaseByWarehouse {
  warehouseCode: string;
  warehouseName: string | null;
  value: number;
}
export interface PurchaseAnalytics {
  purchaseByMonth: PurchaseByPeriod[];
  topVendors: PurchaseByVendor[];
  topItems: PurchaseByItem[];
  purchaseByWarehouse: PurchaseByWarehouse[];
  openPurchaseOrderValue: number;
  openGrpoValue: number;
  openApInvoiceValue: number;
  outstandingPayables: number;
}

// ---------------------------------------------------------------
// Sales module
// ---------------------------------------------------------------

export interface SalesDocumentQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: 'Open' | 'Closed' | string;
  customer?: string;
  warehouse?: string;
  salesEmployee?: string;
}

export interface SalesDocumentLine {
  lineNum: number;
  itemCode: string;
  itemName: string | null;
  quantity: number;
  openQuantity: number | null;
  deliveredQuantity: number | null;
  orderedQuantity: number | null;
  warehouse: string | null;
  price: number;
  discountPercent: number;
  taxCode: string | null;
  lineTotal: number;
}

interface SalesDocumentDetailBase {
  docEntry: number;
  docNum: number;
  postingDate: string;
  status: string;
  remarks: string | null;
  currency: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
  lines: SalesDocumentLine[];
  relatedDocuments: RelatedDocument[];
}

export interface SalesQuotation {
  docEntry: number;
  docNum: number;
  customerCode: string;
  customerName: string | null;
  postingDate: string;
  dueDate: string | null;
  salesEmployee: string | null;
  status: string;
  total: number;
  currency: string | null;
}
export interface SalesQuotationDetail extends SalesDocumentDetailBase {
  customerCode: string;
  customerName: string | null;
  dueDate: string | null;
  salesEmployee: string | null;
}

export interface SalesOrder {
  /** ETA from production as entered on the order lines. */
  etaProduction: string | null;
  /** Days from the order date to today (open orders only). */
  daysOpen: number | null;
  docEntry: number;
  docNum: number;
  customerCode: string;
  customerName: string | null;
  postingDate: string;
  dueDate: string | null;
  salesEmployee: string | null;
  status: string;
  total: number;
  currency: string | null;
}
export interface SalesOrderDetail extends SalesDocumentDetailBase {
  customerCode: string;
  customerName: string | null;
  dueDate: string | null;
  salesEmployee: string | null;
}

export interface Delivery {
  docEntry: number;
  docNum: number;
  customerCode: string;
  customerName: string | null;
  postingDate: string;
  dueDate: string | null;
  salesEmployee: string | null;
  warehouse: string | null;
  status: string;
  total: number;
  currency: string | null;
}
export interface DeliveryDetail extends SalesDocumentDetailBase {
  customerCode: string;
  customerName: string | null;
  dueDate: string | null;
  salesEmployee: string | null;
}

export interface ArInvoice {
  lrNo: string | null;
  lrDate: string | null;
  transporter: string | null;
  orderDate: string | null;
  daysOrderToInvoice: number | null;
  docEntry: number;
  docNum: number;
  customerCode: string;
  customerName: string | null;
  postingDate: string;
  dueDate: string | null;
  salesEmployee: string | null;
  status: string;
  total: number;
  paid: number;
  balance: number;
  currency: string | null;
}
export interface ArInvoiceDetail extends SalesDocumentDetailBase {
  customerCode: string;
  customerName: string | null;
  dueDate: string | null;
  salesEmployee: string | null;
  paid: number;
  balance: number;
}

export interface ArCreditMemo {
  docEntry: number;
  docNum: number;
  customerCode: string;
  customerName: string | null;
  postingDate: string;
  status: string;
  total: number;
  currency: string | null;
}
export interface ArCreditMemoDetail extends SalesDocumentDetailBase {
  customerCode: string;
  customerName: string | null;
}

export interface IncomingPayment {
  docEntry: number;
  docNum: number;
  customerCode: string;
  customerName: string | null;
  postingDate: string;
  paymentType: string;
  currency: string | null;
  amount: number;
  status: string;
}
export interface ArInvoiceApplication {
  invoiceDocEntry: number;
  invoiceDocNum: number;
  amountApplied: number;
}
export interface IncomingPaymentDetail {
  docEntry: number;
  docNum: number;
  customerCode: string;
  customerName: string | null;
  postingDate: string;
  paymentType: string;
  currency: string | null;
  amount: number;
  status: string;
  remarks: string | null;
  cashAmount: number;
  checkAmount: number;
  transferAmount: number;
  bankAccount: string | null;
  appliedInvoices: ArInvoiceApplication[];
}

export interface SalesDashboard {
  totalQuotations: number;
  openQuotations: number;
  totalSalesOrders: number;
  openSalesOrders: number;
  salesOrdersThisMonth: number;
  salesOrdersThisYear: number;
  totalDeliveries: number;
  pendingDeliveries: number;
  totalArInvoices: number;
  openArInvoices: number;
  overdueArInvoices: number;
  outstandingReceivables: number | null;
  monthlySalesValue: number;
  yearlySalesValue: number;
  openSalesOrderValue: number;
  incomingPaymentsThisMonth: number;
}

export interface SalesByPeriod {
  period: string;
  value: number;
}
export interface SalesByCustomer {
  customerCode: string;
  customerName: string | null;
  value: number;
}
export interface SalesByItem {
  itemCode: string;
  itemName: string | null;
  value: number;
  quantity: number;
}
export interface SalesByWarehouse {
  warehouseCode: string;
  warehouseName: string | null;
  value: number;
}
export interface SalesByEmployee {
  salesEmployeeCode: number;
  salesEmployeeName: string | null;
  value: number;
}
export interface SalesAnalytics {
  salesByMonth: SalesByPeriod[];
  topCustomers: SalesByCustomer[];
  topItems: SalesByItem[];
  salesByWarehouse: SalesByWarehouse[];
  salesBySalesEmployee: SalesByEmployee[];
  openQuotationValue: number;
  openSalesOrderValue: number;
  openDeliveryValue: number;
  openArInvoiceValue: number;
  outstandingReceivables: number;
  incomingPaymentsValue: number;
}

// ---------------------------------------------------------------
// Production / Manufacturing module
// ---------------------------------------------------------------

export interface ProductionOrderQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: 'Planned' | 'Released' | 'Closed' | 'Cancelled' | string;
  item?: string;
  warehouse?: string;
}

export interface BomQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: 'Production' | 'Sales' | string;
}

export interface Bom {
  code: string;
  itemName: string | null;
  treeType: string;
  quantity: number;
  warehouse: string | null;
  componentCount: number;
}

export interface BomComponent {
  childNum: number;
  itemCode: string;
  itemName: string | null;
  quantity: number;
  warehouse: string | null;
  issueMethod: string | null;
  uom: string | null;
  additionalQuantity: number;
}

export interface BomDetail {
  code: string;
  itemName: string | null;
  treeType: string;
  quantity: number;
  warehouse: string | null;
  components: BomComponent[];
}

export interface ProductionOrder {
  docEntry: number;
  docNum: number;
  itemCode: string;
  itemName: string | null;
  postingDate: string;
  dueDate: string | null;
  plannedQty: number;
  completedQty: number;
  remainingQty: number;
  warehouse: string | null;
  status: string;
  orderType: string;
  priority: number | null;
  origin: string | null;
}

export interface ProductionComponent {
  lineNum: number;
  itemCode: string;
  itemName: string | null;
  plannedQty: number;
  issuedQty: number;
  remainingQty: number;
  warehouse: string | null;
  issueMethod: string | null;
  uom: string | null;
  onHand: number;
  committed: number;
  available: number;
  availabilityStatus: 'Available' | 'Shortage' | 'Partially Available' | string;
}

export interface ProductionReceiptEvent {
  transNum: number;
  quantity: number;
  warehouse: string | null;
  postingDate: string;
}

export interface ProductionOrderDetail {
  docEntry: number;
  docNum: number;
  itemCode: string;
  itemName: string | null;
  postingDate: string;
  dueDate: string | null;
  startDate: string | null;
  releaseDate: string | null;
  closeDate: string | null;
  plannedQty: number;
  completedQty: number;
  rejectedQty: number;
  remainingQty: number;
  warehouse: string | null;
  status: string;
  orderType: string;
  priority: number | null;
  remarks: string | null;
  origin: string | null;
  hasBom: boolean;
  components: ProductionComponent[];
  receipts: ProductionReceiptEvent[];
}

export interface MaterialRequirement {
  productionOrderDocEntry: number;
  productionOrderDocNum: number;
  finishedGoodCode: string;
  finishedGoodName: string | null;
  componentItemCode: string;
  componentItemName: string | null;
  requiredQty: number;
  issuedQty: number;
  remainingQty: number;
  warehouse: string | null;
  onHand: number;
  committed: number;
  available: number;
  availabilityStatus: 'Available' | 'Shortage' | 'Partially Available' | string;
}

export interface MaterialConsumption {
  productionOrderDocEntry: number;
  productionOrderDocNum: number;
  finishedGoodCode: string;
  finishedGoodName: string | null;
  componentItemCode: string;
  componentItemName: string | null;
  plannedQty: number;
  issuedQty: number;
  variance: number;
  warehouse: string | null;
  postingDate: string;
}

export interface ProductionReceipt {
  transNum: number;
  productionOrderDocEntry: number | null;
  productionOrderDocNum: number | null;
  itemCode: string;
  itemName: string | null;
  quantity: number;
  warehouse: string | null;
  postingDate: string;
}

export interface ProductionDashboard {
  totalProductionOrders: number;
  openProductionOrders: number;
  plannedProductionOrders: number;
  releasedProductionOrders: number;
  inProgressProductionOrders: number;
  completedProductionOrders: number;
  closedProductionOrders: number;
  cancelledProductionOrders: number;
  totalPlannedQuantity: number;
  totalProducedQuantity: number;
  pendingProductionQuantity: number;
  productionOrdersThisMonth: number;
  productionOrdersThisYear: number;
  materialConsumptionThisMonth: number;
  productionValueThisMonth: number;
}

export interface ProductionByPeriod {
  period: string;
  orderCount: number;
  plannedQty: number;
  producedQty: number;
}
export interface ProductionByItem {
  itemCode: string;
  itemName: string | null;
  quantity: number;
}
export interface ProductionByWarehouse {
  warehouseCode: string;
  warehouseName: string | null;
  orderCount: number;
  producedQty: number;
}
export interface ProductionByStatus {
  status: string;
  count: number;
}
export interface ProductionAnalytics {
  productionByMonth: ProductionByPeriod[];
  productionByStatus: ProductionByStatus[];
  topProducedItems: ProductionByItem[];
  topConsumedMaterials: ProductionByItem[];
  productionByWarehouse: ProductionByWarehouse[];
  openPlannedQuantity: number;
  openProducedQuantity: number;
  openProductionValue: number;
}

// ---------------------------------------------------------------
// Finance / Accounting module
// ---------------------------------------------------------------

export interface ChartOfAccountsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  active?: boolean;
}

export interface LedgerQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  account?: string;
  businessPartner?: string;
  documentType?: string;
  debitCredit?: 'Debit' | 'Credit' | string;
}

export interface JournalEntryQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface BpLedgerQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  partnerType?: 'Customer' | 'Vendor' | string;
  businessPartner?: string;
}

export interface AgeingQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  businessPartner?: string;
  status?: string;
  ageingBucket?: string;
}

export interface ReportPeriodQuery {
  dateFrom?: string;
  dateTo?: string;
  account?: string;
  accountGroup?: string;
}

export interface Account {
  acctCode: string;
  acctName: string;
  classification: 'Assets' | 'Liabilities' | 'Equity' | 'Revenue' | 'Expenses' | 'Other' | string;
  groupName: string | null;
  parentCode: string | null;
  level: number;
  postable: boolean;
  active: boolean;
  currency: string | null;
  balance: number;
}

export interface LedgerEntry {
  transId: number;
  lineId: number;
  postingDate: string;
  dueDate: string | null;
  taxDate: string | null;
  accountCode: string;
  accountName: string | null;
  debit: number;
  credit: number;
  balance: number;
  reference: string | null;
  memo: string | null;
  documentType: string | null;
  documentNumber: number | null;
  businessPartnerCode: string | null;
  businessPartnerName: string | null;
}

export interface JournalEntry {
  transId: number;
  postingDate: string;
  reference: string | null;
  memo: string | null;
  origin: string | null;
  documentNumber: number | null;
  totalDebit: number;
  totalCredit: number;
}

export interface JournalEntryLine {
  lineId: number;
  accountCode: string;
  accountName: string | null;
  debit: number;
  credit: number;
  businessPartnerCode: string | null;
  businessPartnerName: string | null;
  lineMemo: string | null;
  contraAccount: string | null;
  costCenter: string | null;
}

export interface JournalEntryDetail {
  transId: number;
  postingDate: string;
  dueDate: string | null;
  taxDate: string | null;
  reference: string | null;
  reference2: string | null;
  memo: string | null;
  origin: string | null;
  documentNumber: number | null;
  lines: JournalEntryLine[];
  totalDebit: number;
  totalCredit: number;
  balanceDifference: number;
}

export interface BpLedger {
  bpCode: string;
  bpName: string | null;
  type: 'Customer' | 'Vendor' | string;
  openingBalance: number;
  debit: number;
  credit: number;
  balance: number;
  currency: string | null;
}

export interface Receivable {
  customerCode: string;
  customerName: string | null;
  docEntry: number;
  docNum: number;
  invoiceDate: string;
  dueDate: string | null;
  invoiceTotal: number;
  paid: number;
  balance: number;
  daysOverdue: number;
  status: string;
  currency: string | null;
  ageingBucket: string;
}

export interface Payable {
  vendorCode: string;
  vendorName: string | null;
  docEntry: number;
  docNum: number;
  invoiceDate: string;
  dueDate: string | null;
  invoiceTotal: number;
  paid: number;
  balance: number;
  daysOverdue: number;
  status: string;
  currency: string | null;
  ageingBucket: string;
}

export interface AgeingSummary {
  total: number;
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  days91To120: number;
  days120Plus: number;
  overdue: number;
  overduePercent: number;
  reportingDate: string;
}

export interface FinanceIncomingPayment {
  docEntry: number;
  docNum: number;
  customerCode: string;
  customerName: string | null;
  postingDate: string;
  currency: string | null;
  amount: number;
  paymentMethod: string;
  bankOrCash: string | null;
  reference: string | null;
  appliedInvoiceCount: number;
}

export interface FinanceOutgoingPayment {
  docEntry: number;
  docNum: number;
  vendorCode: string;
  vendorName: string | null;
  postingDate: string;
  currency: string | null;
  amount: number;
  paymentMethod: string;
  bankOrCash: string | null;
  reference: string | null;
  appliedInvoiceCount: number;
}

export interface BankCashAccount {
  acctCode: string;
  acctName: string;
  kind: 'Bank' | 'Cash' | string;
  currency: string | null;
  openingBalance: number;
  debit: number;
  credit: number;
  closingBalance: number;
}

export interface BankCashSummary {
  cashBalance: number;
  bankBalance: number;
  accounts: BankCashAccount[];
}

export interface TrialBalanceRow {
  acctCode: string;
  acctName: string;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export interface TrialBalance {
  dateFrom: string | null;
  dateTo: string | null;
  rows: TrialBalanceRow[];
  totalOpeningDebit: number;
  totalOpeningCredit: number;
  totalPeriodDebit: number;
  totalPeriodCredit: number;
  totalClosingDebit: number;
  totalClosingCredit: number;
  isBalanced: boolean;
}

export interface ProfitLossAccount {
  acctCode: string;
  acctName: string;
  amount: number;
}

export interface ProfitLoss {
  dateFrom: string;
  dateTo: string;
  revenue: ProfitLossAccount[];
  totalRevenue: number;
  costOfGoodsSold: ProfitLossAccount[];
  totalCostOfGoodsSold: number;
  grossProfit: number;
  grossMarginPercent: number;
  operatingExpenses: ProfitLossAccount[];
  totalOperatingExpenses: number;
  operatingProfit: number;
  otherIncome: ProfitLossAccount[];
  totalOtherIncome: number;
  otherExpenses: ProfitLossAccount[];
  totalOtherExpenses: number;
  netProfit: number;
  netMarginPercent: number;
}

export interface BalanceSheetAccount {
  acctCode: string;
  acctName: string;
  amount: number;
}

export interface BalanceSheet {
  asOfDate: string;
  cash: BalanceSheetAccount[];
  bank: BalanceSheetAccount[];
  accountsReceivable: number;
  inventory: number;
  otherCurrentAssets: BalanceSheetAccount[];
  nonCurrentAssets: BalanceSheetAccount[];
  totalAssets: number;
  accountsPayable: number;
  taxLiabilities: number;
  otherCurrentLiabilities: BalanceSheetAccount[];
  nonCurrentLiabilities: BalanceSheetAccount[];
  totalLiabilities: number;
  capital: BalanceSheetAccount[];
  retainedEarnings: number;
  currentYearResult: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
}

export interface TaxByCode {
  taxCode: string;
  taxCodeName: string | null;
  taxRate: number | null;
  taxableAmount: number;
  taxAmount: number;
}

export interface TaxByPeriod {
  period: string;
  outputTax: number;
  inputTax: number;
}

export interface TaxSummary {
  dateFrom: string;
  dateTo: string;
  taxableSales: number;
  outputTax: number;
  taxablePurchases: number;
  inputTax: number;
  netTax: number;
  salesTaxByCode: TaxByCode[];
  purchaseTaxByCode: TaxByCode[];
  taxByMonth: TaxByPeriod[];
}

export interface FinanceDashboard {
  totalReceivables: number;
  totalPayables: number;
  cashBalance: number;
  bankBalance: number;
  outstandingAr: number;
  outstandingAp: number;
  salesThisMonth: number;
  purchasesThisMonth: number;
  netProfitThisMonth: number;
  taxPayable: number;
  journalEntriesThisMonth: number;
  incomingPaymentsThisMonth: number;
  outgoingPaymentsThisMonth: number;
}

export interface FinanceByPeriod {
  period: string;
  value: number;
}
export interface FinanceByPartner {
  code: string;
  name: string | null;
  value: number;
}
export interface FinanceByAccount {
  acctCode: string;
  acctName: string | null;
  value: number;
}

export interface FinanceAnalytics {
  revenueTrend: FinanceByPeriod[];
  purchaseTrend: FinanceByPeriod[];
  grossProfitTrend: FinanceByPeriod[];
  netProfitTrend: FinanceByPeriod[];
  receivablesTrend: FinanceByPeriod[];
  payablesTrend: FinanceByPeriod[];
  cashFlow: FinanceByPeriod[];
  expenseTrend: FinanceByPeriod[];
  taxTrend: FinanceByPeriod[];
  topCustomersByRevenue: FinanceByPartner[];
  topVendorsByPurchase: FinanceByPartner[];
  topExpenseAccounts: FinanceByAccount[];
}

// ---------------------------------------------------------------
// Reports Center — the genuinely new cross-cutting reports only; the
// catalog itself (src/data/reportCatalog.ts) reuses the types/endpoints
// already declared above for Sales/Purchase/Production/Finance/Inventory.
// ---------------------------------------------------------------

export interface ManagementSummary {
  salesThisMonth: number;
  purchasesThisMonth: number;
  revenue: number;
  expenses: number;
  receivables: number;
  payables: number;
  cashBalance: number;
  bankBalance: number;
  inventoryValue: number;
  netProfitThisMonth: number;
  openSalesOrders: number;
  openPurchaseOrders: number;
  openProductionOrders: number;
  workingCapitalEstimate: number;
}

export interface StockAgeingQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  warehouse?: string;
  ageingBucket?: string;
}

export interface StockAgeingRow {
  itemCode: string;
  itemName: string | null;
  warehouseCode: string;
  warehouseName: string | null;
  onHand: number;
  stockValue: number;
  lastReceiptDate: string | null;
  ageDays: number | null;
  ageingBucket: string;
}

export interface InventoryMovementQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  item?: string;
  warehouse?: string;
}

export interface InventoryMovement {
  transNum: number;
  postingDate: string;
  itemCode: string;
  itemName: string | null;
  warehouse: string | null;
  inQty: number;
  outQty: number;
  transactionType: string | null;
  description: string | null;
}

// ---- Sales Overview (client-approved dashboard) ----
export interface SalesOverviewQuery {
  fromDate?: string;
  toDate?: string;
  includeTax?: boolean;
}

export interface SalesOverviewMonth {
  period: string;
  label: string;
  value: number;
  quantity: number;
  previousValue: number;
  previousQuantity: number;
}

export interface SalesOverview {
  fyStart: string;
  fyEnd: string;
  fyLabel: string;
  includeTax: boolean;
  totalCustomers: number;
  newCustomersThisQuarter: number;
  openSalesOrders: number;
  openSalesOrderValue: number;
  pendingInvoices: number;
  pendingInvoiceValue: number;
  totalOutstanding: number;
  overdueOutstanding: number;
  overdueDaysThreshold: number;
  monthly: SalesOverviewMonth[];
  salesPersons: { salesEmployeeCode: number; salesEmployeeName: string | null; value: number }[];
  topCustomers: { customerCode: string; customerName: string | null; value: number }[];
  topItems: { itemCode: string; itemName: string | null; value: number; quantity: number }[];
}

export interface TurnoverQuery {
  dateFrom?: string;
  dateTo?: string;
  includeTax?: boolean;
  netOfCreditNotes?: boolean;
  productCategory?: string;
  customerGroup?: number;
  locations?: number[];
  branch?: number;
}

export interface TurnoverOption {
  code: number;
  name: string;
  /** Locations only: unticked by default for this company. */
  isDefaultExcluded?: boolean;
  /** Locations only: optional report label, e.g. "Unit - 4 ( Chemicals )". */
  label?: string | null;
}

export interface TurnoverBreakup {
  dateFrom: string;
  dateTo: string;
  totalTurnover: number;
  netOfCreditNotes: boolean;
  customerGroupSales: { customerGroup: string; salesValue: number; percentage: number }[];
  groupLocationBranchSales: { customerGroup: string; location: string; branch: string; salesValue: number; percentage: number }[];
  customerGroups: TurnoverOption[];
  locations: TurnoverOption[];
  branches: TurnoverOption[];
}

export interface OpenSalesOrderRow {
  /** ETA from production as entered on the order lines. */
  etaProduction: string | null;
  /** Days from the order date to today. */
  daysOpen: number;
  docEntry: number;
  docNum: number;
  postingDate: string;
  customerCode: string;
  customerName: string | null;
  city: string | null;
  item: string | null;
  lineCount: number;
  orderedQty: number;
  pendingQty: number;
  uom: string | null;
  productionStatus: string | null;
  productionProgress: number | null;
  eta: string | null;
  deliveryStatus: 'Not Dispatched' | 'Part Dispatched' | 'Dispatched';
  total: number;
}

export interface OpenSalesOrders {
  totalOpen: number;
  totalValue: number;
  inProduction: number;
  ready: number;
  pending: number;
  partDispatched: number;
  totalCount: number;
  rows: OpenSalesOrderRow[];
}

// ---- Sales Reports (Invoice Register, Outstanding, Ledger, Analytics) ----
export interface InvoiceRegisterQuery {
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  dispatch?: 'all' | 'delivery' | 'direct';
  page?: number;
  pageSize?: number;
  includeTax?: boolean;
}

export interface InvoiceRegisterRow {
  /** Aroma Code of the first line's item. */
  aromaCode: string | null;
  lrNo: string | null;
  lrDate: string | null;
  transporter: string | null;
  orderDate: string | null;
  daysOrderToInvoice: number | null;
  docEntry: number;
  docNum: number;
  docDate: string;
  customerCode: string;
  customerName: string | null;
  item: string | null;
  lineCount: number;
  quantity: number;
  uom: string | null;
  rate: number;
  value: number;
  dispatchStatus: 'Against Delivery' | 'Direct Invoice';
  status: string;
}

export interface InvoiceRegister {
  totalCount: number;
  totalValue: number;
  rows: InvoiceRegisterRow[];
}

export interface CustomerAgeingRow {
  customerCode: string;
  customerName: string | null;
  salesPerson: string | null;
  days0To30: number;
  days31To60: number;
  days61To90: number;
  days90Plus: number;
  /** Days from the due date of the customer's oldest unpaid invoice to today. */
  overdueDays: number | null;
  total: number;
  risk: 'Low' | 'Watch' | 'High';
}

export interface CustomerOutstanding {
  asOf: string;
  creditTermsDays: number;
  total: number;
  customerCount: number;
  current: number;
  overdue: number;
  overdueCustomerCount: number;
  buckets: { label: string; value: number }[];
  customers: CustomerAgeingRow[];
}

export interface CustomerLookup {
  customerCode: string;
  customerName: string | null;
}

export interface LedgerRow {
  date: string;
  docType: string;
  docNo: string | null;
  particulars: string | null;
  debit: number;
  credit: number;
  balance: number;
}

export interface CustomerLedger {
  customerCode: string;
  customerName: string | null;
  city: string | null;
  taxNo: string | null;
  dateFrom: string;
  dateTo: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  creditLimit: number;
  currentBalance: number;
  rows: LedgerRow[];
}

export interface SalesAnalyticsQuery {
  customer?: string;
  salesPerson?: number;
  item?: string;
  dateFrom?: string;
  dateTo?: string;
  includeTax?: boolean;
}

export interface AnalyticsComparison {
  key: string;
  name: string | null;
  value: number;
  previousValue: number;
}

export interface SalesAnalyticsReport {
  dateFrom: string;
  dateTo: string;
  quantity: number;
  previousQuantity: number;
  value: number;
  previousValue: number;
  averageRate: number;
  previousAverageRate: number;
  trend: { label: string; value: number; quantity: number }[];
  customers: AnalyticsComparison[];
  items: AnalyticsComparison[];
}

export interface SalesAnalyticsOptions {
  customers: { key: string; name: string | null }[];
  salesPersons: { key: string; name: string | null }[];
  items: { key: string; name: string | null }[];
}

// ---- Salesperson Targets ----
export type SalesTargetStatus = 'Draft' | 'Submitted' | 'Approved' | 'Rejected' | 'Superseded';
export type SalesTargetPeriodType = 'Monthly' | 'Quarterly' | 'Annual' | 'Custom';

export type SalesTargetScope = 'Company' | 'Unit' | 'Salesperson';

export interface SalesTarget {
  id: number;
  scope: SalesTargetScope;
  sapSlpCode: number;
  salespersonName: string;
  unitCode: number;
  unitName: string;
  financialYear: string;
  periodType: SalesTargetPeriodType;
  periodStart: string;
  periodEnd: string;
  targetAmount: number;
  currencyCode: string;
  hasItems: boolean;
  itemCount: number;
  totalTargetQuantity: number;
  actualQuantity: number;
  remarks: string | null;
  status: SalesTargetStatus;
  revisionOfId: number | null;
  reviewRemarks: string | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  actualSales: number;
  achievementPct: number | null;
  remainingTarget: number;
  variance: number;
  salesOrders: number;
  arInvoices: number;
}

export interface SalesTargetLine {
  id: number;
  itemCode: string;
  itemName: string | null;
  itemGroup: string | null;
  uom: string | null;
  targetQuantity: number;
  targetAmount: number;
  remarks: string | null;
  actualQuantity: number;
  actualAmount: number;
  achievementPct: number | null;
  quantityAchievementPct: number | null;
  remainingAmount: number;
  remainingQuantity: number;
}

export interface SalesTargetItemOption {
  aromaCode: string | null;
  code: string;
  name: string;
  group: string | null;
  uom: string | null;
}

export interface SalesTargetListResponse {
  summary: {
    totalTarget: number;
    totalActual: number;
    overallAchievementPct: number | null;
    salespersonsWithTargets: number;
    pendingApproval: number;
  };
  byPerson: { sapSlpCode: number; salesperson: string; target: number; actual: number }[];
  rows: SalesTarget[];
  totalCount: number;
  includeTax: boolean;
}

export interface SalesTargetAuditEntry {
  id: number;
  action: string;
  performedBy: string;
  performedAt: string;
  detail: string | null;
}

export interface SalesTargetDetail {
  target: SalesTarget;
  lines: SalesTargetLine[];
  history: SalesTargetAuditEntry[];
}

export interface SalesTargetOptions {
  salespersons: { code: number; name: string; active: boolean }[];
  units: TurnoverOption[];
  financialYears: string[];
}

export interface SalesTargetQuery {
  scope?: SalesTargetScope;
  financialYear?: string;
  periodType?: string;
  unit?: number;
  salesperson?: number;
  item?: string;
  fromDate?: string;
  toDate?: string;
  status?: string;
  search?: string;
  includeTax?: boolean;
  page?: number;
  pageSize?: number;
}

export interface SaveSalesTargetLineRequest {
  itemCode: string;
  targetQuantity: number;
  targetAmount: number;
  remarks?: string;
}

export interface SaveSalesTargetRequest {
  scope?: SalesTargetScope;
  sapSlpCode: number;
  unitCode: number;
  financialYear: string;
  periodType: SalesTargetPeriodType;
  periodIndex: number;
  /** Custom period only (yyyy-MM-dd). */
  fromDate?: string;
  toDate?: string;
  targetAmount: number;
  remarks?: string;
  /** Item-wise rows; when present the header total is the sum of the row amounts (computed server-side). */
  lines?: SaveSalesTargetLineRequest[];
}

// ---- Detail reports that reproduce the client's own SAP queries ----
export interface DetailReportQuery {
  dateFrom?: string;
  dateTo?: string;
  warehouse?: string;
  unit?: number;
  branch?: number;
  salesperson?: number;
  customer?: string;
  customerGroup?: number;
  productCategory?: string;
  item?: string;
  docType?: string;
  search?: string;
  newThisQuarter?: boolean;
  includeTax?: boolean;
  netOfCreditNotes?: boolean;
  locations?: number[];
  allDates?: boolean;
  by?: string;
  page?: number;
  pageSize?: number;
}

export interface ReportFilterOptions {
  units: TurnoverOption[];
  branches: TurnoverOption[];
  customerGroups: TurnoverOption[];
  salespersons: { code: number; name: string; active: boolean }[];
  warehouses: { code: string; name: string }[];
  productCategories: string[];
}

export interface OpenOrderTotals {
  openLines: number;
  distinctOrders: number;
  orderedQuantity: number;
  openQuantity: number;
  lineTotal: number;
}

export interface OpenSalesOrderLine {
  /** Item master user-defined field "Aroma Code". */
  aromaCode: string | null;
  /** ETA from production, exactly as entered on the order line (free text). */
  etaProduction: string | null;
  /** Days from the order date to today. */
  daysOpen: number;
  docEntry: number;
  docNum: number;
  postingDate: string;
  dueDate: string | null;
  customerCode: string;
  customerName: string | null;
  itemCode: string | null;
  itemDescription: string | null;
  productCategory: string | null;
  warehouseCode: string | null;
  warehouse: string | null;
  unit: string | null;
  salesperson: string | null;
  orderedQuantity: number;
  openQuantity: number;
  unitPrice: number;
  lineTotal: number;
  documentStatus: string;
  lineStatus: string;
}

export interface OpenSalesOrderReport {
  dateFrom: string;
  dateTo: string;
  totals: OpenOrderTotals;
  totalCount: number;
  rows: OpenSalesOrderLine[];
}

export interface OpenPurchaseOrderLine {
  /** Item master user-defined field "Aroma Code". */
  aromaCode: string | null;
  docEntry: number;
  docNum: number;
  postingDate: string;
  dueDate: string | null;
  vendorCode: string;
  vendorName: string | null;
  itemCode: string | null;
  itemDescription: string | null;
  warehouseCode: string | null;
  warehouse: string | null;
  orderedQuantity: number;
  openQuantity: number;
  unitPrice: number;
  lineTotal: number;
  documentStatus: string;
}

export interface OpenPurchaseOrderReport {
  dateFrom: string;
  dateTo: string;
  totals: OpenOrderTotals;
  totalCount: number;
  rows: OpenPurchaseOrderLine[];
}

export interface SalesRegisterRow {
  /** Item master user-defined field "Aroma Code". */
  aromaCode: string | null;
  lrNo: string | null;
  lrDate: string | null;
  transporter: string | null;
  orderDate: string | null;
  /** Days from the order date to the invoice date; null without a linked sales order. */
  daysOrderToInvoice: number | null;
  docType: string;
  docEntry: number;
  docNum: number;
  postingDate: string;
  customerCode: string;
  customerName: string | null;
  customerGroup: string | null;
  salesperson: string | null;
  itemCode: string | null;
  itemDescription: string | null;
  productCategory: string | null;
  warehouse: string | null;
  unit: string | null;
  quantity: number;
  rate: number;
  basicAmount: number;
  netSales: number;
  taxAmount: number;
  netSalesInclTax: number;
}

export interface SalesRegisterReport {
  dateFrom: string;
  dateTo: string;
  totals: { lines: number; quantity: number; basicAmount: number; netSales: number; taxAmount: number; netSalesInclTax: number };
  totalCount: number;
  rows: SalesRegisterRow[];
}

export interface LedgerOutstandingQuery {
  asOf?: string;
  customer?: string;
  branch?: number;
  /** Dashboard unit; the server maps it to its SAP branch. */
  unit?: number;
  customerGroup?: number;
  /** The customer's assigned salesperson. */
  salesperson?: number;
  page?: number;
  pageSize?: number;
}

export interface OutstandingLedger {
  asOf: string;
  /** false when the selected unit has no SAP branch mapping; note says why. */
  available: boolean;
  note: string | null;
  unitLabel: string | null;
  totalOutstanding: number;
  customerCount: number;
  byBranch: { branchCode: number | null; branch: string; amount: number }[];
  ageing: { label: string; amount: number }[];
  totalCount: number;
  customers: {
    customerCode: string;
    customerName: string | null;
    salesPerson: string | null;
    balance: number;
    days0To30: number;
    days31To60: number;
    days61To90: number;
    days91To120: number;
    days121To150: number;
    days151To180: number;
    days181To210: number;
    days211Plus: number;
    /** Days from the due date to the As-on date for the customer's oldest owed item. */
    overdueDays: number | null;
  }[];
  unpaidInvoicesToday: number;
  noBillToBalance: number;
  noBillToCustomers: number;
}

export interface OutstandingLine {
  /** Days from the due date to the As-on date (negative = not yet due). */
  overdueDays: number | null;
  transId: number;
  customerCode: string;
  customerName: string | null;
  branch: string | null;
  postingDate: string;
  dueDate: string | null;
  transType: number;
  documentType: string | null;
  baseRef: string | null;
  ref1: string | null;
  daysOutstanding: number;
  balance: number;
}

export interface OutstandingLinesReport {
  asOf: string;
  total: number;
  totalCount: number;
  rows: OutstandingLine[];
}

export interface CustomerRow {
  customerCode: string;
  customerName: string | null;
  customerGroup: string | null;
  salesperson: string | null;
  city: string | null;
  createdDate: string | null;
  balance: number;
}

export interface CustomerReport {
  totals: { customers: number; newThisQuarter: number; quarterStart: string };
  totalCount: number;
  rows: CustomerRow[];
}

export interface PendingDeliveryRow {
  docEntry: number;
  docNum: number;
  postingDate: string;
  dueDate: string | null;
  customerCode: string;
  customerName: string | null;
  salesperson: string | null;
  branch: string | null;
  lines: number;
  daysOpen: number;
  docTotal: number;
}

export interface PendingDeliveryReport {
  totals: { deliveries: number; docTotal: number };
  totalCount: number;
  rows: PendingDeliveryRow[];
}

export interface SalesAnalysisRow {
  /** Item master user-defined field "Aroma Code". */
  aromaCode: string | null;
  key: string;
  name: string;
  invoices: number;
  quantity: number;
  value: number;
  percentage: number;
}

export interface SalesAnalysisReport {
  dateFrom: string;
  dateTo: string;
  by: string;
  includeTax: boolean;
  totals: { rows: number; invoices: number; quantity: number; value: number };
  totalCount: number;
  rows: SalesAnalysisRow[];
}

// ---- Sales Dashboard: turnover vs target + named units ----
export interface PerformanceQuery {
  dateFrom?: string;
  dateTo?: string;
  unit?: number;
  includeTax?: boolean;
  netOfCreditNotes?: boolean;
  customerGroup?: number;
  salesperson?: number;
  productCategory?: string;
}

export interface UnitPerformance {
  label: string;
  locationCode: number | null;
  locationName: string | null;
  branchCode: number | null;
  branchName: string | null;
  actual: number;
  targetConfigured: boolean;
  target: number | null;
  achievementPct: number | null;
  variance: number | null;
  openOrderLines: number;
  openOrderValue: number;
  outstanding: number | null;
  note: string | null;
}

export interface SalesPerformance {
  dateFrom: string;
  dateTo: string;
  includeTax: boolean;
  netOfCreditNotes: boolean;
  selectedUnit: number | null;
  selectedUnitLabel: string;
  actual: number;
  /** Actual on the basis targets are set on (ex-tax); achievement, remaining and variance use it. */
  comparisonActual: number;
  targetLevel: string | null;
  targetConfigured: boolean;
  target: number | null;
  achievementPct: number | null;
  remaining: number | null;
  variance: number | null;
  status: 'Achieved' | 'In progress' | 'No target configured';
  targetCount: number;
  partialTargetsExcluded: number;
  targetBasis: string;
  units: UnitPerformance[];
  openOrders: OpenOrderTotals;
  totalOutstanding: number;
  outstandingAvailable: boolean;
  outstandingNote: string | null;
}

export interface CustomerGroupSalesRow {
  groupCode: number | null;
  customerGroup: string;
  customerCode: string;
  customerName: string | null;
  value: number;
  documents: number;
}

export interface CustomerGroupSales {
  dateFrom: string;
  dateTo: string;
  includeTax: boolean;
  netOfCreditNotes: boolean;
  total: number;
  rows: CustomerGroupSalesRow[];
}

export interface UnpaidInvoiceRow {
  docEntry: number;
  docNum: number;
  postingDate: string;
  dueDate: string | null;
  customerCode: string;
  customerName: string | null;
  salesperson: string | null;
  branch: string | null;
  docTotal: number;
  paidToDate: number;
  balance: number;
  daysOverdue: number;
}

export interface UnpaidInvoiceReport {
  totals: { invoices: number; docTotal: number; paidToDate: number; balance: number; overdue: number };
  totalCount: number;
  rows: UnpaidInvoiceRow[];
}

export interface LostCustomerQuery {
  financialYear?: string;
  asOf?: string;
  unit?: number;
  customerGroup?: number;
  salesperson?: number;
  minPreviousSales?: number;
  search?: string;
  includeTax?: boolean;
  page?: number;
  pageSize?: number;
}

export interface LostCustomerRow {
  customerCode: string;
  customerName: string | null;
  customerGroup: string | null;
  salesperson: string | null;
  previousYearSales: number;
  currentYearSales: number;
  lastSalesDate: string | null;
  previousInvoiceLines: number;
  frozen: boolean;
}

export interface LostCustomerReport {
  financialYear: string;
  previousFrom: string;
  previousTo: string;
  currentFrom: string;
  currentTo: string;
  currentFyEnd: string;
  currentYearComplete: boolean;
  summary: { previousYearCustomers: number; lostCustomers: number; lostPreviousSales: number; previousYearSales: number };
  totalCount: number;
  rows: LostCustomerRow[];
}

export interface OrderExecutionRow {
  orderEntry: number; orderNo: number; orderDate: string; customerCode: string; customerName: string | null;
  salesperson: string | null; branch: string | null; orderedQuantity: number | null;
  invoiceNo: number | null; invoiceDate: string | null; invoicedQuantity: number | null; daysToInvoice: number | null; status: string;
}
export interface OrderExecutionReport {
  dateFrom: string; dateTo: string;
  summary: { orders: number; invoicedOrders: number; awaitingInvoice: number; averageDays: number | null; medianDays: number | null; longestDays: number | null; shortestDays: number | null; buckets: { label: string; orders: number }[] };
  totalCount: number; rows: OrderExecutionRow[];
}

export interface SalesActivity {
  dateFrom: string; dateTo: string; asOf: string; monthFrom: string; yearFrom: string;
  totalQuotations: number; openQuotations: number;
  totalSalesOrders: number; openSalesOrders: number; salesOrdersThisMonth: number; salesOrdersThisYear: number; openSalesOrderValue: number;
  totalDeliveries: number; pendingDeliveries: number;
  totalArInvoices: number; openArInvoices: number; overdueArInvoices: number; outstandingReceivables: number;
  monthlySalesValue: number; yearlySalesValue: number;
  incomingPaymentsThisMonth: number | null; incomingPaymentsNote: string | null;
  outstandingReceivablesNote: string | null;
}

export interface ActivityQuery {
  dateFrom?: string; dateTo?: string; unit?: number; includeTax?: boolean; netOfCreditNotes?: boolean;
  customerGroup?: number; salesperson?: number; productCategory?: string;
}

export interface PeriodPerformance {
  label: string; start: string; end: string; actual: number;
  target: number | null; achievementPct: number | null; remaining: number | null; variance: number | null;
}

export interface TargetPerformance {
  scope: SalesTargetScope; financialYear: string; entityLabel: string; includeTax: boolean;
  months: PeriodPerformance[]; quarters: PeriodPerformance[]; year: PeriodPerformance; note: string;
}

export interface TargetPerformanceQuery {
  scope: SalesTargetScope; financialYear?: string; unit?: number; salesperson?: number;
}
