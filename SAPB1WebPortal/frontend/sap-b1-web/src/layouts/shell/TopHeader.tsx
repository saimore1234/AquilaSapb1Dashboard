import { useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Menu,
  Search,
  Bell,
  Star,
  Clock,
  Home,
  Building2,
  ChevronDown,
  LogOut,
  PackageX,
  Sun,
  Moon,
  Monitor,
  Keyboard,
  Info,
  RefreshCw,
  type LucideIcon
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme, type ThemePreference } from '../../context/ThemeContext';
import { useLowStockAlerts } from '../../hooks/useLowStockAlerts';
import { useClickOutside } from '../../hooks/useClickOutside';
import Avatar from '../../components/ui/Avatar';
import TopMenuBar from './TopMenuBar';
import { useShell, type Panel } from './ShellContext';

const popover = 'absolute right-0 top-full mt-1.5 bg-surface text-ink-primary border border-border rounded-lg shadow-popover overflow-hidden animate-slide-up z-50';
const iconBtn =
  'relative h-8 w-8 flex items-center justify-center rounded text-white/85 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400';

/** Wraps a header button + popover; opening is driven by shell.panel so menu items can open it too. */
function PanelWrap({ id, children }: { id: Exclude<Panel, null>; children: React.ReactNode }) {
  const { panel, setPanel } = useShell();
  const ref = useRef<HTMLDivElement>(null!);
  useClickOutside(ref, () => setPanel(null), panel === id);
  return (
    <div ref={ref} className="relative">
      {children}
    </div>
  );
}

