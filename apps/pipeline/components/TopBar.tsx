"use client";

import type { DateRange } from "@/lib/types";

interface TopBarProps {
  isLoading: boolean;
  isMockData: boolean;
  dateRange: DateRange;
  onDateRangeChange: (r: DateRange) => void;
}

const RANGES: { id: DateRange; label: string }[] = [
  { id: "6m", label: "6 mnd" },
  { id: "12m", label: "12 mnd" },
  { id: "24m", label: "24 mnd" },
];

export function TopBar({
  isLoading,
  isMockData,
  dateRange,
  onDateRangeChange,
}: TopBarProps) {
  return (
    <header
      style={{
        height: "var(--topbar-h)",
        background: "var(--bg-raised)",
        borderBottom: "0.5px solid var(--border)",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: "12px",
        flexShrink: 0,
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginRight: 8,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <rect x="1" y="9" width="4" height="8" rx="1" fill="var(--accent)" />
          <rect
            x="7"
            y="5"
            width="4"
            height="12"
            rx="1"
            fill="var(--accent)"
            opacity="0.7"
          />
          <rect
            x="13"
            y="1"
            width="4"
            height="16"
            rx="1"
            fill="var(--accent)"
            opacity="0.45"
          />
        </svg>
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--accent)",
            letterSpacing: "0.1em",
          }}
        >
          NORTH
        </span>
        <span style={{ fontSize: 11, color: "var(--text-lo)" }}>/</span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 500,
            color: "var(--text-mid)",
            letterSpacing: "0.06em",
          }}
        >
          BOUWCAPACITEITCHECK
        </span>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Mock badge */}
      {isMockData && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 10,
            color: "var(--warn)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "var(--warn)",
              display: "block",
            }}
          />
          voorbeelddata
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            color: "var(--text-mid)",
          }}
        >
          <span
            style={{
              width: 14,
              height: 14,
              border: "1.5px solid var(--border-mid)",
              borderTopColor: "var(--accent)",
              borderRadius: "50%",
              display: "block",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <span style={{ fontFamily: "var(--font-mono)" }}>laden…</span>
        </div>
      )}

      {/* Date range */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          background: "var(--bg-overlay)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--r-md)",
          padding: "2px 3px",
        }}
      >
        {RANGES.map((r) => (
          <button
            key={r.id}
            onClick={() => onDateRangeChange(r.id)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: "var(--r-sm)",
              border: "none",
              cursor: "pointer",
              background: dateRange === r.id ? "var(--accent)" : "transparent",
              color: dateRange === r.id ? "#0a0a0a" : "var(--text-mid)",
              fontWeight: dateRange === r.id ? 600 : 400,
              transition: "all 0.15s",
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* GitHub */}
      <a
        href="https://github.com/thenorthsolution/lumen"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="GitHub"
        style={{
          color: "var(--text-mid)",
          display: "flex",
          padding: 4,
          transition: "color 0.1s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-hi)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-mid)")}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden
        >
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
      </a>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </header>
  );
}
