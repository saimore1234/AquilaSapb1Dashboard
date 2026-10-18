import { Link } from "react-router-dom";
import TurnoverSection from "../../components/sales/TurnoverSection";
import KeyMetricsSection from "../../components/sales/KeyMetricsSection";
import SalesChartsSection from "../../components/sales/SalesChartsSection";
import OpenOrdersSection from "../../components/sales/OpenOrdersSection";
import InvoiceRegisterSection from "../../components/sales/InvoiceRegisterSection";
import OutstandingSection from "../../components/sales/OutstandingSection";
import LedgerSection from "../../components/sales/LedgerSection";
import AnalyticsSection from "../../components/sales/AnalyticsSection";
import SampleStatusSection from "../../components/sales/SampleStatusSection";
import { formatFy, formatPeriod } from "../../components/sales/formatters";
import {
  RefreshBar,
  SalesRefreshProvider,
} from "../../components/sales/salesRefresh";
import {
  GlobalSalesFilterBar,
  SalesFilterProvider,
  useSalesFilters,
} from "../../components/sales/salesFilters";
import { SALES_REPORTS_PATH, salesReportPath } from "../../data/salesReports";

/**
 * Client-approved Sales Dashboard. Every section is the same component the
 * matching Sales → Reports page renders; its heading links to that report.
 */
export default function SalesOverview() {
  return (
    <SalesRefreshProvider>
      <SalesFilterProvider>
        <Dashboard />
      </SalesFilterProvider>
    </SalesRefreshProvider>
  );
}

function Dashboard() {
  const { applied } = useSalesFilters();
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink-primary leading-tight">Sales Overview</h1>
          <p className="text-sm text-ink-secondary mt-0.5">
            {formatFy(applied.to)} · {formatPeriod(applied.from, applied.to)} · Live from SAP Business One
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <RefreshBar />
          <Link to={SALES_REPORTS_PATH} className="btn-secondary btn-compact">All Reports</Link>
          <Link to="/sales/analytics" className="btn-secondary btn-compact">Sales Analytics</Link>
        </div>
      </header>

      <GlobalSalesFilterBar />
      <TurnoverSection />
      <KeyMetricsSection reportTo={salesReportPath("key-metrics")} />
      <SalesChartsSection reportTo={salesReportPath("sales-overview")} />
      <OpenOrdersSection reportTo={salesReportPath("open-sales-orders")} />
      <InvoiceRegisterSection reportTo={salesReportPath("invoice-register")} />
      <OutstandingSection reportTo={salesReportPath("customer-outstanding")} />
      <LedgerSection reportTo={salesReportPath("customer-ledger")} />
      <SampleStatusSection reportTo={salesReportPath("sample-status")} />
      <AnalyticsSection reportTo={salesReportPath("sales-analytics")} />
    </div>
  );
}
