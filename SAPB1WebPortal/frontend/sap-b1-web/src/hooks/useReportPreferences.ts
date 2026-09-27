import { useCallback, useEffect, useState } from 'react';

const FAVORITES_KEY = 'sapb1_report_favorites';
const RECENTS_KEY = 'sapb1_report_recents';
const MAX_RECENTS = 8;

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeList(key: string, value: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing / storage disabled — favorites/recents just won't persist.
  }
}

/** Report favorites and recently-viewed reports live only in this browser's
 * localStorage — the brief explicitly says not to modify authentication/the
 * user model to support this, so nothing here touches the server. */
export function useReportPreferences() {
  const [favorites, setFavorites] = useState<string[]>(() => readList(FAVORITES_KEY));
  const [recents, setRecents] = useState<string[]>(() => readList(RECENTS_KEY));

  useEffect(() => writeList(FAVORITES_KEY, favorites), [favorites]);
  useEffect(() => writeList(RECENTS_KEY, recents), [recents]);

  const toggleFavorite = useCallback((reportId: string) => {
    setFavorites((prev) => (prev.includes(reportId) ? prev.filter((id) => id !== reportId) : [...prev, reportId]));
  }, []);

  const isFavorite = useCallback((reportId: string) => favorites.includes(reportId), [favorites]);

  const recordRecent = useCallback((reportId: string) => {
    setRecents((prev) => [reportId, ...prev.filter((id) => id !== reportId)].slice(0, MAX_RECENTS));
  }, []);

  return { favorites, recents, toggleFavorite, isFavorite, recordRecent };
}
