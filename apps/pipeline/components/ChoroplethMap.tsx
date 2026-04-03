"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import type { PipelineData, ProvinceMetrics } from "@/lib/types";

const HEAT_STOPS: [number, string][] = [
  [0, "#0e1318"],
  [0.15, "#0d2030"],
  [0.3, "#0c3048"],
  [0.45, "#0b4260"],
  [0.6, "#1a7a96"],
  [0.8, "#e8b84b"],
  [1, "#d97c2a"],
];

interface Props {
  data: PipelineData | null;
  selected: ProvinceMetrics | null;
  onSelect: (m: ProvinceMetrics | null) => void;
  isLoading: boolean;
}

export function ChoroplethMap({ data, selected, onSelect, isLoading }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const dataRef = useRef(data);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Mount map
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
            tiles: [
              "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution: "© Kadaster / PDOK",
            maxzoom: 19,
          },
        },
        layers: [
          {
            id: "bg",
            type: "background",
            paint: { "background-color": "#080c10" },
          },
          {
            id: "brt",
            type: "raster",
            source: "brt",
            paint: {
              "raster-opacity": 0.15,
              "raster-brightness-max": 0.2,
              "raster-saturation": -1,
            },
          },
        ],
      } as maplibregl.StyleSpecification,
      center: [5.3, 52.3],
      zoom: 6.8,
      maxZoom: 13,
      minZoom: 5,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );

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
            "interpolate",
            ["linear"],
            ["get", "activityScore"],
            ...HEAT_STOPS.flatMap(([s, c]) => [s, c]),
          ],
          "fill-opacity": 0.78,
        },
      });

      map.addLayer({
        id: "provinces-line",
        type: "line",
        source: "provinces",
        paint: {
          "line-color": "rgba(255,255,255,0.12)",
          "line-width": 0.5,
        },
      });

      map.addLayer({
        id: "provinces-selected",
        type: "line",
        source: "provinces",
        paint: {
          "line-color": "#e8b84b",
          "line-width": 2,
        },
        filter: ["==", ["get", "province"], "__none__"],
      });

      map.addLayer({
        id: "provinces-labels",
        type: "symbol",
        source: "provinces",
        layout: {
          "text-field": ["get", "province"],
          "text-size": 10,
          "text-font": ["Open Sans Regular"],
        },
        paint: {
          "text-color": "rgba(255,255,255,0.55)",
          "text-halo-color": "#080c10",
          "text-halo-width": 1.5,
        },
      });

      map.on("click", "provinces-fill", (e) => {
        const props = e.features?.[0]?.properties as
          | Record<string, unknown>
          | undefined;
        const name = String(props?.["province"] ?? "");
        const m =
          dataRef.current?.byProvince.find((p) => p.province === name) ?? null;
        onSelectRef.current(m);
      });

      map.on("mouseenter", "provinces-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "provinces-fill", () => {
        map.getCanvas().style.cursor = "";
      });

      // Load initial data if already available
      if (dataRef.current) updateMap(map, dataRef.current);
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    const raf = requestAnimationFrame(() => map.resize());

    mapRef.current = map;
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line

  // Update data
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;
    if (map.isStyleLoaded()) {
      updateMap(map, data);
    } else {
      map.once("load", () => updateMap(map, data));
    }
  }, [data]);

  // Update selection highlight
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    try {
      map.setFilter("provinces-selected", [
        "==",
        ["get", "province"],
        selected?.province ?? "__none__",
      ]);
    } catch {
      /* layer not ready */
    }
  }, [selected]);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        ref={containerRef}
        style={{ position: "absolute", inset: 0 }}
        role="application"
        aria-label="Bouwpijplijnkaart"
      />

      {/* Province card */}
      {selected && (
        <ProvinceCard province={selected} onClose={() => onSelect(null)} />
      )}

      {/* Legend */}
      <div
        style={{
          position: "absolute",
          left: 12,
          bottom: "calc(var(--statbar-h) + 12px)",
          background: "var(--bg-raised)",
          border: "0.5px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: "8px 10px",
          width: 148,
          zIndex: 20,
        }}
      >
        <span
          style={{
            display: "block",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-lo)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 6,
          }}
        >
          Tenderactiviteit
        </span>
        <div
          style={{
            height: 6,
            borderRadius: 3,
            background:
              "linear-gradient(to right,#0e1318,#1a7a96,#e8b84b,#d97c2a)",
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 4,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-lo)",
          }}
        >
          <span>laag</span>
          <span>hoog</span>
        </div>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(8,12,16,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            fontSize: 13,
            color: "var(--text-mid)",
            zIndex: 50,
            backdropFilter: "blur(2px)",
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
          Kaartdata laden…
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  );
}

