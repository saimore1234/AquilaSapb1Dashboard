import { useEffect, useMemo, useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { LayoutGrid, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useClickOutside } from '../../hooks/useClickOutside';
import { activeModuleKey, shellModules } from './catalog';
import { useShell } from './ShellContext';

export default function ModuleBar() {
  const { can } = useAuth();
  const { pathname } = useLocation();
  const { modulesOpen, setModulesOpen } = useShell();
  const wrapRef = useRef<HTMLDivElement>(null!);
  useClickOutside(wrapRef, () => setModulesOpen(false), modulesOpen);

  const modules = useMemo(() => shellModules.filter((m) => !m.requiredPermission || can(m.requiredPermission)), [can]);
  const activeKey = activeModuleKey(pathname);

  useEffect(() => setModulesOpen(false), [pathname, setModulesOpen]);
  useEffect(() => {
    if (!modulesOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setModulesOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modulesOpen, setModulesOpen]);

  return (
    <div ref={wrapRef} className="relative hidden md:block bg-surface border-b border-border">
      <nav aria-label="Modules" className="flex items-center h-10 px-2 gap-0.5 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setModulesOpen(!modulesOpen)}
          aria-expanded={modulesOpen}
          aria-haspopup="true"
          className={`shrink-0 flex items-center gap-1.5 px-3 h-8 rounded text-[12px] font-semibold tracking-wide uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
            modulesOpen ? 'bg-brand-600 text-white' : 'text-brand-700 dark:text-brand-300 hover:bg-surface-tertiary'
          }`}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Modules
          <ChevronDown className={`h-3 w-3 transition-transform ${modulesOpen ? 'rotate-180' : ''}`} />
        </button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        {modules.map((m) => {
          const Icon = m.icon;
          const active = activeKey === m.key;
          return (
            <NavLink
              key={m.key}
              to={m.to}
              className={`shrink-0 relative flex items-center gap-1.5 px-3 h-10 text-[13px] transition-colors focus-visible:outline-none focus-visible:bg-surface-tertiary ${
                active ? 'text-brand-700 dark:text-brand-300 font-medium' : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-secondary'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="h-3.5 w-3.5" />
              {m.label}
              {active && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-brand-600 dark:bg-brand-400 rounded-t" />}
            </NavLink>
          );
        })}
      </nav>

      {modulesOpen && (
        <div
          role="dialog"
          aria-label="All modules"
          className="absolute left-0 right-0 top-full z-40 bg-surface border-b border-border shadow-popover animate-fade-in max-h-[70vh] overflow-y-auto"
        >
          <div className="grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 max-w-[1600px]">
            {modules.map((m) => {
              const Icon = m.icon;
              return (
                <section key={m.key}>
                  <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-ink-tertiary mb-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    {m.sections[0].title}
                  </h3>
                  <ul>
                    {m.sections[0].links
                      .filter((l) => !l.requiredPermission || can(l.requiredPermission))
                      .map((l) => (
                        <li key={l.label}>
                          {l.to ? (
                            <Link to={l.to} className="block px-2 py-1.5 -mx-2 rounded text-[13px] text-ink-primary hover:bg-surface-tertiary hover:text-brand-700 dark:hover:text-brand-300">
                              {l.label}
                            </Link>
                          ) : (
                            <span className="flex items-center justify-between px-2 py-1.5 -mx-2 text-[13px] text-ink-tertiary cursor-not-allowed" aria-disabled="true">
                              {l.label}
                              <span className="text-[10px] uppercase tracking-wide">Soon</span>
                            </span>
                          )}
                        </li>
                      ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
