"use client";

import type { PipelineData } from "@/lib/pipeline-data";

interface TimelineChartProps {
  data: PipelineData | null;
  isLoading: boolean;
}

export function TimelineChart({ data, isLoading }: TimelineChartProps) {
  if (isLoading || !data) {
    return (
      <div className="flex-1 flex items-center justify-center gap-3 text-[13px] text-[var(--color-text-secondary)]">
        <span className="w-5 h-5 border-2 border-[var(--color-border-subtle)] border-t-[var(--color-accent)] rounded-full animate-spin shrink-0" />
        Tijdlijn laden...
      </div>
    );
  }

  const points      = data.timeline;
  const maxTenders  = Math.max(...points.map(p => p.tenderCount), 1);
  const maxValueM   = Math.max(...points.map(p => p.estimatedValueMillions), 1);

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--color-surface-base)]">
      <div className="max-w-[1100px] mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex justify-between items-start mb-7 flex-wrap gap-4">
          <div>
            <h2 className="text-[16px] font-medium text-[var(--color-text-primary)] mb-1">Tenders per maand</h2>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Woningbouwaanbestedingen — afgelopen 12 maanden
              {data.isMockData && <span className="text-[var(--color-signal-warn)]"> (voorbeelddata)</span>}
            </p>
          </div>
          <div className="flex gap-4">
            {[
              { color: "var(--color-accent)",  label: "Aantal tenders" },
              { color: "var(--color-heat-5)",   label: "Geschatte waarde (M€)" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-secondary)]">
                <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: color }} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Bar chart */}
        <div className="flex gap-0 h-[240px] mb-8">
          {/* Y-axis */}
          <div className="flex flex-col justify-between pr-2.5 w-9 shrink-0">
            {[1, 0.75, 0.5, 0.25, 0].map(frac => (
              <div key={frac} className="text-[10px] text-[var(--color-text-muted)] text-right leading-none">
                {Math.round(maxTenders * frac)}
              </div>
            ))}
          </div>

          {/* Chart body */}
          <div className="flex-1 relative border-b border-[var(--color-border-subtle)] overflow-hidden">
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map(frac => (
              <div
                key={frac}
                className="absolute left-0 right-0 h-px bg-[var(--color-border-subtle)] opacity-50"
                style={{ bottom: `${frac * 100}%` }}
              />
            ))}

            {/* Bars */}
            <div className="absolute inset-0 flex items-end gap-[3px] px-1">
              {points.map(point => {
                const tenderHeight = (point.tenderCount / maxTenders) * 100;
                const valueHeight  = (point.estimatedValueMillions / maxValueM) * 100;
                return (
                  <div key={point.month} className="flex-1 flex flex-col items-center relative h-full group">
                    {/* Hover tooltip */}
                    <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] rounded-[var(--radius-md)] px-2.5 py-1.5 text-[11px] text-[var(--color-text-primary)] whitespace-nowrap z-30 opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 flex flex-col gap-0.5">
                      <strong className="text-[var(--color-accent)] font-medium">{point.label}</strong>
                      <span>{point.tenderCount} tenders</span>
                      <span>€{point.estimatedValueMillions} M</span>
                    </div>
                    {/* Bar pair */}
                    <div className="flex-1 w-full flex items-end gap-0.5">
                      <div
                        className="flex-1 rounded-t-sm min-h-[2px] transition-opacity hover:opacity-100"
                        style={{ height: `${tenderHeight}%`, background: "var(--color-accent)", opacity: 0.85 }}
                      />
                      <div
                        className="flex-1 rounded-t-sm min-h-[2px] transition-opacity hover:opacity-100"
                        style={{ height: `${valueHeight}%`, background: "var(--color-heat-5)", opacity: 0.6 }}
                      />
                    </div>
                    <div className="text-[9px] text-[var(--color-text-muted)] mt-1.5 truncate max-w-full text-center">
                      {point.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid gap-3 mb-8" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {[
            { label: "Totaal tenders",        value: data.totalTenders.toLocaleString("nl-NL"),           sub: "afgelopen 12 maanden" },
            { label: "Geschatte totaalwaarde", value: `€${data.totalValueMillions.toLocaleString("nl-NL")} M`, sub: "publiek aanbesteed" },
            { label: "Gemiddeld per maand",    value: Math.round(data.totalTenders / Math.max(data.timeline.length, 1)).toLocaleString("nl-NL"), sub: "tenders" },
            { label: "Meest actieve provincie", value: data.byProvince[0]?.province ?? "—",               sub: `${data.byProvince[0]?.activeTenderCount ?? 0} tenders` },
          ].map(card => (
            <div key={card.label} className="bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] rounded-[var(--radius-lg)] px-4 py-3.5 flex flex-col gap-1">
              <span className="text-[10px] text-[var(--color-text-secondary)] tracking-[0.06em]">{card.label}</span>
              <span className="text-[18px] font-medium text-[var(--color-text-primary)]">{card.value}</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">{card.sub}</span>
            </div>
          ))}
        </div>

        {/* Bottleneck section */}
        <div className="bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] rounded-[var(--radius-lg)] px-4 py-4">
          <h3 className="text-[13px] font-medium text-[var(--color-text-primary)] mb-1">Signaalprovinciën</h3>
          <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed mb-3.5">
            Provincies met hoge woningvraag maar lage tenderactiviteit — mogelijke capaciteitsknelpunten
          </p>
          <div className="flex flex-col gap-2">
            {data.byProvince
              .filter(p => p.bottleneckSignal !== "ok")
              .slice(0, 6)
              .map(p => (
                <div key={p.province} className="flex items-center gap-2.5 py-1.5 border-b border-[var(--color-border-subtle)] last:border-b-0">
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: p.bottleneckSignal === "alert" ? "var(--color-signal-alert)" : "var(--color-signal-warn)" }}
                  />
                  <span className="text-[12px] text-[var(--color-text-primary)] flex-1">{p.province}</span>
                  <span className="text-[11px] text-[var(--color-text-secondary)]">{p.activeTenderCount} tenders</span>
                  <span
                    className="text-[10px] font-medium min-w-[60px] text-right"
                    style={{ color: p.bottleneckSignal === "alert" ? "var(--color-signal-alert)" : "var(--color-signal-warn)" }}
                  >
                    {p.bottleneckSignal === "alert" ? "knelpunt" : "let op"}
                  </span>
                </div>
              ))}
            {data.byProvince.filter(p => p.bottleneckSignal !== "ok").length === 0 && (
              <p className="text-[11px] text-[var(--color-text-secondary)]">Geen knelpunten gedetecteerd in huidige dataset.</p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