// ─── Province info card ──────────────────────────────────────────────────

function ProvinceCard({
  province: p,
  onClose,
}: {
  province: ProvinceMetrics;
  onClose: () => void;
}) {
  const signalColor = {
    ok: "var(--ok)",
    warn: "var(--warn)",
    alert: "var(--alert)",
  }[p.bottleneckSignal];
  const signalLabel = { ok: "OK", warn: "Let op", alert: "Knelpunt" }[
    p.bottleneckSignal
  ];
  const trendLabel = {
    growing: "groeiend↑",
    stable: "stabiel→",
    shrinking: "krimpend↓",
  }[p.trend];
  const trendColor = {
    growing: "var(--ok)",
    stable: "var(--text-mid)",
    shrinking: "var(--alert)",
  }[p.trend];

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 230,
        background: "var(--bg-raised)",
        border: "0.5px solid var(--border-mid)",
        borderRadius: "var(--r-xl)",
        padding: "14px 16px",
        zIndex: 20,
        boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-hi)",
              marginBottom: 2,
            }}
          >
            {p.province}
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: signalColor,
              fontWeight: 500,
            }}
          >
            {signalLabel}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--text-mid)",
            padding: 2,
            lineHeight: 1,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M1 1L11 11M11 1L1 11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Metrics */}
      {[
        {
          label: "Actieve tenders",
          value: p.activeTenderCount.toLocaleString("nl-NL"),
          color: "var(--accent)",
        },
        {
          label: "Geraamde waarde",
          value: `€${Math.round(p.estimatedValue / 1_000_000)} M`,
          color: undefined,
        },
        { label: "Trend", value: trendLabel, color: trendColor },
        ...(p.avgPermitDays
          ? [
              {
                label: "Gem. vergunningsduur",
                value: `${p.avgPermitDays} dagen`,
                color: p.avgPermitDays > 150 ? "var(--warn)" : undefined,
              },
            ]
          : []),
        ...(p.permitGrowthPct
          ? [
              {
                label: "Vergunningsgroei",
                value: `+${p.permitGrowthPct.toFixed(1)}%`,
                color: "var(--ok)",
              },
            ]
          : []),
      ].map((row) => (
        <div
          key={row.label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "6px 0",
            borderBottom: "0.5px solid var(--border)",
          }}
        >
          <span style={{ fontSize: 11, color: "var(--text-mid)" }}>
            {row.label}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 500,
              color: row.color ?? "var(--text-hi)",
            }}
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Map data update ─────────────────────────────────────────────────────

async function updateMap(map: maplibregl.Map, data: PipelineData) {
  try {
    const url =
      "https://service.pdok.nl/cbs/gebiedsindelingen/2024/wfs/v1_0?" +
      "service=WFS&version=2.0.0&request=GetFeature" +
      "&typeName=cbs_provincie_2024_gegeneraliseerd" +
      "&outputFormat=application/json&srsName=EPSG:4326&count=20";

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error("PDOK unavailable");

    const geojson = (await res.json()) as FeatureCollection;
    const enriched: FeatureCollection = {
      ...geojson,
      features: geojson.features.map((f) => {
        const props = f.properties ?? {};
        const name = String(props["statnaam"] ?? props["naam"] ?? "");
        const m = data.byProvince.find((p) => p.province === name);
        return {
          ...f,
          properties: {
            ...props,
            province: name,
            activityScore: m?.activityScore ?? 0,
          },
        };
      }),
    };

    const src = map.getSource("provinces") as
      | maplibregl.GeoJSONSource
      | undefined;
    src?.setData(enriched);
  } catch (err) {
    console.warn("Province GeoJSON unavailable:", err);
  }
}
