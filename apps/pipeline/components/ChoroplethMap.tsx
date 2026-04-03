"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { PipelineData, ProvinceMetrics } from "@/lib/pipeline-data";

const HEAT_STOPS = [
  [0,    "#1c2128"],
  [0.15, "#1a3040"],
  [0.3,  "#1a4060"],
  [0.45, "#1a5578"],
  [0.6,  "#1a6e8e"],
  [0.75, "#2196b0"],
  [0.85, "#e8b84b"],
  [1,    "#d97c2a"],
] as const;

const SIGNAL_COLORS = {
  ok:    "var(--color-signal-ok)",
  warn:  "var(--color-signal-warn)",
  alert: "var(--color-signal-alert)",
};

interface ChoroplethMapProps {
  data: PipelineData | null;
  selected: ProvinceMetrics | null;
  onSelect: (m: ProvinceMetrics | null) => void;
  isLoading: boolean;
}

export function ChoroplethMap({ data, selected, onSelect, isLoading }: ChoroplethMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<maplibregl.Map | null>(null);

  // Mount map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          brt: {
            type: "raster",
            tiles: ["https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© Kadaster / PDOK",
            maxzoom: 19,
          },
        },
        layers: [
          { id: "background", type: "background", paint: { "background-color": "#0d1117" } },
          { id: "brt",        type: "raster",     source: "brt", paint: { "raster-opacity": 0.18, "raster-brightness-max": 0.25, "raster-saturation": -1 } },
        ],
      } as maplibregl.StyleSpecification,
      center: [5.3, 52.3],
      zoom: 6.8,
      maxZoom: 12,
      minZoom: 5,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    map.on("load", () => {
      map.addSource("provinces", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "provinces-fill",
        type: "fill",
        source: "provinces",
        paint: {
          "fill-color": [
            "interpolate", ["linear"], ["get", "activityScore"],
            ...HEAT_STOPS.flatMap(([stop, color]) => [stop, color]),
          ],
          "fill-opacity": 0.75,
        },
      });

      map.addLayer({
        id: "provinces-outline",
        type: "line",
        source: "provinces",
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "province"], selected?.province ?? "__none__"], "#ffffff",
            "#30363d",
          ],
          "line-width": [
            "case",
            ["==", ["get", "province"], selected?.province ?? "__none__"], 2, 0.5,
          ],
        },
      });

      map.addLayer({
        id: "provinces-labels",
        type: "symbol",
        source: "provinces",
        layout: {
          "text-field": ["get", "province"],
          "text-size": 11,
          "text-font": ["Open Sans Regular"],
          "text-anchor": "center",
        },
        paint: {
          "text-color": "#8b949e",
          "text-halo-color": "#0d1117",
          "text-halo-width": 1.5,
        },
      });

      map.on("click", "provinces-fill", (e) => {
        const props    = e.features?.[0]?.properties as Record<string, unknown> | undefined;
        const province = String(props?.["province"] ?? "");
        document.dispatchEvent(new CustomEvent("provinceSelect", { detail: province }));
      });

      map.on("mouseenter", "provinces-fill", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "provinces-fill", () => { map.getCanvas().style.cursor = ""; });
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update choropleth when data arrives
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data || !map.isStyleLoaded()) return;

    fetchProvinceGeoJSON(data).then(geojson => {
      const source = map.getSource("provinces") as maplibregl.GeoJSONSource | undefined;
      source?.setData(geojson);
    }).catch(console.error);
  }, [data]);

  // Wire province select event to parent
  useEffect(() => {
    function handler(e: Event) {
      const province = (e as CustomEvent<string>).detail;
      const metrics  = data?.byProvince.find(p => p.province === province) ?? null;
      onSelect(metrics);
    }
    document.addEventListener("provinceSelect", handler);
    return () => document.removeEventListener("provinceSelect", handler);
  }, [data, onSelect]);

  return (
    <div className="flex-1 relative overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" role="application" aria-label="Bouwpijplijnkaart" />

      {/* Province tooltip */}
      {selected && (
        <div className="absolute top-4 right-4 w-[220px] bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] rounded-[var(--radius-lg)] p-3.5 z-20">
          <div className="flex justify-between items-center mb-2.5">
            <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{selected.province}</span>
            <BottleneckBadge signal={selected.bottleneckSignal} />
          </div>
          {[
            { label: "Actieve tenders",  value: String(selected.activeTenderCount) },
            { label: "Geschatte waarde", value: `€${Math.round(selected.estimatedValue / 1_000_000)} M` },
            { label: "Trend",            value: selected.trend === "growing" ? "groeiend" : selected.trend === "shrinking" ? "krimpend" : "stabiel",
              color: selected.trend === "growing" ? "var(--color-signal-ok)" : selected.trend === "shrinking" ? "var(--color-signal-alert)" : "var(--color-text-secondary)" },
          ].map(row => (
            <div key={row.label} className="flex justify-between text-[11px] py-1 border-b border-[var(--color-border-subtle)] last:border-b-0">
              <span className="text-[var(--color-text-secondary)]">{row.label}</span>
              <span style={{ color: row.color ?? "var(--color-text-primary)" }}>{row.value}</span>
            </div>
          ))}
          <button
            className="absolute top-2.5 right-2.5 bg-transparent border-none cursor-pointer text-[var(--color-text-secondary)] p-0.5 hover:text-[var(--color-text-primary)] transition-colors"
            onClick={() => onSelect(null)}
            aria-label="Sluiten"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
              <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="absolute left-4 z-20 bg-[var(--color-surface-raised)] border border-[var(--color-border-subtle)] rounded-[var(--radius-md)] px-2.5 py-2 w-[140px]" style={{ bottom: "calc(var(--height-statbar) + 16px)" }}>
        <span className="text-[9px] font-semibold text-[var(--color-text-muted)] tracking-[0.1em] uppercase block mb-1.5">Activiteit</span>
        <div className="h-1.5 rounded-[3px] w-full" style={{ background: "linear-gradient(to right, #1c2128, #1a5578, #e8b84b, #d97c2a)" }} />
        <div className="flex justify-between mt-1 text-[9px] text-[var(--color-text-muted)]">
          <span>laag</span>
          <span>hoog</span>
        </div>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center gap-3 bg-[rgba(13,17,23,0.6)] text-[13px] text-[var(--color-text-secondary)] z-50">
          <span className="w-5 h-5 border-2 border-[var(--color-border-subtle)] border-t-[var(--color-accent)] rounded-full animate-spin shrink-0" />
          Pijplijndata laden...
        </div>
      )}
    </div>
  );
}

