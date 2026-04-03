"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import type { Gemeente } from "@lumen/pdok-client";
import type {
  LayerVisibility,
  FilterState,
  VboFeature,
  VboFeatureCollection,
} from "./AppShell";
import { fetchAndScoreGemeente } from "@/lib/bag-fetch";
import styles from "./MapCanvas.module.css";

// MapLibre source/layer IDs
const SOURCE_LEEGSTAND = "leegstand";
const LAYER_HOOG = "leegstand-hoog";
const LAYER_MIDDEL = "leegstand-middel";
const LAYER_LAAG = "leegstand-laag";
const LAYER_PERCELEN = "leegstand-percelen";
const LAYER_HOOG_OUTLINE = "leegstand-hoog-outline";

interface MapCanvasProps {
  gemeente: Gemeente;
  layers: LayerVisibility;
  filters: FilterState;
  selectedFeatureId: string | null;
  onFeatureSelect: (feature: VboFeature | null) => void;
  onDataLoaded: (fc: VboFeatureCollection) => void;
  onLoadStart: () => void;
}

export function MapCanvas({
  gemeente,
  layers,
  filters,
  selectedFeatureId,
  onFeatureSelect,
  onDataLoaded,
  onLoadStart,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  // Initialise map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildDarkStyle(),
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
      // Add empty source — data loaded separately
      map.addSource(SOURCE_LEEGSTAND, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        generateId: true,
      });

      // Polygon fill layers per tier
      addPolygonLayer(
        map,
        LAYER_LAAG,
        "var(--color-laag)",
        0.35,
        SOURCE_LEEGSTAND,
        "laag",
      );
      addPolygonLayer(
        map,
        LAYER_MIDDEL,
        "var(--color-middel)",
        0.55,
        SOURCE_LEEGSTAND,
        "middel",
      );
      addPolygonLayer(
        map,
        LAYER_HOOG,
        "var(--color-hoog)",
        0.7,
        SOURCE_LEEGSTAND,
        "hoog",
      );

      // Outline for selected / hoog
      map.addLayer({
        id: LAYER_HOOG_OUTLINE,
        type: "line",
        source: SOURCE_LEEGSTAND,
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "identificatie"], selectedFeatureId ?? ""],
            "#58a6ff",
            ["==", ["get", "score_tier"], "hoog"],
            "#3fb950",
            "#bb8009",
          ],
          "line-width": [
            "case",
            ["==", ["get", "identificatie"], selectedFeatureId ?? ""],
            2,
            1,
          ],
          "line-opacity": 0.9,
        },
        filter: ["in", ["get", "score_tier"], ["literal", ["hoog", "middel"]]],
      });

      // Click handler
      const clickableLayers = [LAYER_HOOG, LAYER_MIDDEL, LAYER_LAAG];
      clickableLayers.forEach((layerId) => {
        map.on("click", layerId, (e) => {
          const feature = e.features?.[0];
          if (!feature) return;

          // Reconstruct VboFeature from map feature
          const props = feature.properties as Record<string, unknown>;
          const vboFeature: VboFeature = {
            type: "Feature",
            geometry: feature.geometry,
            properties: {
              identificatie: String(props["identificatie"] ?? ""),
              status: String(props["status"] ?? ""),
              gebruiksdoel: String(props["gebruiksdoel"] ?? ""),
              oppervlakte: Number(props["oppervlakte"] ?? 0),
              bouwjaar: Number(props["bouwjaar"] ?? 0),
              woonplaatsnaam: String(props["woonplaatsnaam"] ?? ""),
              score: props["score"]
                ? JSON.parse(String(props["score"]))
                : undefined,
            },
          };
          onFeatureSelect(vboFeature);
        });

        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
      });

      // Click on empty space deselects
      map.on("click", (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: clickableLayers,
        });
        if (features.length === 0) {
          onFeatureSelect(null);
        }
      });
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly to gemeente on change and reload data
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.flyTo({
      center: gemeente.centroid,
      zoom: gemeente.zoom,
      duration: 1200,
      essential: true,
    });

    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    onLoadStart();

    fetchAndScoreGemeente(gemeente, filters, controller.signal)
      .then((fc) => {
        if (controller.signal.aborted) return;

        const source = map.getSource(SOURCE_LEEGSTAND) as
          | maplibregl.GeoJSONSource
          | undefined;
        if (source) {
          // Flatten score to top-level property for MapLibre filter access
          const flat = {
            ...fc,
            features: fc.features.map((f) => ({
              ...f,
              properties: {
                ...f.properties,
                score_tier: f.properties?.score?.tier ?? "laag",
                score: JSON.stringify(f.properties?.score),
              },
            })),
          };
          source.setData(flat);
        }

        onDataLoaded(fc);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") {
          console.error("BAG fetch fout:", err);
        }
      });

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gemeente, filters]);

  // Sync layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const visibility = (on: boolean) =>
      (on ? "visible" : "none") as "visible" | "none";
    map.setLayoutProperty(LAYER_HOOG, "visibility", visibility(layers.hoog));
    map.setLayoutProperty(
      LAYER_MIDDEL,
      "visibility",
      visibility(layers.middel),
    );
    map.setLayoutProperty(LAYER_LAAG, "visibility", visibility(layers.laag));
    map.setLayoutProperty(
      LAYER_PERCELEN,
      "visibility",
      visibility(layers.percelen),
    );
    map.setLayoutProperty(
      LAYER_HOOG_OUTLINE,
      "visibility",
      visibility(layers.hoog || layers.middel),
    );
  }, [layers]);

  // Update selected feature outline
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    try {
      map.setPaintProperty(LAYER_HOOG_OUTLINE, "line-color", [
        "case",
        ["==", ["get", "identificatie"], selectedFeatureId ?? "__none__"],
        "#58a6ff",
        ["==", ["get", "score_tier"], "hoog"],
        "#3fb950",
        "#bb8009",
      ]);
      map.setPaintProperty(LAYER_HOOG_OUTLINE, "line-width", [
        "case",
        ["==", ["get", "identificatie"], selectedFeatureId ?? "__none__"],
        2.5,
        0.8,
      ]);
    } catch {
      // Layer may not be ready yet
    }
  }, [selectedFeatureId]);

  const handleContainerClick = useCallback(() => {
    popupRef.current?.remove();
  }, []);

  return (
    <div
      ref={containerRef}
      className={styles.canvas}
      onClick={handleContainerClick}
      role="application"
      aria-label="Leegstandskaart"
    />
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addPolygonLayer(
  map: maplibregl.Map,
  id: string,
  color: string,
  opacity: number,
  source: string,
  tier: string,
) {
  map.addLayer({
    id,
    type: "fill",
    source,
    paint: {
      "fill-color": color,
      "fill-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        opacity * 0.6,
        15,
        opacity,
      ],
    },
    filter: ["==", ["get", "score_tier"], tier],
  });
}

/**
 * Dark monochrome MapLibre style using PDOK BRT tiles.
 * Falls back to open-source demotiles if PDOK is unavailable.
 */
function buildDarkStyle(): maplibregl.StyleSpecification {
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
        id: "brt-tiles",
        type: "raster",
        source: "brt",
        paint: {
          "raster-opacity": 0.25,
          "raster-brightness-min": 0,
          "raster-brightness-max": 0.3,
          "raster-saturation": -1,
          "raster-contrast": 0.2,
        },
      },
    ],
  };
}
