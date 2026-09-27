import { useState } from 'react';

export interface TabItem {
  key: string;
  label: string;
  content: React.ReactNode;
}

export default function Tabs({ tabs, defaultKey }: { tabs: TabItem[]; defaultKey?: string }) {
  const [active, setActive] = useState(defaultKey ?? tabs[0]?.key);
  const activeTab = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div>
      <div role="tablist" className="flex gap-1 border-b border-border overflow-x-auto no-scrollbar">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={tab.key === active}
            onClick={() => setActive(tab.key)}
            className={`relative px-3.5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-t-md ${
              tab.key === active ? 'text-brand-600 dark:text-brand-300' : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            {tab.label}
            {tab.key === active && (
              <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-brand-600 dark:bg-brand-400 rounded-full" />
            )}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="pt-5 animate-fade-in">
        {activeTab?.content}
      </div>
    </div>
  );
}