export default function TopHeader() {
  const { user, logout } = useAuth();
  const { preference, setPreference } = useTheme();
  const shell = useShell();
  const { pathname } = useLocation();
  const { items: lowStock, count: lowStockCount } = useLowStockAlerts();
  const { panel, setPanel } = shell;
  const toggle = (p: Exclude<Panel, null>) => setPanel(panel === p ? null : p);
  const fav = shell.isFavorite(pathname);

  const themeOpts: Array<[ThemePreference, string, LucideIcon]> = [
    ['light', 'Light', Sun],
    ['dark', 'Dark', Moon],
    ['system', 'System', Monitor]
  ];

  return (
    <header className="h-12 bg-brand-950 text-white flex items-center gap-2 px-2 sm:px-3 shrink-0 relative z-30">
      <button className={`${iconBtn} lg:hidden`} onClick={() => shell.setSidebarOpen(true)} aria-label="Open navigation">
        <Menu className="h-5 w-5" />
      </button>

      <Link to="/" className="flex items-center gap-2 pr-2 shrink-0" aria-label="SAP B1 Business Hub — Home">
        <svg viewBox="0 0 40 40" className="h-7 w-7" aria-hidden="true">
          <rect width="40" height="40" rx="9" fill="rgba(255,255,255,0.14)" />
          <g stroke="white" strokeWidth="1.8" strokeLinecap="round" opacity="0.85">
            <path d="M20 20 L11 12 M20 20 L30 13 M20 20 L20 31" />
          </g>
          <circle cx="11" cy="12" r="2.6" fill="white" opacity="0.8" />
          <circle cx="30" cy="13" r="2.6" fill="white" opacity="0.8" />
          <circle cx="20" cy="31" r="2.6" fill="white" opacity="0.8" />
          <circle cx="20" cy="20" r="4.6" fill="white" />
        </svg>
        <span className="hidden sm:block text-[14px] font-semibold tracking-tight whitespace-nowrap">SAP B1 Business Hub</span>
      </Link>

      <TopMenuBar />

      <div className="flex-1" />

      <button
        onClick={() => shell.setSearchOpen(true)}
        className="hidden md:flex items-center gap-2 w-full max-w-xs h-8 text-[13px] text-white/60 bg-white/10 hover:bg-white/15 border border-white/10 rounded px-2.5 transition-colors"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left truncate">Search SAP Business One…</span>
        <kbd className="text-[10px] border border-white/20 rounded px-1">Ctrl K</kbd>
      </button>
      <button className={`${iconBtn} md:hidden`} onClick={() => shell.setSearchOpen(true)} aria-label="Search">
        <Search className="h-[18px] w-[18px]" />
      </button>

      {/* Company */}
      <PanelWrap id="company">
        <button
          onClick={() => toggle('company')}
          aria-haspopup="true"
          aria-expanded={panel === 'company'}
          className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded bg-white/10 hover:bg-white/15 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${shell.connected === false ? 'bg-red-400' : 'bg-green-400'}`} />
          <span className="text-white/60">Company:</span>
          <span className="font-medium max-w-[160px] truncate">{user?.companyName || user?.company}</span>
          <ChevronDown className="h-3 w-3 text-white/60" />
        </button>
        {panel === 'company' && (
          <div className={`${popover} w-72`}>
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-ink-tertiary mb-1">
                <Building2 className="h-3.5 w-3.5" /> Current company
              </div>
              <p className="text-sm font-semibold">{user?.companyName || user?.company}</p>
              <p className="text-xs text-ink-tertiary mt-0.5">Database: {user?.company}</p>
              <p className="text-xs mt-1.5 flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${shell.connected === false ? 'bg-danger' : 'bg-success'}`} />
                {shell.connected === null ? 'Checking…' : shell.connected ? 'Connected' : 'Disconnected'}
              </p>
            </div>
            <button
              onClick={() => void logout()}
              className="w-full flex items-start gap-2.5 px-4 py-3 text-left text-sm hover:bg-surface-tertiary"
            >
              <RefreshCw className="h-4 w-4 mt-0.5 text-ink-secondary" />
              <span>
                Switch company
                <span className="block text-xs text-ink-tertiary">Signs you out so you can pick another company securely.</span>
              </span>
            </button>
          </div>
        )}
      </PanelWrap>

      <Link to="/" className={`${iconBtn} hidden sm:flex`} aria-label="Home" title="Home">
        <Home className="h-[18px] w-[18px]" />
      </Link>

      {/* Favorites */}
      <PanelWrap id="favorites">
        <button onClick={() => toggle('favorites')} className={iconBtn} aria-label="Favorites" title="Favorites" aria-expanded={panel === 'favorites'}>
          <Star className="h-[18px] w-[18px]" />
        </button>
        {panel === 'favorites' && (
          <div className={`${popover} w-72`}>
            <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
              <p className="text-sm font-semibold">Favorites</p>
              <button
                onClick={() => shell.toggleFavorite(pathname)}
                className="text-xs text-brand-700 dark:text-brand-300 hover:underline"
              >
                {fav ? 'Remove this page' : 'Add this page'}
              </button>
            </div>
            <ShellList entries={shell.favorites} empty="No favorites yet. Use “Add this page”." onPick={() => setPanel(null)} />
          </div>
        )}
      </PanelWrap>

      {/* Recent */}
      <PanelWrap id="recent">
        <button onClick={() => toggle('recent')} className={iconBtn} aria-label="Recent documents" title="Recent documents" aria-expanded={panel === 'recent'}>
          <Clock className="h-[18px] w-[18px]" />
        </button>
        {panel === 'recent' && (
          <div className={`${popover} w-72`}>
            <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
              <p className="text-sm font-semibold">Recent documents</p>
              {shell.recent.length > 0 && (
                <button onClick={shell.clearRecent} className="text-xs text-brand-700 dark:text-brand-300 hover:underline">
                  Clear
                </button>
              )}
            </div>
            <ShellList entries={shell.recent} empty="No documents opened yet." onPick={() => setPanel(null)} />
          </div>
        )}
      </PanelWrap>

      {/* Notifications — real low-stock alerts only; other categories need backend sources */}
      <PanelWrap id="notifications">
        <button onClick={() => toggle('notifications')} className={iconBtn} aria-label={`Notifications${lowStockCount ? `, ${lowStockCount} unread` : ''}`} aria-expanded={panel === 'notifications'}>
          <Bell className="h-[18px] w-[18px]" />
          {lowStockCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[10px] font-semibold flex items-center justify-center">
              {lowStockCount > 99 ? '99+' : lowStockCount}
            </span>
          )}
        </button>
        {panel === 'notifications' && (
          <div className={`${popover} w-80 max-w-[calc(100vw-1rem)]`}>
            <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
              <p className="text-sm font-semibold">Notifications</p>
              {lowStockCount > 0 && <span className="badge-warning">{lowStockCount} low stock</span>}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {lowStock.length === 0 ? (
                <p className="px-4 py-6 text-sm text-ink-tertiary text-center">You're all caught up.</p>
              ) : (
                lowStock.map((item) => (
                  <Link
                    key={item.itemCode}
                    to={`/items/${item.itemCode}`}
                    onClick={() => setPanel(null)}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-surface-tertiary border-b border-border last:border-0"
                  >
                    <div className="h-8 w-8 rounded-lg bg-warning-bg text-warning flex items-center justify-center shrink-0">
                      <PackageX className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.itemName}</p>
                      <p className="text-xs text-ink-tertiary">
                        {item.itemCode} · {item.available} available, below minimum
                      </p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        )}
      </PanelWrap>

      {/* User */}
      <PanelWrap id="user">
        <button
          onClick={() => toggle('user')}
          aria-haspopup="true"
          aria-expanded={panel === 'user'}
          className="flex items-center gap-1.5 h-8 pl-1 pr-1.5 rounded hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <Avatar name={user?.username || '?'} size="sm" />
          <span className="hidden md:block text-[13px]">{user?.username}</span>
          <ChevronDown className="hidden md:block h-3 w-3 text-white/60" />
        </button>
        {panel === 'user' && (
          <div className={`${popover} w-64`}>
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold truncate">{user?.username}</p>
              <p className="text-xs text-ink-tertiary">Role: {user?.role}</p>
              <p className="text-xs text-ink-tertiary truncate">{user?.companyName || user?.company}</p>
            </div>
            <div className="px-4 py-2.5 border-b border-border">
              <p className="text-[11px] uppercase tracking-wide text-ink-tertiary mb-1.5">Appearance</p>
              <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Appearance">
                {themeOpts.map(([val, label, Icon]) => (
                  <button
                    key={val}
                    role="radio"
                    aria-checked={preference === val}
                    onClick={() => setPreference(val)}
                    className={`flex flex-col items-center gap-1 py-1.5 rounded border text-xs ${
                      preference === val ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-200' : 'border-border text-ink-secondary hover:bg-surface-tertiary'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <MenuBtn icon={Keyboard} label="Keyboard Shortcuts" onClick={() => { setPanel(null); shell.openDialog('shortcuts'); }} />
            <MenuBtn icon={Info} label="System Information" onClick={() => { setPanel(null); shell.openDialog('about'); }} />
            <div className="border-t border-border" />
            <button onClick={() => void logout()} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-danger hover:bg-danger-bg">
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        )}
      </PanelWrap>
    </header>
  );
}

function MenuBtn({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-ink-secondary hover:bg-surface-tertiary hover:text-ink-primary">
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function ShellList({ entries, empty, onPick }: { entries: Array<{ to: string; title: string }>; empty: string; onPick: () => void }) {
  if (entries.length === 0) return <p className="px-4 py-6 text-sm text-ink-tertiary text-center">{empty}</p>;
  return (
    <ul className="max-h-80 overflow-y-auto py-1">
      {entries.map((e) => (
        <li key={e.to}>
          <Link to={e.to} onClick={onPick} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-surface-tertiary">
            <span className="truncate">{e.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
