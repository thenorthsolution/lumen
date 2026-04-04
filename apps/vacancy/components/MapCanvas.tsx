"use client";

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import type { Gemeente } from "@lumen/pdok-client";
import type {
  BasemapMode,
  LayerVisibility,
  FilterState,
  VboFeature,
  VboFeatureCollection,
} from "./AppShell";
import { fetchAndScoreGemeente, fetchPandGeometries } from "@/lib/bag-fetch";
import styles from "./MapCanvas.module.css";

// MapLibre source/layer IDs
const SOURCE_LEEGSTAND = "leegstand";
const SOURCE_PANDEN = "panden";
const SOURCE_BRT = "brt";
const SOURCE_LUCHTFOTO = "luchtfoto";
const LAYER_BRT = "brt-tiles";
const LAYER_LUCHTFOTO = "luchtfoto-tiles";
const LAYER_HOOG = "leegstand-hoog";
const LAYER_MIDDEL = "leegstand-middel";
const LAYER_LAAG = "leegstand-laag";
const LAYER_PERCELEN = "leegstand-percelen";
const LAYER_PERCELEN_3D = "leegstand-percelen-3d";
const LAYER_HOOG_OUTLINE = "leegstand-hoog-outline";

// MapLibre paint properties do NOT support CSS variables — use resolved hex values
const COLORS = {
  hoog: "#3fb950",
  middel: "#d29922",
  laag: "#484f58",
  selected: "#58a6ff",
};

interface MapCanvasProps {
  gemeente: Gemeente;
  basemap: BasemapMode;
  layers: LayerVisibility;
  filters: FilterState;
  selectedFeature: VboFeature | null;
  selectedFeatureId: string | null;
  view3DNonce: number;
  rotate3DCommand: {
    nonce: number;
    delta: number;
    reset?: boolean;
  };
  onFeatureSelect: (feature: VboFeature | null) => void;
  onDataLoaded: (fc: VboFeatureCollection) => void;
  onLoadStart: () => void;
}

