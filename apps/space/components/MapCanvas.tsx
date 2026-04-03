"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { Gemeente } from "@lumen/pdok-client";
import type {
  LayerVisibility,
  LandFilterState,
  LandFeature,
  LandFeatureCollection,
} from "./AppShell";
import { fetchLandOpportunities } from "@/lib/land-fetch";
import styles from "./MapCanvas.module.css";

const SOURCE = "ruimte";
const LAYERS = {
  infill: "ruimte-infill",
  herbestemming: "ruimte-herbestemming",
  transformatie: "ruimte-transformatie",
  outline: "ruimte-outline",
};

const COLORS = {
  infill: "#39d0a0",
  herbestemming: "#e8b84b",
  transformatie: "#5b8dee",
};

interface MapCanvasProps {
  gemeente: Gemeente;
  layers: LayerVisibility;
  filters: LandFilterState;
  selectedId: string | null;
  onFeatureSelect: (f: LandFeature | null) => void;
  onDataLoaded: (fc: LandFeatureCollection) => void;
  onLoadStart: () => void;
}

export function MapCanvas({
  gemeente,
  layers,
  filters,
  selectedId,
  onFeatureSelect,
  onDataLoaded,
  onLoadStart,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(),
      center: gemeente.centroid,
      zoom: gemeente.zoom,
      maxZoom: 19,
      minZoom: 6,
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
    map.addControl(
      new maplibregl.ScaleControl({ unit: "metric" }),
      "bottom-left",
    );

    map.on("load", () => {
      map.addSource(SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        generateId: true,
      });

      Object.entries(COLORS).forEach(([type, color]) => {
        map.addLayer({
          id: LAYERS[type as keyof typeof LAYERS],
          type: "fill",
          source: SOURCE,
          paint: {
            "fill-color": color,
            "fill-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              0.4,
              15,
              0.65,
            ],
          },
          filter: ["==", ["get", "opportunity_type"], type],
        });
      });

      map.addLayer({
        id: LAYERS.outline,
        type: "line",
        source: SOURCE,
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "identificatie"], selectedId ?? "__none__"],
            "#ffffff",
            ["==", ["get", "opportunity_type"], "infill"],
            COLORS.infill,
            ["==", ["get", "opportunity_type"], "herbestemming"],
            COLORS.herbestemming,
            COLORS.transformatie,
          ],
          "line-width": [
            "case",
            ["==", ["get", "identificatie"], selectedId ?? "__none__"],
            2.5,
            0.8,
          ],
          "line-opacity": 0.8,
        },
      });

      const clickable = Object.values(LAYERS).filter(
        (l) => l !== LAYERS.outline,
      );
      clickable.forEach((layerId) => {
        map.on("click", layerId, (e) => {
          const feat = e.features?.[0];
          if (!feat) return;
          const p = feat.properties as Record<string, unknown>;
          onFeatureSelect({
            type: "Feature",
            geometry: feat.geometry,
            properties: {
              identificatie: String(p["identificatie"] ?? ""),
              gebruiksdoel: String(p["gebruiksdoel"] ?? ""),
              oppervlakte: Number(p["oppervlakte"] ?? 0),
              bouwjaar: Number(p["bouwjaar"] ?? 0),
              opportunity_type: p["opportunity_type"] as
                | "infill"
                | "herbestemming"
                | "transformatie",
              opportunity_opp: Number(p["opportunity_opp"] ?? 0),
              opportunity_woningen: Number(p["opportunity_woningen"] ?? 0),
              opportunity_rationale: String(p["opportunity_rationale"] ?? ""),
              bestemmingshoofdgroep: String(p["bestemmingshoofdgroep"] ?? ""),
            },
          });
        });
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
      });

      map.on("click", (e) => {
        if (
          map.queryRenderedFeatures(e.point, { layers: clickable }).length === 0
        )
          onFeatureSelect(null);
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.flyTo({
      center: gemeente.centroid,
      zoom: gemeente.zoom,
      duration: 1200,
      essential: true,
    });

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    onLoadStart();

    fetchLandOpportunities(gemeente, filters, ctrl.signal)
      .then((fc) => {
        if (ctrl.signal.aborted) return;
        const source = map.getSource(SOURCE) as
          | maplibregl.GeoJSONSource
          | undefined;
        source?.setData(fc as Parameters<typeof source.setData>[0]);
        onDataLoaded(fc);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError")
          console.error("Land fetch error:", err);
      });

    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gemeente, filters]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const vis = (on: boolean) =>
      (on ? "visible" : "none") as "visible" | "none";
    map.setLayoutProperty(LAYERS.infill, "visibility", vis(layers.infill));
    map.setLayoutProperty(
      LAYERS.herbestemming,
      "visibility",
      vis(layers.herbestemming),
    );
    map.setLayoutProperty(
      LAYERS.transformatie,
      "visibility",
      vis(layers.transformatie),
    );
  }, [layers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    try {
      map.setPaintProperty(LAYERS.outline, "line-color", [
        "case",
        ["==", ["get", "identificatie"], selectedId ?? "__none__"],
        "#ffffff",
        ["==", ["get", "opportunity_type"], "infill"],
        COLORS.infill,
        ["==", ["get", "opportunity_type"], "herbestemming"],
        COLORS.herbestemming,
        COLORS.transformatie,
      ]);
      map.setPaintProperty(LAYERS.outline, "line-width", [
        "case",
        ["==", ["get", "identificatie"], selectedId ?? "__none__"],
        2.5,
        0.8,
      ]);
    } catch {
      /* layer may not be ready */
    }
  }, [selectedId]);

  return (
    <div
      ref={containerRef}
      className={styles.canvas}
      role="application"
      aria-label="Bouwlocatiekaart"
    />
  );
}

function buildStyle(): maplibregl.StyleSpecification {
  return {
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
        id: "background",
        type: "background",
        paint: { "background-color": "#0d1117" },
      },
      {
        id: "brt",
        type: "raster",
        source: "brt",
        paint: {
          "raster-opacity": 0.22,
          "raster-brightness-max": 0.28,
          "raster-saturation": -1,
        },
      },
    ],
  };
}
