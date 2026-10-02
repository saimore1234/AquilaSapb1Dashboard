import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import { documentTitle, pageTitle } from './catalog';

export interface ShellEntry {
  to: string;
  title: string;
  at: number;
}

type Dialog = 'shortcuts' | 'about' | null;
export type Panel = 'favorites' | 'recent' | 'notifications' | 'company' | 'user' | null;

interface ShellContextValue {
  favorites: ShellEntry[];
  recent: ShellEntry[];
  isFavorite: (to: string) => boolean;
  toggleFavorite: (to: string) => void;
  clearRecent: () => void;
  dialog: Dialog;
  openDialog: (d: Exclude<Dialog, null>) => void;
  closeDialog: () => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  modulesOpen: boolean;
  setModulesOpen: (open: boolean) => void;
  fullscreen: boolean;
  toggleFullscreen: () => void;
  /** Which header popover is open (so menu items can open them too). */
  panel: Panel;
  setPanel: (p: Panel) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  /** Backend reachability, from a light GET /auth/me heartbeat. null = not yet checked. */
  connected: boolean | null;
  lastRefresh: Date | null;
}

const ShellContext = createContext<ShellContextValue | undefined>(undefined);
const MAX_RECENT = 15;

function load(key: string): ShellEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(key: string, value: ShellEntry[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable — non-fatal, the list just won't persist.
  }
}

/** Per-user AND per-company storage keys, so switching company never leaks one
 *  company's recent documents into another's. Only titles/paths are stored. */
export function ShellProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const scope = `${user?.username ?? ''}@${user?.company ?? ''}`;
  const favKey = `b1_favorites:${scope}`;
  const recentKey = `b1_recent:${scope}`;

  const [favorites, setFavorites] = useState<ShellEntry[]>(() => load(favKey));
  const [recent, setRecent] = useState<ShellEntry[]>(() => load(recentKey));
  const [dialog, setDialog] = useState<Dialog>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      try {
        await apiClient.get('/auth/me');
        if (cancelled) return;
        setConnected(true);
        setLastRefresh(new Date());
      } catch (err: any) {
        // Any HTTP response (even 4xx) proves the server is reachable; only a missing response means disconnected.
        if (!cancelled) setConnected(!!err?.response);
      }
    };
    void ping();
    const id = setInterval(ping, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    setFavorites(load(favKey));
    setRecent(load(recentKey));
  }, [favKey, recentKey]);

  // Track opened documents (detail routes only).
  useEffect(() => {
    const title = documentTitle(location.pathname);
    if (!title) return;
    setRecent((prev) => {
      const next = [{ to: location.pathname, title, at: Date.now() }, ...prev.filter((e) => e.to !== location.pathname)].slice(0, MAX_RECENT);
      save(recentKey, next);
      return next;
    });
  }, [location.pathname, recentKey]);

  const toggleFavorite = useCallback(
    (to: string) => {
      setFavorites((prev) => {
        const next = prev.some((f) => f.to === to)
          ? prev.filter((f) => f.to !== to)
          : [...prev, { to, title: pageTitle(to), at: Date.now() }];
        save(favKey, next);
        return next;
      });
    },
    [favKey]
  );

  const clearRecent = useCallback(() => {
    setRecent([]);
    save(recentKey, []);
  }, [recentKey]);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);

  const value = useMemo<ShellContextValue>(
    () => ({
      favorites,
      recent,
      isFavorite: (to) => favorites.some((f) => f.to === to),
      toggleFavorite,
      clearRecent,
      dialog,
      openDialog: setDialog,
      closeDialog: () => setDialog(null),
      searchOpen,
      setSearchOpen,
      modulesOpen,
      setModulesOpen,
      fullscreen,
      toggleFullscreen,
      panel,
      setPanel,
      sidebarOpen,
      setSidebarOpen,
      connected,
      lastRefresh
    }),
    [favorites, recent, toggleFavorite, clearRecent, dialog, searchOpen, modulesOpen, fullscreen, toggleFullscreen, panel, sidebarOpen, connected, lastRefresh]
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used within a ShellProvider');
  return ctx;
}