export function MapCanvas({
  gemeente,
  basemap,
  layers,
  filters,
  selectedFeature,
  selectedFeatureId,
  view3DNonce,
  rotate3DCommand,
  onFeatureSelect,
  onDataLoaded,
  onLoadStart,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pandAbortRef = useRef<AbortController | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const is3DModeRef = useRef(false);
  const userBasemapRef = useRef<BasemapMode>(basemap);

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
    map.dragRotate.enable();
    map.touchZoomRotate.enableRotation();

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
      map.addSource(SOURCE_PANDEN, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Add empty source — data loaded separately
      map.addSource(SOURCE_LEEGSTAND, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        generateId: true,
      });

      map.addLayer({
        id: LAYER_PERCELEN,
        type: "fill",
        source: SOURCE_PANDEN,
        paint: {
          "fill-color": "#f0f6fc",
          "fill-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            0.04,
            15,
            0.1,
          ],
          "fill-outline-color": "#8b949e",
        },
      });
      map.addLayer({
        id: LAYER_PERCELEN_3D,
        type: "fill-extrusion",
        source: SOURCE_PANDEN,
        layout: {
          visibility: "none",
        },
        paint: {
          "fill-extrusion-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "bouwjaar"], 1950],
            1800,
            "#c8b59c",
            1950,
            "#d9c8b4",
            2026,
            "#efe2d2",
          ],
          "fill-extrusion-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            15,
            0.55,
            18,
            0.78,
          ],
          "fill-extrusion-height": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "bouwjaar"], 1950],
            1800,
            10,
            1950,
            16,
            2026,
            24,
          ],
          "fill-extrusion-base": 0,
          "fill-extrusion-vertical-gradient": true,
        },
      });

      // Render BAG verblijfsobjecten as point markings.
      // These features do not provide polygon footprints suitable for fill layers.
      addCircleLayer(
        map,
        LAYER_LAAG,
        COLORS.laag,
        5,
        SOURCE_LEEGSTAND,
        "laag",
      );
      addCircleLayer(
        map,
        LAYER_MIDDEL,
        COLORS.middel,
        7,
        SOURCE_LEEGSTAND,
        "middel",
      );
      addCircleLayer(
        map,
        LAYER_HOOG,
        COLORS.hoog,
        9,
        SOURCE_LEEGSTAND,
        "hoog",
      );

      // Outline for selected / higher-scored objects
      map.addLayer({
        id: LAYER_HOOG_OUTLINE,
        type: "circle",
        source: SOURCE_LEEGSTAND,
        paint: {
          "circle-color": "transparent",
          "circle-stroke-color": [
            "case",
            ["==", ["get", "identificatie"], selectedFeatureId ?? ""],
            COLORS.selected,
            ["==", ["get", "score_tier"], "hoog"],
            COLORS.hoog,
            COLORS.middel,
          ],
          "circle-stroke-width": [
            "case",
            ["==", ["get", "identificatie"], selectedFeatureId ?? ""],
            3,
            1.5,
          ],
          "circle-radius": [
            "case",
            ["==", ["get", "identificatie"], selectedFeatureId ?? ""],
            12,
            ["==", ["get", "score_tier"], "hoog"],
            11,
            9,
          ],
          "circle-opacity": 1,
        },
        filter: ["in", ["get", "score_tier"], ["literal", ["hoog", "middel"]]],
      });

      // Click handler
      const clickableLayers = [LAYER_HOOG, LAYER_MIDDEL, LAYER_LAAG];
      clickableLayers.forEach((layerId) => {
        map.on("click", layerId, (e) => {
          const feature = e.features?.[0];
          if (!feature) return;

          const props = feature.properties as Record<string, unknown>;
          const vboFeature: VboFeature = {
            type: "Feature",
            geometry: feature.geometry,
            properties: {
              identificatie: String(props["identificatie"] ?? ""),
              status: String(props["status"] ?? ""),
              pandStatus: String(props["pandStatus"] ?? ""),
              pandIdentificatie: String(props["pandIdentificatie"] ?? ""),
              bagUri: String(props["bagUri"] ?? ""),
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

  // Keep building footprints aligned with the current viewport.
  // The gemeente selector only changes focus; panning/zooming updates context.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const loadViewportPanden = () => {
      const source = map.getSource(SOURCE_PANDEN) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!source) return;

      pandAbortRef.current?.abort();
      const controller = new AbortController();
      pandAbortRef.current = controller;

      fetchPandGeometries(getMapBBox(map), controller.signal)
        .then((pandFc) => {
          if (controller.signal.aborted) return;
          source.setData(pandFc);
        })
        .catch((err) => {
          if ((err as Error).name !== "AbortError") {
            console.error("BAG panden fetch fout:", err);
          }
        });
    };

    if (map.isStyleLoaded() && map.getSource(SOURCE_PANDEN)) {
      loadViewportPanden();
    } else {
      map.once("load", loadViewportPanden);
    }

    map.on("moveend", loadViewportPanden);

    return () => {
      pandAbortRef.current?.abort();
      map.off("moveend", loadViewportPanden);
      map.off("load", loadViewportPanden);
    };
  }, []);

  // Fly to gemeente on change and reload shortlist data
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const loadData = () => {
      if (controller.signal.aborted) return;

      map.flyTo({
        center: gemeente.centroid,
        zoom: gemeente.zoom,
        duration: 1200,
        essential: true,
      });

      onLoadStart();

      fetchAndScoreGemeente(gemeente, filters, controller.signal)
        .then((fc) => {
          if (controller.signal.aborted) return;

          const source = map.getSource(SOURCE_LEEGSTAND) as
            | maplibregl.GeoJSONSource
            | undefined;
          if (source) {
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
    };

    if (
      map.isStyleLoaded() &&
      map.getSource(SOURCE_LEEGSTAND)
    ) {
      loadData();
    } else {
      map.once("load", loadData);
    }

    return () => {
      controller.abort();
      map.off("load", loadData);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gemeente, filters]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (!selectedFeature || view3DNonce === 0) return;

    try {
      userBasemapRef.current = basemap;
      is3DModeRef.current = true;
      map.setLayoutProperty(LAYER_PERCELEN_3D, "visibility", "visible");
      applyBasemapMode(map, basemap === "brt" ? "hybrid" : basemap);
      map.easeTo({
        center: getFeatureCenter(selectedFeature),
        zoom: Math.max(map.getZoom(), 17.2),
        pitch: 62,
        bearing: -22,
        duration: 1400,
        essential: true,
      });
      containerRef.current?.focus();
    } catch {
      // Map may not be fully ready yet.
    }
  }, [selectedFeature, view3DNonce]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (selectedFeature) return;

    try {
      is3DModeRef.current = false;
      map.setLayoutProperty(LAYER_PERCELEN_3D, "visibility", "none");
      applyBasemapMode(map, userBasemapRef.current);
      map.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 800,
        essential: true,
      });
    } catch {
      // Layer may not be ready yet.
    }
  }, [selectedFeature]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (!selectedFeature || rotate3DCommand.nonce === 0) return;

    if (rotate3DCommand.reset) {
      map.easeTo({
        center: getFeatureCenter(selectedFeature),
        zoom: Math.max(map.getZoom(), 17.2),
        pitch: 62,
        bearing: 0,
        duration: 700,
        essential: true,
      });
      is3DModeRef.current = true;
      return;
    }

    rotateMap(map, rotate3DCommand.delta);
    is3DModeRef.current = true;
  }, [rotate3DCommand, selectedFeature]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    userBasemapRef.current = basemap;
    applyBasemapMode(
      map,
      is3DModeRef.current && basemap === "brt" ? "hybrid" : basemap,
    );
  }, [basemap]);

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
      LAYER_PERCELEN_3D,
      "visibility",
      visibility(layers.percelen) === "visible" && selectedFeature
        ? "visible"
        : "none",
    );
    map.setLayoutProperty(
      LAYER_HOOG_OUTLINE,
      "visibility",
      visibility(layers.hoog || layers.middel),
    );
  }, [layers, selectedFeature]);

  // Update selected feature outline
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    try {
      map.setPaintProperty(LAYER_HOOG_OUTLINE, "circle-stroke-color", [
        "case",
        ["==", ["get", "identificatie"], selectedFeatureId ?? "__none__"],
        COLORS.selected,
        ["==", ["get", "score_tier"], "hoog"],
        COLORS.hoog,
        COLORS.middel,
      ]);
      map.setPaintProperty(LAYER_HOOG_OUTLINE, "circle-stroke-width", [
        "case",
        ["==", ["get", "identificatie"], selectedFeatureId ?? "__none__"],
        3,
        1.5,
      ]);
      map.setPaintProperty(LAYER_HOOG_OUTLINE, "circle-radius", [
        "case",
        ["==", ["get", "identificatie"], selectedFeatureId ?? "__none__"],
        12,
        ["==", ["get", "score_tier"], "hoog"],
        11,
        9,
      ]);
    } catch {
      // Layer may not be ready yet
    }
  }, [selectedFeatureId]);

  const handleContainerClick = useCallback(() => {
    popupRef.current?.remove();
  }, []);

  const handleContainerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const map = mapRef.current;
      if (!map || !selectedFeature || !is3DModeRef.current) return;

      if (
        event.key === "q" ||
        event.key === "Q" ||
        event.key === "ArrowLeft"
      ) {
        event.preventDefault();
        rotateMap(map, 18);
      } else if (
        event.key === "e" ||
        event.key === "E" ||
        event.key === "ArrowRight"
      ) {
        event.preventDefault();
        rotateMap(map, -18);
      } else if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        map.easeTo({
          center: getFeatureCenter(selectedFeature),
          zoom: Math.max(map.getZoom(), 17.2),
          pitch: 62,
          bearing: 0,
          duration: 700,
          essential: true,
        });
      }
    },
    [selectedFeature],
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      const map = mapRef.current;
      if (!map || !selectedFeature || !is3DModeRef.current) return;
      if (!event.shiftKey) return;

      event.preventDefault();
      const delta = Math.abs(event.deltaY) > 0 ? event.deltaY : event.deltaX;
      rotateMap(map, delta > 0 ? -8 : 8);
    },
    [selectedFeature],
  );

  return (
    <div
      ref={containerRef}
      className={styles.canvas}
      onClick={handleContainerClick}
      onKeyDown={handleContainerKeyDown}
      onWheel={handleWheel}
      role="application"
      aria-label="Leegstandskaart"
      tabIndex={0}
    />
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addCircleLayer(
  map: maplibregl.Map,
  id: string,
  color: string,
  radius: number,
  source: string,
  tier: string,
) {
  map.addLayer({
    id,
    type: "circle",
    source,
    paint: {
      "circle-color": color,
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        radius * 0.75,
        15,
        radius,
      ],
      "circle-opacity": 0.85,
      "circle-stroke-color": "#0d1117",
      "circle-stroke-width": 1,
    },
    filter: ["==", ["get", "score_tier"], tier],
  });
}

