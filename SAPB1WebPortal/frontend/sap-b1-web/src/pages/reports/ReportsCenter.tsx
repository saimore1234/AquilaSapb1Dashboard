import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Star, Clock, FileBarChart } from 'lucide-react';
import SearchBar from '../../components/SearchBar';
import { reportCategories, reportCatalog, searchReports, type ReportDefinition } from '../../data/reportCatalog';
import { useReportPreferences } from '../../hooks/useReportPreferences';

function reportHref(r: ReportDefinition) {
  return r.kind === 'link' ? r.route! : `/reports/${r.category}/${r.id}`;
}

export default function ReportsCenter() {
  const [search, setSearch] = useState('');
  const { favorites, recents } = useReportPreferences();

  const results = useMemo(() => searchReports(search), [search]);

  const favoriteReports = favorites.map((id) => reportCatalog.find((r) => r.id === id)).filter(Boolean) as ReportDefinition[];
  const recentReports = recents.map((id) => reportCatalog.find((r) => r.id === id)).filter(Boolean) as ReportDefinition[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-ink-primary">Reports</h1>
        <p className="text-ink-secondary text-sm mt-0.5">The central place for every report across this portal — {reportCatalog.length} reports, all real SAP B1 data</p>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="Search reports…" />

      {search.trim() ? (
        <div className="card p-0 overflow-hidden">
          <p className="px-5 pt-5 pb-2 text-sm text-ink-secondary">{results.length} result{results.length === 1 ? '' : 's'}</p>
          <div className="divide-y divide-border">
            {results.map((r) => (
              <ReportRow key={r.id} report={r} />
            ))}
            {results.length === 0 && <p className="px-5 py-8 text-center text-sm text-ink-tertiary">No reports match "{search}".</p>}
          </div>
        </div>
      ) : (
        <>
          {favoriteReports.length > 0 && (
            <Section title="Favorite Reports" icon={Star}>
              <div className="card p-0 overflow-hidden divide-y divide-border">
                {favoriteReports.map((r) => (
                  <ReportRow key={r.id} report={r} />
                ))}
              </div>
            </Section>
          )}

          {recentReports.length > 0 && (
            <Section title="Recent Reports" icon={Clock}>
              <div className="card p-0 overflow-hidden divide-y divide-border">
                {recentReports.map((r) => (
                  <ReportRow key={r.id} report={r} />
                ))}
              </div>
            </Section>
          )}

          <Section title="Categories" icon={FileBarChart}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {reportCategories.map((c) => {
                const Icon = c.icon;
                const count = reportCatalog.filter((r) => r.category === c.id).length;
                return (
                  <Link key={c.id} to={`/reports/${c.id}`} className="card hover:shadow-elevated transition-shadow duration-200">
                    <div className="flex items-start justify-between mb-3">
                      <div className="h-10 w-10 rounded-lg bg-info-bg text-info flex items-center justify-center">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-medium text-ink-tertiary">{count} reports</span>
                    </div>
                    <h3 className="font-semibold text-ink-primary">{c.label}</h3>
                    <p className="text-sm text-ink-secondary mt-1">{c.description}</p>
                    <div className="flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400 mt-3">
                      Open Reports <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Star; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-ink-primary flex items-center gap-1.5">
        <Icon className="h-4 w-4 text-ink-tertiary" />
        {title}
      </h2>
      {children}
    </div>
  );
}

function ReportRow({ report }: { report: ReportDefinition }) {
  return (
    <Link to={reportHref(report)} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-tertiary transition-colors">
      <div className="min-w-0">
        <p className="font-medium text-ink-primary truncate">{report.name}</p>
        <p className="text-xs text-ink-tertiary truncate">{report.description}</p>
      </div>
      <span className="text-xs font-medium text-ink-tertiary uppercase tracking-wide shrink-0">{report.category.replace('-', ' ')}</span>
    </Link>
  );
}
