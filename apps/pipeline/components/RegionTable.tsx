"use client";

import { useState } from "react";
import type { PipelineData, ProvinceMetrics } from "@/lib/pipeline-data";

type SortKey = "province" | "activeTenderCount" | "estimatedValue" | "trend" | "bottleneckSignal";
type SortDir = "asc" | "desc";

interface RegionTableProps {
  data: PipelineData | null;
  isLoading: boolean;
}

const SIGNAL_COLORS = {
  ok:    "var(--color-signal-ok)",
  warn:  "var(--color-signal-warn)",
  alert: "var(--color-signal-alert)",
};

const TREND_COLORS = {
  growing:   "var(--color-signal-ok)",
  stable:    "var(--color-text-secondary)",
  shrinking: "var(--color-signal-alert)",
};

export function RegionTable({ data, isLoading }: RegionTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("activeTenderCount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  if (isLoading || !data) {
    return (
      <div className="flex-1 flex items-center justify-center gap-3 text-[13px] text-[var(--color-text-secondary)]">
        <span className="w-5 h-5 border-2 border-[var(--color-border-subtle)] border-t-[var(--color-accent)] rounded-full animate-spin shrink-0" />
        Regiotabel laden...
      </div>
    );
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = [...data.byProvince].sort((a, b) => {
    const av = a[sortKey] as number | string;
    const bv = b[sortKey] as number | string;
    if (typeof av === "string" && typeof bv === "string") {
      return sortDir === "asc" ? av.localeCompare(bv, "nl") : bv.localeCompare(av, "nl");
    }
    return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  const maxTenders = Math.max(...data.byProvince.map(p => p.activeTenderCount), 1);

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--color-surface-base)]">
      <div className="max-w-[1000px] mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-5">
          <h2 className="text-[16px] font-medium text-[var(--color-text-primary)] mb-1">Regio-overzicht</h2>
          <p className="text-[11px] text-[var(--color-text-secondary)]">
            {data.byProvince.length} provincies · {data.totalTenders} tenders
            {data.isMockData && <span className="text-[var(--color-signal-warn)]"> · voorbeelddata</span>}
          </p>
        </div>

        {/* Table */}
        <div className="overflow-x-auto border border-[var(--color-border-subtle)] rounded-[var(--radius-lg)]">
          <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
            <thead>
              <tr>
                <SortHeader label="Provincie"       sortKey="province"          current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Actieve tenders" sortKey="activeTenderCount" current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="Waarde (M€)"     sortKey="estimatedValue"    current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                <SortHeader label="Trend"           sortKey="trend"             current={sortKey} dir={sortDir} onSort={handleSort} align="center" />
                <SortHeader label="Signaal"         sortKey="bottleneckSignal"  current={sortKey} dir={sortDir} onSort={handleSort} align="center" />
                <th className="px-3.5 py-2.5 text-[10px] font-semibold text-[var(--color-text-secondary)] tracking-[0.08em] uppercase bg-[var(--color-surface-raised)] border-b border-[var(--color-border-subtle)] text-left">
                  Pipeline
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => (
                <RegionRow key={p.province} metrics={p} maxTenders={maxTenders} />
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-[10px] text-[var(--color-text-muted)] leading-relaxed">
          Alleen publiek aanbestede projecten. Private sector opdrachten zijn niet weergegeven.{" "}
          <a
            href="https://github.com/thenorthsolution/lumen/blob/main/apps/lumen-pipeline/TOOL.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent)] no-underline hover:underline"
          >
            Zie TOOL.md voor de volledige methodologie.
          </a>
        </p>
      </div>
    </div>
  );
}

function SortHeader({ label, sortKey, current, dir, onSort, align = "left" }: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right" | "center";
}) {
  const isActive = current === sortKey;
  return (
    <th
      className={[
        "px-3.5 py-2.5 text-[10px] font-semibold tracking-[0.08em] uppercase bg-[var(--color-surface-raised)] border-b border-[var(--color-border-subtle)] cursor-pointer select-none whitespace-nowrap transition-colors hover:text-[var(--color-text-primary)]",
        isActive ? "text-[var(--color-accent)]" : "text-[var(--color-text-secondary)]",
      ].join(" ")}
      style={{ textAlign: align }}
      onClick={() => onSort(sortKey)}
      aria-sort={isActive ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}
      {isActive && <span className="text-[10px]">{dir === "asc" ? " ↑" : " ↓"}</span>}
    </th>
  );
}

function RegionRow({ metrics: p, maxTenders }: { metrics: ProvinceMetrics; maxTenders: number }) {
  const barWidth   = Math.round((p.activeTenderCount / maxTenders) * 100);
  const trendLabel = { growing: "groeiend", stable: "stabiel", shrinking: "krimpend" }[p.trend];
  const signalLabel = { ok: "ok", warn: "let op", alert: "knelpunt" }[p.bottleneckSignal];

  return (
    <tr className="border-b border-[var(--color-border-subtle)] last:border-b-0 transition-colors hover:bg-[var(--color-surface-hover)]">
      <td className="px-3.5 py-2.5 text-[12px] text-[var(--color-text-primary)] font-medium">{p.province}</td>
      <td className="px-3.5 py-2.5 text-[12px] text-[var(--color-accent)] font-medium text-right">{p.activeTenderCount}</td>
      <td className="px-3.5 py-2.5 text-[12px] text-[var(--color-text-secondary)] text-right">
        {Math.round(p.estimatedValue / 1_000_000).toLocaleString("nl-NL")}
      </td>
      <td className="px-3.5 py-2.5 text-center">
        <span className="text-[11px]" style={{ color: TREND_COLORS[p.trend] }}>{trendLabel}</span>
      </td>
      <td className="px-3.5 py-2.5 text-center">
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded-lg border border-current inline-block"
          style={{ color: SIGNAL_COLORS[p.bottleneckSignal] }}
        >
          {signalLabel}
        </span>
      </td>
      <td className="px-3.5 py-2.5">
        <div className="h-1 bg-[var(--color-surface-overlay)] rounded-sm overflow-hidden min-w-[80px]">
          <div
            className="h-full bg-[var(--color-accent)] rounded-sm transition-[width] duration-300"
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </td>
    </tr>
  );
}
