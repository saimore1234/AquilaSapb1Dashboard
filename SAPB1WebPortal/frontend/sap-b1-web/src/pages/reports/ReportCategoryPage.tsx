import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Star, AlertCircle } from 'lucide-react';
import SearchBar from '../../components/SearchBar';
import { EmptyState } from '../../components/StateViews';
import { reportCategories, getReportsByCategory, type ReportCategoryId, type ReportDefinition } from '../../data/reportCatalog';
import { useReportPreferences } from '../../hooks/useReportPreferences';

function reportHref(r: ReportDefinition) {
  return r.kind === 'link' ? r.route! : `/reports/${r.category}/${r.id}`;
}

export default function ReportCategoryPage() {
  const { categoryId = '' } = useParams();
  const category = reportCategories.find((c) => c.id === (categoryId as ReportCategoryId));
  const [search, setSearch] = useState('');
  const { isFavorite, toggleFavorite } = useReportPreferences();

  if (!category) {
    return (
      <div className="card">
        <EmptyState message="Unknown report category." />
      </div>
    );
  }

  const Icon = category.icon;
  const reports = getReportsByCategory(category.id).filter(
    (r) => !search.trim() || r.name.toLowerCase().includes(search.toLowerCase()) || r.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <Link to="/reports" className="inline-flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
        <ArrowLeft className="h-4 w-4" />
        All Reports
      </Link>

      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-info-bg text-info flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">{category.label} Reports</h1>
          <p className="text-sm text-ink-secondary">{category.description}</p>
        </div>
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder={`Search ${category.label.toLowerCase()} reports…`} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {reports.map((r) => (
          <Link
            key={r.id}
            to={reportHref(r)}
            className="card flex items-start justify-between gap-3 hover:shadow-elevated transition-shadow duration-200"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-medium text-ink-primary truncate">{r.name}</p>
                {r.kind === 'unavailable' && <AlertCircle className="h-3.5 w-3.5 text-ink-tertiary shrink-0" />}
              </div>
              <p className="text-sm text-ink-secondary mt-0.5">{r.description}</p>
            </div>
            <button
              onClick={(e) => {
                e.preventDefault();
                toggleFavorite(r.id);
              }}
              className="shrink-0"
              aria-label="Toggle favorite"
            >
              <Star className={`h-4 w-4 ${isFavorite(r.id) ? 'fill-amber-400 text-amber-400' : 'text-ink-tertiary'}`} />
            </button>
          </Link>
        ))}
        {reports.length === 0 && (
          <div className="col-span-full">
            <EmptyState message="No reports found." description="Try a different search." />
          </div>
        )}
      </div>
    </div>
  );
}
