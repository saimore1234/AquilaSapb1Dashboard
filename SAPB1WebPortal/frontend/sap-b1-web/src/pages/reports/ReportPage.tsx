import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Info } from 'lucide-react';
import { reportCatalog } from '../../data/reportCatalog';
import { reportDataSources, type ReportDataSourceKey, type ReportDataSource } from '../../data/reportDataSources';
import ReportViewer from '../../components/reports/ReportViewer';
import { useReportPreferences } from '../../hooks/useReportPreferences';

export default function ReportPage() {
  const { categoryId = '', reportId = '' } = useParams();
  const report = reportCatalog.find((r) => r.category === categoryId && r.id === reportId);
  const { isFavorite, toggleFavorite, recordRecent } = useReportPreferences();

  useEffect(() => {
    if (report && report.kind !== 'link') recordRecent(report.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id]);

  if (!report) {
    return (
      <div className="card">
        <p className="text-ink-primary font-medium">Report not found.</p>
        <Link to="/reports" className="text-sm text-brand-600 dark:text-brand-400 mt-2 inline-block">
          Back to Reports
        </Link>
      </div>
    );
  }

  const backLink = (
    <Link to={`/reports/${report.category}`} className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
      <ArrowLeft className="h-4 w-4" />
      Back to {report.category.replace('-', ' ')} reports
    </Link>
  );

  if (report.kind === 'unavailable') {
    return (
      <div className="space-y-4">
        {backLink}
        <div className="card">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-warning-bg text-warning flex items-center justify-center shrink-0">
              <Info className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-ink-primary">{report.name}</h1>
              <p className="text-sm text-ink-secondary mt-1">{report.description}</p>
              <p className="text-sm text-ink-tertiary mt-3 max-w-xl">{report.unavailableReason}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // The catalog resolves a report's data source dynamically by string key at
  // runtime (that's what lets ~200 catalog entries share ~30 real data
  // sources without one bespoke component per report) — TypeScript can't
  // know the exact row shape T until then, so this is the one deliberate
  // type-erasure boundary in the Reports Center, not a design flaw.
  const dataSource = reportDataSources[report.dataSource as ReportDataSourceKey] as unknown as ReportDataSource<Record<string, unknown>>;

  return (
    <div className="space-y-4">
      {backLink}
      <ReportViewer
        title={report.name}
        description={report.description}
        dataSource={dataSource}
        isFavorite={isFavorite(report.id)}
        onToggleFavorite={() => toggleFavorite(report.id)}
      />
    </div>
  );
}
