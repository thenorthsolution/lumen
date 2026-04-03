"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchPipelineData } from "@/lib/pipeline-data";
import type { PipelineData, ProvinceMetrics, DateRange } from "@/lib/types";
import { TopBar } from "./TopBar";
import { NavTabs, type Tab } from "./NavTabs";
import { ChoroplethMap } from "./ChoroplethMap";
import { TimelineView } from "./TimelineView";
import { RegionTable } from "./RegionTable";
import { MethodologyView } from "./MethodologyView";
import { StatBar } from "./StatBar";

export function AppShell() {
  const [tab, setTab] = useState<Tab>("kaart");
  const [data, setData] = useState<PipelineData | null>(null);
  const [selected, setSelected] = useState<ProvinceMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>("12m");

  const load = useCallback(async (range: DateRange) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchPipelineData(range);
      setData(result);
    } catch (e) {
      setError("Data ophalen mislukt.");
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(dateRange);
  }, [load, dateRange]);

  function handleDateRange(r: DateRange) {
    setDateRange(r);
    setSelected(null);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        width: "100%",
        overflow: "hidden",
      }}
    >
      <TopBar
        isLoading={isLoading}
        isMockData={data?.isMockData ?? false}
        dateRange={dateRange}
        onDateRangeChange={handleDateRange}
      />

      <NavTabs active={tab} onChange={setTab} />

      {/* Main content */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {error && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              zIndex: 50,
              background: "var(--bg)",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--text-mid)" }}>
              {error}
            </span>
            <button
              onClick={() => load(dateRange)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                padding: "6px 14px",
                border: "0.5px solid var(--border-mid)",
                borderRadius: "var(--r-md)",
                color: "var(--accent)",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              Opnieuw proberen
            </button>
          </div>
        )}

        {/* Map tab gets its own flex layout with sidebar */}
        {tab === "kaart" && (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              overflow: "hidden",
            }}
          >
            {/* Sidebar */}
            <SidePanel
              data={data}
              selected={selected}
              onSelectProvince={setSelected}
            />
            {/* Map */}
            <ChoroplethMap
              data={data}
              selected={selected}
              onSelect={setSelected}
              isLoading={isLoading}
            />
          </div>
        )}

        {tab === "tijdlijn" && (
          <TimelineView data={data} isLoading={isLoading} />
        )}
        {tab === "tabel" && <RegionTable data={data} isLoading={isLoading} />}
        {tab === "methodologie" && <MethodologyView />}
      </div>

      <StatBar data={data} />
    </div>
  );
}

// ─── Side panel (map tab only) ────────────────────────────────────────────

function SidePanel({
  data,
  selected,
  onSelectProvince,
}: {
  data: PipelineData | null;
  selected: ProvinceMetrics | null;
  onSelectProvince: (p: ProvinceMetrics | null) => void;
}) {
  return (
    <aside
      style={{
        width: "var(--sidebar-w)",
        flexShrink: 0,
        background: "var(--bg-raised)",
        borderRight: "0.5px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        zIndex: 10,
      }}
    >
      {/* Region list */}
      <div
        style={{ padding: "14px 0", borderBottom: "0.5px solid var(--border)" }}
      >
        <div
          style={{
            padding: "0 14px 8px",
            fontSize: 9,
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            color: "var(--text-lo)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Provincies
        </div>
        {(data?.byProvince ?? []).map((p) => (
          <ProvinceRow
            key={p.province}
            province={p}
            isSelected={selected?.province === p.province}
            onClick={() =>
              onSelectProvince(selected?.province === p.province ? null : p)
            }
          />
        ))}
        {!data &&
          Array.from({ length: 12 }).map((_, i) => <SkeletonRow key={i} />)}
      </div>

      {/* Bottleneck summary */}
      {data && (
        <div
          style={{ padding: "14px", borderBottom: "0.5px solid var(--border)" }}
        >
          <div
            style={{
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              color: "var(--text-lo)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Signalen
          </div>
          <SignalRow
            label="Knelpunten"
            count={
              data.byProvince.filter((p) => p.bottleneckSignal === "alert")
                .length
            }
            color="var(--alert)"
          />
          <SignalRow
            label="Aandachtspunten"
            count={
              data.byProvince.filter((p) => p.bottleneckSignal === "warn")
                .length
            }
            color="var(--warn)"
          />
          <SignalRow
            label="Groeiend"
            count={data.byProvince.filter((p) => p.trend === "growing").length}
            color="var(--ok)"
          />
        </div>
      )}

      {/* Methodology note */}
      <div
        style={{
          marginTop: "auto",
          padding: "12px 14px",
          borderTop: "0.5px solid var(--border)",
        }}
      >
        <p
          style={{
            fontSize: 10,
            color: "var(--text-mid)",
            lineHeight: 1.6,
            marginBottom: 8,
          }}
        >
          Alleen publiek aanbestede projecten boven EU-drempel. Particuliere
          bouw niet weergegeven.
        </p>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
          }}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--accent)",
            textDecoration: "none",
          }}
        >
          Lees methodologie →
        </a>
      </div>
    </aside>
  );
}

function ProvinceRow({
  province: p,
  isSelected,
  onClick,
}: {
  province: ProvinceMetrics;
  isSelected: boolean;
  onClick: () => void;
}) {
  const sigColor = {
    ok: "var(--ok)",
    warn: "var(--warn)",
    alert: "var(--alert)",
  }[p.bottleneckSignal];

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 14px",
        background: isSelected ? "rgba(232,184,75,0.08)" : "transparent",
        border: "none",
        borderLeft: isSelected
          ? "2px solid var(--accent)"
          : "2px solid transparent",
        cursor: "pointer",
        transition: "all 0.1s",
        textAlign: "left",
      }}
      onMouseEnter={(e) => {
        if (!isSelected)
          (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        if (!isSelected)
          (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: sigColor,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          flex: 1,
          fontSize: 11,
          color: "var(--text-hi)",
          fontWeight: isSelected ? 500 : 400,
        }}
      >
        {p.province}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--accent)",
          fontWeight: 500,
        }}
      >
        {p.activeTenderCount}
      </span>
    </button>
  );
}

function SignalRow({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 6,
      }}
    >
      <span style={{ fontSize: 11, color: "var(--text-mid)" }}>{label}</span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 500,
          color: count > 0 ? color : "var(--text-lo)",
        }}
      >
        {count}
      </span>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 14px",
      }}
    >
      <div
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: "var(--border)",
          flexShrink: 0,
        }}
      />
      <div
        style={{
          flex: 1,
          height: 10,
          borderRadius: 3,
          background: "var(--border)",
          animation: "pulse 1.5s ease-in-out infinite",
        }}
      />
      <div
        style={{
          width: 16,
          height: 10,
          borderRadius: 3,
          background: "var(--border)",
          animation: "pulse 1.5s ease-in-out infinite",
        }}
      />
      <style>{`@keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.8} }`}</style>
    </div>
  );
}
