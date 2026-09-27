import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Search, Bell, Sun, Moon, ChevronDown, LogOut, User, Settings, ShieldCheck, PackageX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLowStockAlerts } from '../hooks/useLowStockAlerts';
import { useClickOutside } from '../hooks/useClickOutside';
import Avatar from '../components/ui/Avatar';

export default function Navbar({ onMenuClick, onSearchClick }: { onMenuClick: () => void; onSearchClick: () => void }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { items: lowStockItems, count: lowStockCount } = useLowStockAlerts();

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null!);
  const bellRef = useRef<HTMLDivElement>(null!);
  useClickOutside(userMenuRef, () => setUserMenuOpen(false), userMenuOpen);
  useClickOutside(bellRef, () => setBellOpen(false), bellOpen);

  return (
    <header className="h-16 bg-surface/80 backdrop-blur-sm border-b border-border flex items-center gap-3 px-3 sm:px-5 sticky top-0 z-10">
      <button
        className="lg:hidden text-ink-secondary hover:text-ink-primary p-1.5 -ml-1.5 rounded-lg hover:bg-surface-tertiary"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <button
        onClick={onSearchClick}
        className="hidden sm:flex items-center gap-2 w-full max-w-sm text-sm text-ink-tertiary bg-surface-secondary hover:bg-surface-tertiary border border-border rounded-lg px-3 py-2 transition-colors"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="text-[10px] font-medium border border-border-strong rounded px-1.5 py-0.5">Ctrl K</kbd>
      </button>
      <button
        onClick={onSearchClick}
        className="sm:hidden text-ink-secondary hover:text-ink-primary p-1.5 rounded-lg hover:bg-surface-tertiary"
        aria-label="Search"
      >
        <Search className="h-5 w-5" />
      </button>

      <div className="flex-1" />

      {/* Company indicator */}
      <div className="hidden sm:flex items-center gap-1.5 text-sm bg-surface-secondary border border-border rounded-full pl-2.5 pr-3 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />
        <span className="text-ink-tertiary">Company</span>
        <span className="font-medium text-ink-primary truncate max-w-[140px]">{user?.companyName || user?.company}</span>
      </div>

      {/* Notifications */}
      <div className="relative" ref={bellRef}>
        <button
          onClick={() => setBellOpen((o) => !o)}
          className="relative text-ink-secondary hover:text-ink-primary p-2 rounded-lg hover:bg-surface-tertiary"
          aria-label="Notifications"
        >
          <Bell className="h-[19px] w-[19px]" />
          {lowStockCount > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-danger ring-2 ring-surface" />
          )}
        </button>
        {bellOpen && (
          <div className="absolute right-0 mt-2 w-80 bg-surface border border-border rounded-xl shadow-popover overflow-hidden animate-slide-up">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <p className="text-sm font-semibold text-ink-primary">Notifications</p>
              {lowStockCount > 0 && <span className="badge-warning">{lowStockCount} low stock</span>}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {lowStockItems.length === 0 ? (
                <p className="px-4 py-6 text-sm text-ink-tertiary text-center">You're all caught up.</p>
              ) : (
                lowStockItems.map((item) => (
                  <Link
                    key={item.itemCode}
                    to={`/items/${item.itemCode}`}
                    onClick={() => setBellOpen(false)}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-surface-tertiary transition-colors border-b border-border last:border-0"
                  >
                    <div className="h-8 w-8 rounded-lg bg-warning-bg text-warning flex items-center justify-center shrink-0 mt-0.5">
                      <PackageX className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-ink-primary font-medium truncate">{item.itemName}</p>
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
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="text-ink-secondary hover:text-ink-primary p-2 rounded-lg hover:bg-surface-tertiary"
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Sun className="h-[19px] w-[19px]" /> : <Moon className="h-[19px] w-[19px]" />}
      </button>

      {/* User menu */}
      <div className="relative" ref={userMenuRef}>
        <button
          onClick={() => setUserMenuOpen((o) => !o)}
          className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-surface-tertiary transition-colors"
        >
          <Avatar name={user?.username || '?'} size="sm" />
          <span className="hidden md:block text-sm font-medium text-ink-primary">{user?.username}</span>
          <ChevronDown className="hidden md:block h-3.5 w-3.5 text-ink-tertiary" />
        </button>
        {userMenuOpen && (
          <div className="absolute right-0 mt-2 w-56 bg-surface border border-border rounded-xl shadow-popover overflow-hidden animate-slide-up py-1.5">
            <div className="px-3.5 py-2.5 border-b border-border mb-1">
              <p className="text-sm font-medium text-ink-primary truncate">{user?.username}</p>
              <p className="text-xs text-ink-tertiary truncate">{user?.companyName || user?.company}</p>
            </div>
            <MenuItem icon={User} label="Profile" disabled />
            <MenuItem icon={Settings} label="Preferences" disabled />
            <MenuItem icon={ShieldCheck} label="Security" disabled />
            <div className="my-1 border-t border-border" />
            <button
              onClick={() => logout()}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-danger hover:bg-danger-bg transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function MenuItem({ icon: Icon, label, disabled }: { icon: React.ElementType; label: string; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-sm text-ink-secondary hover:bg-surface-tertiary hover:text-ink-primary transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
    >
      <span className="flex items-center gap-2.5">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      {disabled && <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">Soon</span>}
    </button>
  );
}