function getMapBBox(map: maplibregl.Map): Gemeente["bbox"] {
  const bounds = map.getBounds();
  return [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth(),
  ];
}

function rotateMap(map: maplibregl.Map, delta: number) {
  map.easeTo({
    bearing: map.getBearing() + delta,
    duration: 350,
    essential: true,
  });
}

function getFeatureCenter(feature: VboFeature): [number, number] {
  const geometry = feature.geometry;
  if (geometry.type === "Point") {
    return geometry.coordinates as [number, number];
  }
  if (geometry.type === "GeometryCollection") {
    const coords: [number, number][] = [];
    for (const child of geometry.geometries) {
      if ("coordinates" in child) {
        collectCoordinates(child.coordinates, coords);
      }
    }
    if (coords.length > 0) {
      const [sumLng, sumLat] = coords.reduce(
        ([lngAcc, latAcc], [lng, lat]) => [lngAcc + lng, latAcc + lat],
        [0, 0],
      );
      return [sumLng / coords.length, sumLat / coords.length];
    }
    return [0, 0];
  }

  const coords: [number, number][] = [];
  collectCoordinates(geometry.coordinates, coords);
  if (coords.length === 0) {
    return [0, 0];
  }

  const [sumLng, sumLat] = coords.reduce(
    ([lngAcc, latAcc], [lng, lat]) => [lngAcc + lng, latAcc + lat],
    [0, 0],
  );
  return [sumLng / coords.length, sumLat / coords.length];
}

