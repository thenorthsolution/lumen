"use client";

import type React from "react";
import { useState, useMemo } from "react";
import type { PipelineData, GemeenteMetrics } from "@/lib/types";

type SortKey = keyof Pick<
  GemeenteMetrics,
  | "gemeente"
  | "province"
  | "activeTenderCount"
  | "estimatedValue"
  | "permitsYTD"
  | "avgPermitDays"
  | "trend"
  | "bottleneckSignal"
>;

interface Props {
  data: PipelineData | null;
  isLoading: boolean;
}

export function RegionTable({ data, isLoading }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("activeTenderCount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<"gemeente" | "provincie">("provincie");

  const rows = useMemo(() => {
    if (!data) return [];

    let items =
      view === "provincie"
        ? data.byProvince.map(
            (p) =>
              ({
                gemeente: p.province,
                province: p.province,
                activeTenderCount: p.activeTenderCount,
                estimatedValue: p.estimatedValue,
                permitsYTD: null as number | null,
                permitsYoYPct: p.permitGrowthPct,
                avgPermitDays: p.avgPermitDays,
                trend: p.trend,
                bottleneckSignal: p.bottleneckSignal,
              }) satisfies GemeenteMetrics,
          )
        : data.byGemeente;

    if (filter.trim()) {
      const q = filter.toLowerCase();
      items = items.filter(
        (r) =>
          r.gemeente.toLowerCase().includes(q) ||
          r.province.toLowerCase().includes(q),
      );
    }

    return [...items].sort((a, b) => {
      const av = a[sortKey] as string | number | null;
      const bv = b[sortKey] as string | number | null;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc"
          ? av.localeCompare(bv, "nl")
          : bv.localeCompare(av, "nl");
      }
      return sortDir === "asc"
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
  }, [data, sortKey, sortDir, filter, view]);

  function handleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  if (isLoading || !data) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          color: "var(--text-mid)",
          fontSize: 13,
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            border: "2px solid var(--border-mid)",
            borderTopColor: "var(--accent)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        Tabel laden…
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const maxCount = Math.max(...rows.map((r) => r.activeTenderCount), 1);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        background: "var(--bg)",
      }}
    >
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 24px" }}>
        {/* Header row */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: 18,
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: "var(--text-hi)",
                marginBottom: 4,
              }}
            >
              Regio-overzicht
            </h1>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-mid)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {rows.length} {view === "provincie" ? "provincies" : "gemeenten"}{" "}
              · {data.totalTenders} tenders
              {data.isMockData && (
                <span style={{ color: "var(--warn)" }}> · voorbeelddata</span>
              )}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* View toggle */}
            <div
              style={{
                display: "flex",
                background: "var(--bg-overlay)",
                border: "0.5px solid var(--border)",
                borderRadius: "var(--r-md)",
                padding: "2px 3px",
                gap: 2,
              }}
            >
              {(["provincie", "gemeente"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    padding: "3px 8px",
                    borderRadius: "var(--r-sm)",
                    border: "none",
                    cursor: "pointer",
                    background: view === v ? "var(--accent)" : "transparent",
                    color: view === v ? "#0a0a0a" : "var(--text-mid)",
                    fontWeight: view === v ? 600 : 400,
                  }}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              type="search"
              placeholder="Zoeken…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                background: "var(--bg-overlay)",
                border: "0.5px solid var(--border)",
                borderRadius: "var(--r-md)",
                padding: "5px 10px",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--text-hi)",
                outline: "none",
                width: 160,
              }}
            />
          </div>
        </div>

        {/* Table */}
        <div
          style={{
            border: "0.5px solid var(--border)",
            borderRadius: "var(--r-lg)",
            overflow: "hidden",
            overflowX: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              tableLayout: "fixed",
            }}
          >
            <thead>
              <tr style={{ background: "var(--bg-raised)" }}>
                <Th
                  label={view === "provincie" ? "Provincie" : "Gemeente"}
                  k="gemeente"
                  current={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                  width={180}
                />
                {view === "gemeente" && (
                  <Th
                    label="Provincie"
                    k="province"
                    current={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                    width={130}
                    align="left"
                  />
                )}
                <Th
                  label="Tenders"
                  k="activeTenderCount"
                  current={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                  align="right"
                  width={80}
                />
                <Th
                  label="Waarde (M€)"
                  k="estimatedValue"
                  current={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                  align="right"
                  width={100}
                />
                <Th
                  label="Verg. doorlooptijd"
                  k="avgPermitDays"
                  current={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                  align="right"
                  width={130}
                />
                <Th
                  label="Trend"
                  k="trend"
                  current={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                  align="center"
                  width={90}
                />
                <Th
                  label="Signaal"
                  k="bottleneckSignal"
                  current={sortKey}
                  dir={sortDir}
                  onSort={handleSort}
                  align="center"
                  width={90}
                />
                <th style={{ ...thBase, width: 110, textAlign: "left" }}>
                  Pipeline
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <TableRow
                  key={`${r.gemeente}-${r.province}`}
                  row={r}
                  maxCount={maxCount}
                  showProvince={view === "gemeente"}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Honest framing note */}
        <div
          style={{
            marginTop: 20,
            padding: "12px 16px",
            background: "var(--bg-raised)",
            border: "0.5px solid var(--border)",
            borderRadius: "var(--r-lg)",
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <span
            style={{
              fontSize: 14,
              color: "var(--text-mid)",
              flexShrink: 0,
              marginTop: 1,
            }}
          >
            ⓘ
          </span>
          <p
            style={{ fontSize: 11, color: "var(--text-mid)", lineHeight: 1.7 }}
          >
            Dit overzicht toont uitsluitend publiek aanbestede projecten (boven
            Europese drempel ~€5,3M). Particuliere projecten en onderhands
            gegunde opdrachten zijn niet weergegeven. Gebruik als{" "}
            <strong style={{ color: "var(--text-hi)" }}>
              richtinggevend signaal
            </strong>
            , niet als volledig beeld.{" "}
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              style={{ color: "var(--accent)", textDecoration: "none" }}
            >
              Zie methodologie →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

const thBase: React.CSSProperties = {
  padding: "9px 12px",
  fontSize: 9,
  fontWeight: 600,
  fontFamily: "var(--font-mono)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-mid)",
  borderBottom: "0.5px solid var(--border)",
  whiteSpace: "nowrap",
};

function Th({
  label,
  k,
  current,
  dir,
  onSort,
  align = "left",
  width,
}: {
  label: string;
  k: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "left" | "right" | "center";
  width?: number;
}) {
  const active = current === k;
  return (
    <th
      onClick={() => onSort(k)}
      style={{
        ...thBase,
        textAlign: align,
        width,
        cursor: "pointer",
        color: active ? "var(--accent)" : "var(--text-mid)",
      }}
    >
      {label}
      {active && (
        <span style={{ marginLeft: 3 }}>{dir === "asc" ? "↑" : "↓"}</span>
      )}
    </th>
  );
}

function TableRow({
  row: r,
  maxCount,
  showProvince,
}: {
  row: GemeenteMetrics;
  maxCount: number;
  showProvince: boolean;
}) {
  const barW = Math.round((r.activeTenderCount / maxCount) * 100);
  const trendColor = {
    growing: "var(--ok)",
    stable: "var(--text-mid)",
    shrinking: "var(--alert)",
  }[r.trend];
  const trendLabel = {
    growing: "groeiend↑",
    stable: "stabiel",
    shrinking: "krimpend↓",
  }[r.trend];
  const sigColor = {
    ok: "var(--ok)",
    warn: "var(--warn)",
    alert: "var(--alert)",
  }[r.bottleneckSignal];
  const sigLabel = { ok: "ok", warn: "let op", alert: "knelpunt" }[
    r.bottleneckSignal
  ];

  const tdBase: React.CSSProperties = {
    padding: "8px 12px",
    fontSize: 12,
    borderBottom: "0.5px solid var(--border)",
    verticalAlign: "middle",
  };

  return (
    <tr
      style={{ transition: "background 0.1s" }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--bg-hover)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <td style={{ ...tdBase, color: "var(--text-hi)", fontWeight: 500 }}>
        {r.gemeente}
      </td>
      {showProvince && (
        <td style={{ ...tdBase, color: "var(--text-mid)" }}>{r.province}</td>
      )}
      <td
        style={{
          ...tdBase,
          textAlign: "right",
          color: "var(--accent)",
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
        }}
      >
        {r.activeTenderCount}
      </td>
      <td
        style={{
          ...tdBase,
          textAlign: "right",
          color: "var(--text-mid)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {Math.round(r.estimatedValue / 1_000_000).toLocaleString("nl-NL")}
      </td>
      <td
        style={{
          ...tdBase,
          textAlign: "right",
          fontFamily: "var(--font-mono)",
          color:
            r.avgPermitDays && r.avgPermitDays > 150
              ? "var(--warn)"
              : "var(--text-mid)",
        }}
      >
        {r.avgPermitDays ? `${r.avgPermitDays}d` : "—"}
      </td>
      <td style={{ ...tdBase, textAlign: "center" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: trendColor,
          }}
        >
          {trendLabel}
        </span>
      </td>
      <td style={{ ...tdBase, textAlign: "center" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 500,
            padding: "2px 7px",
            borderRadius: "var(--r-xl)",
            border: `0.5px solid ${sigColor}`,
            color: sigColor,
            display: "inline-block",
          }}
        >
          {sigLabel}
        </span>
      </td>
      <td style={{ ...tdBase }}>
        <div
          style={{
            height: 4,
            background: "var(--bg-overlay)",
            borderRadius: 2,
            overflow: "hidden",
            minWidth: 80,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${barW}%`,
              background: "var(--accent)",
              borderRadius: 2,
              transition: "width 0.3s",
            }}
          />
        </div>
      </td>
    </tr>
  );
}
