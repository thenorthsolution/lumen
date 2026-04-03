"use client";

import type { PipelineData } from "@/lib/types";

interface StatBarProps {
  data: PipelineData | null;
}

export function StatBar({ data }: StatBarProps) {
  const alerts =
    data?.byProvince.filter((p) => p.bottleneckSignal === "alert").length ?? 0;
  const warns =
    data?.byProvince.filter((p) => p.bottleneckSignal === "warn").length ?? 0;
  const growing =
    data?.byProvince.filter((p) => p.trend === "growing").length ?? 0;

  const updated = data
    ? new Date(data.lastUpdated).toLocaleDateString("nl-NL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

  return (
    <footer
      style={{
        height: "var(--statbar-h)",
        background: "var(--bg-raised)",
        borderTop: "0.5px solid var(--border)",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        flexShrink: 0,
        zIndex: 10,
        gap: 0,
      }}
    >
      <StatItem
        value={data?.totalTenders.toLocaleString("nl-NL") ?? "—"}
        label="Tenders"
        color="var(--accent)"
      />
      <Divider />
      <StatItem
        value={data ? `€${data.totalValueM.toLocaleString("nl-NL")} M` : "—"}
        label="Geraamde waarde"
      />
      <Divider />
      <StatItem
        value={String(alerts)}
        label="Knelpunten"
        color={alerts > 0 ? "var(--alert)" : undefined}
      />
      <Divider />
      <StatItem
        value={String(warns)}
        label="Let op"
        color={warns > 0 ? "var(--warn)" : undefined}
      />
      <Divider />
      <StatItem
        value={String(growing)}
        label="Groeiende regio's"
        color={growing > 0 ? "var(--ok)" : undefined}
      />

      <div style={{ flex: 1 }} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 1,
          textAlign: "right",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-mid)",
          }}
        >
          TenderNed · {updated}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-lo)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {data?.isMockData ? "voorbeelddata" : "live data"}
        </span>
      </div>
    </footer>
  );
}

function StatItem({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color?: string | undefined;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        padding: "0 14px",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1,
          color: color ?? "var(--text-hi)",
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: 9,
          color: "var(--text-mid)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        width: 0.5,
        height: 22,
        background: "var(--border)",
        flexShrink: 0,
      }}
    />
  );
}