function collectCoordinates(
  value: unknown,
  acc: [number, number][],
): void {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    acc.push([value[0], value[1]]);
    return;
  }
  for (const item of value) {
    collectCoordinates(item, acc);
  }
}

function buildDarkStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      [SOURCE_BRT]: {
        type: "raster",
        tiles: [
          "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution: "© Kadaster / PDOK",
        maxzoom: 19,
      },
      [SOURCE_LUCHTFOTO]: {
        type: "raster",
        tiles: [
          "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg",
        ],
        tileSize: 256,
        attribution: "© PDOK / Kadaster",
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
        id: LAYER_LUCHTFOTO,
        type: "raster",
        source: SOURCE_LUCHTFOTO,
        layout: {
          visibility: "none",
        },
        paint: {
          "raster-opacity": 1,
          "raster-saturation": 0.1,
          "raster-contrast": 0.05,
        },
      },
      {
        id: LAYER_BRT,
        type: "raster",
        source: SOURCE_BRT,
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

function applyBasemapMode(map: maplibregl.Map, basemap: BasemapMode) {
  const visible = "visible" as const;
  const none = "none" as const;

  map.setLayoutProperty(
    LAYER_BRT,
    "visibility",
    basemap === "luchtfoto" ? none : visible,
  );
  map.setPaintProperty(
    LAYER_BRT,
    "raster-opacity",
    basemap === "hybrid" ? 0.68 : 0.18,
  );
  map.setPaintProperty(
    LAYER_BRT,
    "raster-brightness-max",
    basemap === "hybrid" ? 0.9 : 0.3,
  );
  map.setPaintProperty(
    LAYER_BRT,
    "raster-saturation",
    basemap === "hybrid" ? -0.2 : -1,
  );

  map.setLayoutProperty(
    LAYER_LUCHTFOTO,
    "visibility",
    basemap === "brt" ? none : visible,
  );
  map.setPaintProperty(
    LAYER_LUCHTFOTO,
    "raster-opacity",
    basemap === "hybrid" ? 0.92 : 1,
  );
  map.setPaintProperty(
    LAYER_LUCHTFOTO,
    "raster-saturation",
    basemap === "hybrid" ? 0.18 : 0.1,
  );
  map.setPaintProperty(
    LAYER_LUCHTFOTO,
    "raster-contrast",
    basemap === "hybrid" ? 0.12 : 0.05,
  );
}