function BottleneckBadge({ signal }: { signal: "ok" | "warn" | "alert" }) {
  const labels = { ok: "ok", warn: "let op", alert: "knelpunt" };
  return (
    <span className="text-[10px] font-medium" style={{ color: SIGNAL_COLORS[signal] }}>
      {labels[signal]}
    </span>
  );
}

async function fetchProvinceGeoJSON(data: PipelineData): Promise<GeoJSON.FeatureCollection> {
  try {
    const url =
      "https://service.pdok.nl/cbs/gebiedsindelingen/2024/wfs/v1_0?" +
      "service=WFS&version=2.0.0&request=GetFeature" +
      "&typeName=cbs_provincie_2024_gegeneraliseerd" +
      "&outputFormat=application/json&srsName=EPSG:4326&count=20";
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error("PDOK provinces unavailable");
    const geojson = await res.json() as GeoJSON.FeatureCollection;

    return {
      ...geojson,
      features: geojson.features.map(f => {
        const name    = String((f.properties ?? {})["statnaam"] ?? "");
        const metrics = data.byProvince.find(p => p.province === name);
        return {
          ...f,
          properties: {
            ...f.properties,
            province:     name,
            activityScore: metrics?.activityScore ?? 0,
            activeTenders: metrics?.activeTenderCount ?? 0,
            bottleneck:    metrics?.bottleneckSignal ?? "ok",
          },
        };
      }),
    };
  } catch {
    return { type: "FeatureCollection", features: [] };
  }
}
