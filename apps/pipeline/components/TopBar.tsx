"use client";

import type { ActiveTab } from "./AppShell";

interface TopBarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  isLoading: boolean;
  isMockData: boolean;
}

const TABS: { id: ActiveTab; label: string }[] = [
  { id: "kaart",        label: "kaart" },
  { id: "tijdlijn",     label: "tijdlijn" },
  { id: "tabel",        label: "tabel" },
  { id: "methodologie", label: "methodologie" },
];

export function TopBar({ activeTab, onTabChange, isLoading, isMockData }: TopBarProps) {
  return (
    <header className="h-[44px] bg-[var(--color-surface-raised)] border-b border-[var(--color-border-subtle)] flex items-center px-4 gap-3 shrink-0 z-[100]">
      {/* Logo */}
      <div className="flex items-center gap-1.5 mr-2">
        <span className="text-[11px] font-semibold text-[var(--color-accent)] tracking-widest">NORTH</span>
        <span className="text-[11px] text-[var(--color-border-default)]">/</span>
        <span className="text-[11px] font-medium text-[var(--color-text-secondary)] tracking-[0.08em]">LUMEN PIPELINE</span>
      </div>

      {/* Nav tabs */}
      <nav className="flex items-center gap-0.5">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={[
              "px-2.5 py-1 text-[11px] font-mono border-none rounded-[var(--radius-sm)] cursor-pointer transition-colors tracking-[0.04em]",
              activeTab === tab.id
                ? "text-[var(--color-text-primary)] bg-[var(--color-surface-overlay)]"
                : "text-[var(--color-text-secondary)] bg-transparent hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-overlay)]",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Mock data badge */}
      {isMockData && (
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-signal-warn)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-signal-warn)]" />
          voorbeelddata
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
          <span>laden...</span>
        </div>
      )}

      {/* Period label */}
      <div className="flex flex-col gap-px text-right">
        <span className="text-[11px] text-[var(--color-text-secondary)] leading-none">afgelopen 12 maanden</span>
        <span className="text-[9px] text-[var(--color-text-muted)] tracking-[0.08em] uppercase leading-none">periode</span>
      </div>

      {/* GitHub */}
      <a
        href="https://github.com/thenorthsolution/lumen"
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--color-text-secondary)] flex items-center p-1 transition-colors hover:text-[var(--color-text-primary)]"
        aria-label="GitHub"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
      </a>
    </header>
  );
}
