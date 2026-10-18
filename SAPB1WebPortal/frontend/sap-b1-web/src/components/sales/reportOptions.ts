import { useEffect, useState } from 'react';
import { getReportFilterOptions } from '../../api/sales';
import type { ReportFilterOptions } from '../../types';

const EMPTY: ReportFilterOptions = { units: [], branches: [], customerGroups: [], salespersons: [], warehouses: [], productCategories: [] };

// One shared fetch of the dropdown data (units, branches, salespersons, warehouses, customer groups).
let optionsPromise: Promise<ReportFilterOptions> | null = null;

export function useReportFilterOptions() {
  const [opts, setOpts] = useState<ReportFilterOptions | null>(null);
  useEffect(() => {
    optionsPromise ??= getReportFilterOptions().catch((e) => {
      optionsPromise = null;
      throw e;
    });
    optionsPromise.then(setOpts).catch(() => setOpts(EMPTY));
  }, []);
  return opts;
}
