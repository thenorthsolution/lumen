"use client";

export type Tab = "kaart" | "tijdlijn" | "tabel" | "methodologie";

interface NavTabsProps {
  active: Tab;
  onChange: (t: Tab) => void;
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "kaart", label: "Kaart", icon: "◫" },
  { id: "tijdlijn", label: "Tijdlijn", icon: "⌇" },
  { id: "tabel", label: "Tabel", icon: "≡" },
  { id: "methodologie", label: "Methodologie", icon: "?" },
];

export function NavTabs({ active, onChange }: NavTabsProps) {
  return (
    <nav
      style={{
        height: 38,
        background: "var(--bg-raised)",
        borderBottom: "0.5px solid var(--border)",
        display: "flex",
        alignItems: "stretch",
        padding: "0 12px",
        gap: 2,
        flexShrink: 0,
      }}
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "0 10px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: active === tab.id ? "var(--text-hi)" : "var(--text-mid)",
            borderBottom:
              active === tab.id
                ? "2px solid var(--accent)"
                : "2px solid transparent",
            transition: "color 0.1s, border-color 0.1s",
            letterSpacing: "0.04em",
          }}
          onMouseEnter={(e) => {
            if (active !== tab.id)
              (e.currentTarget as HTMLElement).style.color = "var(--text-hi)";
          }}
          onMouseLeave={(e) => {
            if (active !== tab.id)
              (e.currentTarget as HTMLElement).style.color = "var(--text-mid)";
          }}
        >
          <span style={{ fontSize: 12, opacity: 0.6 }}>{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
