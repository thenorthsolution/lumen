"use client";

import type React from "react";
import type { PipelineData, ProvinceMetrics } from "@/lib/types";

interface Props {
  data: PipelineData | null;
  isLoading: boolean;
}

export function TimelineView({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return <LoadingState label="Tijdlijn laden…" />;
  }

  const pts = data.timeline;
  const maxT = Math.max(...pts.map((p) => p.tenderCount), 1);
  const maxV = Math.max(...pts.map((p) => p.estimatedValueM), 1);
  const total12 = pts.reduce((s, p) => s + p.tenderCount, 0);
  const avgPerMonth = pts.length ? Math.round(total12 / pts.length) : 0;
  const topProvince = data.byProvince[0];

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
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "var(--text-hi)",
              marginBottom: 4,
            }}
          >
            Tenders per maand
          </h1>
          <p
            style={{
              fontSize: 12,
              color: "var(--text-mid)",
              fontFamily: "var(--font-mono)",
            }}
          >
            Woningbouwaanbestedingen —{" "}
            {data.dateRange === "6m"
              ? "6"
              : data.dateRange === "24m"
                ? "24"
                : "12"}{" "}
            maanden
            {data.isMockData && (
              <span style={{ color: "var(--warn)" }}> (voorbeelddata)</span>
            )}
          </p>
        </div>

        {/* KPI cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
            gap: 12,
            marginBottom: 28,
          }}
        >
          {[
            {
              label: "Totaal tenders",
              value: total12.toLocaleString("nl-NL"),
              sub: "geselecteerde periode",
            },
            {
              label: "Totale waarde",
              value: `€${data.totalValueM.toLocaleString("nl-NL")} M`,
              sub: "geraamd",
            },
            {
              label: "Gem. per maand",
              value: avgPerMonth.toLocaleString("nl-NL"),
              sub: "tenders",
            },
            {
              label: "Meest actief",
              value: topProvince?.province ?? "—",
              sub: `${topProvince?.activeTenderCount ?? 0} tenders`,
            },
          ].map((card) => (
            <KpiCard key={card.label} {...card} />
          ))}
        </div>

        {/* Bar chart */}
        <ChartCard title="Aanbestedingen & geschatte waarde">
          <div
            style={{ display: "flex", gap: 0, height: 220, marginBottom: 8 }}
          >
            {/* Y-axis */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                paddingRight: 10,
                width: 36,
                flexShrink: 0,
              }}
            >
              {[1, 0.75, 0.5, 0.25, 0].map((f) => (
                <div
                  key={f}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--text-lo)",
                    textAlign: "right",
                    lineHeight: 1,
                  }}
                >
                  {Math.round(maxT * f)}
                </div>
              ))}
            </div>

            {/* Bars */}
            <div
              style={{
                flex: 1,
                position: "relative",
                borderBottom: "0.5px solid var(--border)",
              }}
            >
              {/* Gridlines */}
              {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                <div
                  key={f}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    height: 0.5,
                    background: "var(--border)",
                    bottom: `${f * 100}%`,
                    opacity: 0.5,
                  }}
                />
              ))}

              {/* Bar columns */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "flex-end",
                  gap: 3,
                  padding: "0 2px",
                }}
              >
                {pts.map((pt) => {
                  const tH = (pt.tenderCount / maxT) * 100;
                  const vH = (pt.estimatedValueM / maxV) * 100;
                  return (
                    <div
                      key={pt.month}
                      style={{
                        flex: 1,
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "flex-end",
                        position: "relative",
                      }}
                    >
                      {/* Tooltip */}
                      <div
                        style={{
                          position: "absolute",
                          bottom: "calc(100% + 8px)",
                          left: "50%",
                          transform: "translateX(-50%)",
                          background: "var(--bg-overlay)",
                          border: "0.5px solid var(--border-mid)",
                          borderRadius: "var(--r-md)",
                          padding: "6px 8px",
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          color: "var(--text-hi)",
                          whiteSpace: "nowrap",
                          zIndex: 30,
                          opacity: 0,
                          pointerEvents: "none",
                          transition: "opacity 0.15s",
                        }}
                        className="bar-tooltip"
                      >
                        <div
                          style={{
                            color: "var(--accent)",
                            fontWeight: 500,
                            marginBottom: 2,
                          }}
                        >
                          {pt.label}
                        </div>
                        <div>{pt.tenderCount} tenders</div>
                        <div>€{pt.estimatedValueM} M</div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-end",
                          gap: 2,
                          height: "100%",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => {
                          const tip =
                            e.currentTarget.parentElement?.querySelector(
                              ".bar-tooltip",
                            ) as HTMLElement | null;
                          if (tip) tip.style.opacity = "1";
                        }}
                        onMouseLeave={(e) => {
                          const tip =
                            e.currentTarget.parentElement?.querySelector(
                              ".bar-tooltip",
                            ) as HTMLElement | null;
                          if (tip) tip.style.opacity = "0";
                        }}
                      >
                        <div
                          style={{
                            flex: 1,
                            height: `${tH}%`,
                            background: "var(--accent)",
                            opacity: 0.85,
                            borderRadius: "2px 2px 0 0",
                            minHeight: 2,
                          }}
                        />
                        <div
                          style={{
                            flex: 1,
                            height: `${vH}%`,
                            background: "#1a7a96",
                            opacity: 0.65,
                            borderRadius: "2px 2px 0 0",
                            minHeight: 2,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* X-axis labels */}
          <div
            style={{
              display: "flex",
              gap: 3,
              paddingLeft: 46,
              paddingRight: 2,
            }}
          >
            {pts.map((pt) => (
              <div
                key={pt.month}
                style={{
                  flex: 1,
                  textAlign: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  color: "var(--text-lo)",
                  overflow: "hidden",
                }}
              >
                {pt.label}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div
            style={{ display: "flex", gap: 16, marginTop: 12, paddingLeft: 46 }}
          >
            {[
              { color: "var(--accent)", label: "Aantal tenders" },
              { color: "#1a7a96", label: "Geschatte waarde (M€)" },
            ].map((l) => (
              <div
                key={l.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  fontSize: 10,
                  color: "var(--text-mid)",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: l.color,
                  }}
                />
                {l.label}
              </div>
            ))}
          </div>
        </ChartCard>

        {/* Bottleneck provinces */}
        <ChartCard title="Signaalprovinciën" style={{ marginTop: 16 }}>
          <p
            style={{
              fontSize: 11,
              color: "var(--text-mid)",
              marginBottom: 14,
              lineHeight: 1.6,
            }}
          >
            Provincies met hoge woningvraag maar lage tenderactiviteit of lange
            vergunningsdoorlooptijden.
          </p>
          {data.byProvince
            .filter((p) => p.bottleneckSignal !== "ok")
            .slice(0, 8)
            .map((p) => (
              <BottleneckRow key={p.province} province={p} />
            ))}
          {data.byProvince.filter((p) => p.bottleneckSignal !== "ok").length ===
            0 && (
            <p style={{ fontSize: 11, color: "var(--text-mid)" }}>
              Geen knelpunten gedetecteerd.
            </p>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-raised)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--r-lg)",
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "var(--text-mid)",
          marginBottom: 4,
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: "var(--text-hi)",
          fontFamily: "var(--font-sans)",
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10,
          color: "var(--text-lo)",
          marginTop: 3,
          fontFamily: "var(--font-mono)",
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
  style,
}: {
  title: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "var(--bg-raised)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--r-lg)",
        padding: "18px 20px",
        ...style,
      }}
    >
      <h3
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: "var(--text-hi)",
          marginBottom: 14,
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function BottleneckRow({ province: p }: { province: ProvinceMetrics }) {
  const color = p.bottleneckSignal === "alert" ? "var(--alert)" : "var(--warn)";
  const label = p.bottleneckSignal === "alert" ? "knelpunt" : "let op";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
        borderBottom: "0.5px solid var(--border)",
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 12, color: "var(--text-hi)", flex: 1 }}>
        {p.province}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-mid)",
        }}
      >
        {p.activeTenderCount} tenders
      </span>
      {p.avgPermitDays && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-mid)",
          }}
        >
          {p.avgPermitDays}d
        </span>
      )}
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 500,
          color,
          minWidth: 54,
          textAlign: "right",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
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
      {label}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
