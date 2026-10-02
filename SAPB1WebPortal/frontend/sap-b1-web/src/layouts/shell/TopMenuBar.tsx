import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useClickOutside } from '../../hooks/useClickOutside';
import { shellModules } from './catalog';
import { useShell } from './ShellContext';

interface MenuItem {
  label: string;
  shortcut?: string;
  onClick?: () => void;
  /** No onClick = disabled with a "Soon" tag; nothing is faked. */
  separator?: boolean;
}

interface Menu {
  label: string;
  items: MenuItem[];
}

/** Runs a native edit command against whatever field currently has focus. */
function edit(cmd: 'undo' | 'redo' | 'cut' | 'copy' | 'selectAll') {
  document.execCommand(cmd);
}

export default function TopMenuBar() {
  const navigate = useNavigate();
  const { can, logout } = useAuth();
  const shell = useShell();
  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null!);
  useClickOutside(ref, () => setOpen(null), open !== null);

  const menus = useMemo<Menu[]>(() => {
    const canCreatePr = can('Purchase.Create');
    return [
      {
        label: 'File',
        items: [
          canCreatePr
            ? { label: 'New Purchase Request', onClick: () => navigate('/purchase/requests/new') }
            : { label: 'New' },
          { label: 'Open…', onClick: () => shell.setSearchOpen(true) },
          { label: 'Save' },
          { label: 'Save As' },
          { label: 'Close', onClick: () => navigate(-1) },
          { separator: true, label: '' },
          { label: 'Print', onClick: () => window.print() },
          { label: 'Export' },
          { separator: true, label: '' },
          { label: 'Exit (Sign out)', onClick: () => void logout() }
        ]
      },
      {
        label: 'Edit',
        items: [
          { label: 'Undo', shortcut: 'Ctrl+Z', onClick: () => edit('undo') },
          { label: 'Redo', shortcut: 'Ctrl+Y', onClick: () => edit('redo') },
          { separator: true, label: '' },
          { label: 'Cut', shortcut: 'Ctrl+X', onClick: () => edit('cut') },
          { label: 'Copy', shortcut: 'Ctrl+C', onClick: () => edit('copy') },
          {
            label: 'Paste',
            shortcut: 'Ctrl+V',
            onClick: () => {
              navigator.clipboard
                ?.readText()
                .then((t) => document.execCommand('insertText', false, t))
                .catch(() => undefined);
            }
          },
          { label: 'Select All', shortcut: 'Ctrl+A', onClick: () => edit('selectAll') },
          { separator: true, label: '' },
          { label: 'Find', shortcut: 'Ctrl+F', onClick: () => shell.setSearchOpen(true) }
        ]
      },
      {
        label: 'View',
        items: [
          { label: 'Dashboard', shortcut: 'Alt+H', onClick: () => navigate('/') },
          { label: 'Navigation', onClick: () => shell.setSidebarOpen(true) },
          { label: 'Favorites', onClick: () => shell.setPanel('favorites') },
          { label: 'Recent Documents', onClick: () => shell.setPanel('recent') },
          { separator: true, label: '' },
          { label: shell.fullscreen ? 'Exit Full Screen' : 'Full Screen', onClick: shell.toggleFullscreen },
          { label: 'Refresh', onClick: () => window.location.reload() }
        ]
      },
      {
        label: 'Modules',
        items: [
          ...shellModules
            .filter((m) => !m.requiredPermission || can(m.requiredPermission))
            .map((m) => ({ label: m.label, onClick: () => navigate(m.to) })),
          { separator: true, label: '' },
          { label: 'All Modules…', shortcut: 'Alt+M', onClick: () => shell.setModulesOpen(true) }
        ]
      },
      {
        label: 'Tools',
        items: [
          { label: 'Global Search', shortcut: 'Ctrl+K', onClick: () => shell.setSearchOpen(true) },
          { label: 'Approval Requests' },
          { label: 'Messages' },
          { label: 'Notifications', onClick: () => shell.setPanel('notifications') },
          { label: 'Tasks' },
          { label: 'Alerts', onClick: () => shell.setPanel('notifications') },
          { separator: true, label: '' },
          { label: 'Settings' }
        ]
      },
      {
        label: 'Window',
        items: [
          { label: 'Tile' },
          { label: 'Cascade' },
          { label: 'Close All', onClick: () => navigate('/') },
          { separator: true, label: '' },
          { label: 'Recently Opened', onClick: () => shell.setPanel('recent') }
        ]
      },
      {
        label: 'Help',
        items: [
          { label: 'Documentation' },
          { label: 'Keyboard Shortcuts', onClick: () => shell.openDialog('shortcuts') },
          { separator: true, label: '' },
          { label: 'About', onClick: () => shell.openDialog('about') }
        ]
      }
    ];
  }, [can, logout, navigate, shell]);

  return (
    <div ref={ref} className="hidden lg:flex items-center" role="menubar" aria-label="Application menu">
      {menus.map((menu, i) => (
        <div key={menu.label} className="relative">
          <button
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
            onMouseEnter={() => open !== null && setOpen(i)}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(null)}
            className={`px-2.5 h-8 text-[13px] rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
              open === i ? 'bg-white/15 text-white' : 'text-white/85 hover:bg-white/10'
            }`}
          >
            {menu.label}
          </button>
          {open === i && (
            <div role="menu" className="absolute left-0 top-full mt-0.5 min-w-[220px] bg-surface text-ink-primary border border-border rounded-md shadow-popover py-1 z-50 animate-fade-in">
              {menu.items.map((item, j) =>
                item.separator ? (
                  <div key={j} className="my-1 border-t border-border" />
                ) : (
                  <button
                    key={j}
                    role="menuitem"
                    disabled={!item.onClick}
                    onClick={() => {
                      setOpen(null);
                      item.onClick?.();
                    }}
                    className="w-full flex items-center justify-between gap-6 px-3 py-1.5 text-[13px] text-left hover:bg-surface-tertiary disabled:opacity-45 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                  >
                    <span>{item.label}</span>
                    {item.onClick ? (
                      item.shortcut && <span className="text-[11px] text-ink-tertiary">{item.shortcut}</span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wide text-ink-tertiary">Soon</span>
                    )}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
