"use client";

import type { PipelineData } from "@/lib/pipeline-data";

interface StatBarProps {
  data: PipelineData | null;
}

export function StatBar({ data }: StatBarProps) {
  const alertCount   = data?.byProvince.filter(p => p.bottleneckSignal === "alert").length  ?? 0;
  const warningCount = data?.byProvince.filter(p => p.bottleneckSignal === "warn").length   ?? 0;
  const growingCount = data?.byProvince.filter(p => p.trend === "growing").length           ?? 0;

  const updatedLabel = data
    ? new Date(data.lastUpdated).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "—";

  return (
    <div className="h-[44px] bg-[var(--color-surface-raised)] border-t border-[var(--color-border-subtle)] flex items-center px-4 shrink-0 z-10">
      <Stat value={data?.totalTenders.toLocaleString("nl-NL") ?? "—"}              label="Totaal tenders"     color="var(--color-accent)" />
      <Divider />
      <Stat value={`€${data?.totalValueMillions.toLocaleString("nl-NL") ?? "—"} M`} label="Geschatte waarde" />
      <Divider />
      <Stat value={String(alertCount)}   label="Knelpunten"        color={alertCount   > 0 ? "var(--color-signal-alert)" : undefined} />
      <Divider />
      <Stat value={String(warningCount)} label="Aandachtspunten"   color={warningCount > 0 ? "var(--color-signal-warn)"  : undefined} />
      <Divider />
      <Stat value={String(growingCount)} label="Groeiende regio's" color={growingCount > 0 ? "var(--color-signal-ok)"   : undefined} />

      <div className="flex-1" />

      <div className="flex flex-col gap-px text-right">
        <span className="text-[11px] text-[var(--color-text-secondary)] leading-none">
          TenderNed · {updatedLabel}
        </span>
        <span className="text-[9px] text-[var(--color-text-muted)] tracking-[0.08em] uppercase leading-none">
          {data?.isMockData ? "voorbeelddata" : "live data"}
        </span>
      </div>
    </div>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div className="flex flex-col gap-px px-4">
      <span className="text-[13px] font-medium leading-none" style={{ color: color ?? "var(--color-text-primary)" }}>
        {value}
      </span>
      <span className="text-[9px] text-[var(--color-text-secondary)] tracking-[0.08em] uppercase leading-none">
        {label}
      </span>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-6 bg-[var(--color-border-subtle)] shrink-0" />;
}
