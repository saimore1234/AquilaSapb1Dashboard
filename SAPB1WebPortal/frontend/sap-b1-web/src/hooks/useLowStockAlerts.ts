import { useEffect, useState } from 'react';
import { getDashboardSummary } from '../api/dashboard';
import type { LowStockItem } from '../types';

/**
 * Real, API-backed alerts — sourced entirely from GET /api/dashboard's
 * lowStockItems (already computed server-side from actual SAP B1 stock
 * levels). Deliberately does NOT fabricate invoice/PO/SO notifications —
 * those need document APIs this backend doesn't expose yet.
 */
export function useLowStockAlerts() {
  const [items, setItems] = useState<LowStockItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getDashboardSummary()
      .then((data) => {
        if (!cancelled) setItems(data.lowStockItems);
      })
      .catch(() => {
        // Silent — the bell just shows nothing rather than blocking the shell.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { items, count: items.length, loading };
}
