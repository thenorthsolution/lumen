"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Gemeente } from "@lumen/pdok-client";
import type { FilterSpecification } from "maplibre-gl";
import type {
  AiSearchHit,
  BasemapMode,
  LayerVisibility,
  FilterState,
  VboFeature,
  VboFeatureCollection,
} from "./AppShell";
import { fetchPandGeometries } from "@/lib/bag-fetch";
import styles from "./MapCanvas.module.css";

// MapLibre source/layer IDs
const SOURCE_LEEGSTAND = "leegstand";
const SOURCE_PANDEN = "panden";
const SOURCE_AI_RESULTS = "ai-results";
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
const LAYER_AI_RESULTS = "ai-results-points";

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
  isLoading: boolean;
  aiSearchResults: AiSearchHit[];
  selectedFeature: VboFeature | null;
  selectedFeatureId: string | null;
  focusSelectedNonce: number;
  view3DNonce: number;
  rotate3DCommand: {
    nonce: number;
    delta: number;
    reset?: boolean;
  };
  detailLoadState: {
    visible: boolean;
    step: number;
    total: number;
    status: string;
    tier: string;
  };
  aiSearchState: {
    loading: boolean;
    query: string;
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
  isLoading,
  aiSearchResults,
  selectedFeature,
  selectedFeatureId,
  focusSelectedNonce,
  view3DNonce,
  rotate3DCommand,
  detailLoadState,
  aiSearchState,
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
  const last2DViewRef = useRef<{
    center: [number, number];
    zoom: number;
  } | null>(null);
  const [is3DActive, setIs3DActive] = useState(false);
  const [selectionPopoverPos, setSelectionPopoverPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [scanPopovers, setScanPopovers] = useState<
    Array<{
      id: string;
      lngLat: [number, number];
      label: string;
      phase: string;
      compact?: boolean;
    }>
  >([]);
  const [cityLoadDots, setCityLoadDots] = useState<
    Array<{ id: string; lngLat: [number, number] }>
  >([]);

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
      map.addSource(SOURCE_AI_RESULTS, {
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
      map.addLayer({
        id: LAYER_AI_RESULTS,
        type: "circle",
        source: SOURCE_AI_RESULTS,
        paint: {
          "circle-color": "#58a6ff",
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            6,
            16,
            10,
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.92,
        },
      });

      // Click handler
      const clickableLayers = [
        LAYER_HOOG,
        LAYER_MIDDEL,
        LAYER_LAAG,
        LAYER_AI_RESULTS,
      ];
      clickableLayers.forEach((layerId) => {
        map.on("click", layerId, (e) => {
          const feature = e.features?.[0];
          if (!feature) return;

          const props = feature.properties as Record<string, unknown>;
          if (layerId === LAYER_AI_RESULTS) {
            onFeatureSelect(aiResultPropsToFeature(feature.geometry, props));
            return;
          }

          const vboFeature: VboFeature = {
            type: "Feature",
            geometry: feature.geometry,
            properties: {
              identificatie: String(props["identificatie"] ?? ""),
              status: String(props["status"] ?? ""),
              pandStatus: String(props["pandStatus"] ?? ""),
              pandIdentificatie: String(props["pandIdentificatie"] ?? ""),
              bagUri: String(props["bagUri"] ?? ""),
              openbareruimtenaam: String(props["openbareruimtenaam"] ?? ""),
              huisnummer: String(props["huisnummer"] ?? ""),
              huisletter: String(props["huisletter"] ?? ""),
              huisnummertoevoeging: String(
                props["huisnummertoevoeging"] ?? "",
              ),
              postcode: String(props["postcode"] ?? ""),
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

      const url = new URL("/api/shortlist", window.location.origin);
      url.searchParams.set("gemeenteCode", gemeente.code);
      url.searchParams.set("bouwjaarMin", String(filters.bouwjaarMin));
      url.searchParams.set("oppervlakteMin", String(filters.oppervlakteMin));
      url.searchParams.set("gebruiksdoelen", filters.gebruiksdoelen.join(","));
      url.searchParams.set("vboStatuses", filters.vboStatuses.join(","));
      url.searchParams.set("pandStatuses", filters.pandStatuses.join(","));

      fetch(url.toString(), { signal: controller.signal })
        .then(async (response) => {
          const payload = (await response.json()) as {
            error?: string;
            featureCollection?: VboFeatureCollection;
          };
          if (!response.ok || !payload.featureCollection) {
            throw new Error(payload.error || "Shortlist kon niet worden geladen.");
          }
          return payload.featureCollection;
        })
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
      if (!is3DModeRef.current) {
        const center = map.getCenter();
        last2DViewRef.current = {
          center: [center.lng, center.lat],
          zoom: map.getZoom(),
        };
      }
      userBasemapRef.current = basemap;
      is3DModeRef.current = true;
      setIs3DActive(true);
      map.setLayoutProperty(LAYER_PERCELEN_3D, "visibility", "visible");
      applyBasemapMode(map, "luchtfoto", true);
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
      setIs3DActive(false);
      map.setLayoutProperty(LAYER_PERCELEN_3D, "visibility", "none");
      applyBasemapMode(map, userBasemapRef.current, false);
      const restoreView = last2DViewRef.current;
      map.easeTo({
        ...(restoreView ? { center: restoreView.center } : {}),
        zoom: restoreView
          ? Math.max(restoreView.zoom - 0.4, 14)
          : Math.max(map.getZoom() - 1.2, 14),
        pitch: 0,
        bearing: 0,
        duration: 950,
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
      setIs3DActive(true);
      return;
    }

    rotateMap(map, rotate3DCommand.delta);
    is3DModeRef.current = true;
    setIs3DActive(true);
  }, [rotate3DCommand, selectedFeature]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    userBasemapRef.current = basemap;
    applyBasemapMode(map, basemap, is3DModeRef.current);
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
    map.setFilter(
      LAYER_HOOG_OUTLINE,
      buildOutlineFilter({
        selectedFeatureId,
        showHoog: layers.hoog,
        showMiddel: layers.middel,
      }),
    );
  }, [layers, selectedFeature, selectedFeatureId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource(SOURCE_AI_RESULTS) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    source.setData({
      type: "FeatureCollection",
      features: aiSearchResults.map((hit) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [hit.lon, hit.lat],
        },
        properties: {
          identificatie: hit.vbo_identificatie || hit.id,
          status: hit.status || "",
          pandStatus: hit.pand_status || "",
          pandIdentificatie: hit.pand_identificatie || "",
          openbareruimtenaam: "",
          huisnummer: "",
          huisletter: "",
          huisnummertoevoeging: "",
          postcode: "",
          gebruiksdoel: hit.gebruiksdoel || "",
          oppervlakte: hit.oppervlakte || 0,
          bouwjaar: hit.bouwjaar || 0,
          woonplaatsnaam: hit.woonplaatsnaam || hit.gemeente_name || "",
        },
      })),
    });
  }, [aiSearchResults]);

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (!selectedFeature || focusSelectedNonce === 0) return;

    map.easeTo({
      center: getFeatureCenter(selectedFeature),
      zoom: Math.max(map.getZoom(), 16.8),
      duration: 900,
      essential: true,
    });
  }, [selectedFeature, focusSelectedNonce]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedFeature || !detailLoadState.visible || is3DActive) {
      setSelectionPopoverPos(null);
      return;
    }

    const updatePosition = () => {
      const point = map.project(getFeatureCenter(selectedFeature));
      setSelectionPopoverPos({ x: point.x, y: point.y });
    };

    updatePosition();
    map.on("move", updatePosition);
    map.on("zoom", updatePosition);
    map.on("rotate", updatePosition);

    return () => {
      map.off("move", updatePosition);
      map.off("zoom", updatePosition);
      map.off("rotate", updatePosition);
    };
  }, [detailLoadState.visible, is3DActive, selectedFeature]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !aiSearchState.loading) {
      setScanPopovers([]);
      return;
    }

    const labels = [
      "Lumen verzamelt info",
      "Scannen",
      "Indexeren",
      "Zoeken",
      "Rangschikken",
    ] as const;
    const phases = [
      "kaart",
      "BAG",
      "semantiek",
      "score",
      "context",
    ] as const;

    const buildScanPopovers = () => {
      const bounds = map.getBounds();
      const next = Array.from({ length: 11 }).map((_, index) => {
        const label = labels[index % labels.length] ?? "Scannen";
        const phase = phases[index % phases.length] ?? "kaart";
        const xFactor = 0.06 + Math.random() * 0.88;
        const yFactor =
          index < 4
            ? 0.04 + Math.random() * 0.2
            : 0.08 + Math.random() * 0.82;
        const lng =
          bounds.getWest() + (bounds.getEast() - bounds.getWest()) * xFactor;
        const lat =
          bounds.getSouth() + (bounds.getNorth() - bounds.getSouth()) * yFactor;
        return {
          id: `scan-${index}-${Date.now()}`,
          lngLat: [lng, lat] as [number, number],
          label,
          phase,
          compact: index > 2,
        };
      });
      setScanPopovers(next);
    };

    buildScanPopovers();
    const interval = window.setInterval(buildScanPopovers, 520);
    return () => window.clearInterval(interval);
  }, [aiSearchState.loading]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoading) {
      setCityLoadDots([]);
      return;
    }

    const buildCityDots = () => {
      const bounds = map.getBounds();
      const next = Array.from({ length: 18 }).map((_, index) => ({
        id: `city-load-${index}-${Date.now()}`,
        lngLat: [
          bounds.getWest() + (bounds.getEast() - bounds.getWest()) * (0.04 + Math.random() * 0.92),
          bounds.getSouth() + (bounds.getNorth() - bounds.getSouth()) * (0.04 + Math.random() * 0.92),
        ] as [number, number],
      }));
      setCityLoadDots(next);
    };

    buildCityDots();
    const interval = window.setInterval(buildCityDots, 380);
    return () => window.clearInterval(interval);
  }, [isLoading]);

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

  const handleRotateLeft = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    rotateMap(map, 25);
    is3DModeRef.current = true;
    setIs3DActive(true);
  }, []);

  const handleRotateRight = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    rotateMap(map, -25);
    is3DModeRef.current = true;
    setIs3DActive(true);
  }, []);

  const handleReset3D = useCallback(() => {
    const map = mapRef.current;
    if (!map || !selectedFeature) return;

    map.easeTo({
      center: getFeatureCenter(selectedFeature),
      zoom: Math.max(map.getZoom(), 17.2),
      pitch: 62,
      bearing: 0,
      duration: 700,
      essential: true,
    });
    is3DModeRef.current = true;
    setIs3DActive(true);
  }, [selectedFeature]);

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
    >
      {selectionPopoverPos && selectedFeature && detailLoadState.visible ? (
        <div
          className={styles.selectionPopover}
          style={{
            left: selectionPopoverPos.x,
            top: selectionPopoverPos.y,
          }}
        >
          <div className={styles.selectionPopoverCard}>
            <div className={styles.selectionPopoverHeader}>
              <span className={styles.selectionPopoverIcon} aria-hidden>
                {detailLoadState.tier === "hoog"
                  ? "▲"
                  : detailLoadState.tier === "middel"
                    ? "◆"
                    : "●"}
              </span>
              <span className={styles.selectionPopoverTier}>
                {detailLoadState.tier === "hoog"
                  ? "HOOG POTENTIEEL"
                  : detailLoadState.tier === "middel"
                    ? "MIDDEL POTENTIEEL"
                    : "POTENTIEEL SCAN"}
              </span>
            </div>
            <p className={styles.selectionPopoverLead}>
              Lumen verzamelt informatie
            </p>
            <p className={styles.selectionPopoverStatus}>
              {detailLoadState.status || "Pulling data"}
            </p>
            <div className={styles.selectionPopoverSteps} aria-hidden>
              {Array.from({ length: detailLoadState.total }).map((_, index) => (
                <span
                  key={index}
                  className={`${styles.selectionPopoverStep} ${
                    index < detailLoadState.step
                      ? styles.selectionPopoverStepActive
                      : ""
                  }`}
                />
              ))}
            </div>
          </div>
          <span className={styles.selectionPopoverPin} />
        </div>
      ) : null}

      {scanPopovers.map((popover) => {
        const point = mapRef.current?.project(popover.lngLat);
        if (!point) return null;
        return (
          <div
            key={popover.id}
            className={`${styles.scanPopover} ${
              popover.compact ? styles.scanPopoverCompact : ""
            }`}
            style={{ left: point.x, top: point.y }}
          >
            <span className={styles.scanPopoverDot} />
            <span className={styles.scanPopoverLabel}>
              {popover.label} · {popover.phase}
            </span>
          </div>
        );
      })}

      {cityLoadDots.map((dot) => {
        const point = mapRef.current?.project(dot.lngLat);
        if (!point) return null;
        return (
          <span
            key={dot.id}
            className={styles.cityLoadDot}
            style={{ left: point.x, top: point.y }}
          />
        );
      })}

      {selectedFeature && is3DActive ? (
        <div className={styles.mapControls}>
          <button
            type="button"
            className={styles.mapControlButton}
            onClick={handleRotateLeft}
          >
            Draai links
          </button>
          <button
            type="button"
            className={styles.mapControlButton}
            onClick={handleReset3D}
          >
            Reset
          </button>
          <button
            type="button"
            className={styles.mapControlButton}
            onClick={handleRotateRight}
          >
            Draai rechts
          </button>
        </div>
      ) : null}
    </div>
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

function aiResultPropsToFeature(
  geometry: GeoJSON.Geometry,
  props: Record<string, unknown>,
): VboFeature {
  return {
    type: "Feature",
    geometry,
    properties: {
      identificatie: String(props["identificatie"] ?? ""),
      status: String(props["status"] ?? ""),
      pandStatus: String(props["pandStatus"] ?? ""),
      pandIdentificatie: String(props["pandIdentificatie"] ?? ""),
      openbareruimtenaam: String(props["openbareruimtenaam"] ?? ""),
      huisnummer: String(props["huisnummer"] ?? ""),
      huisletter: String(props["huisletter"] ?? ""),
      huisnummertoevoeging: String(props["huisnummertoevoeging"] ?? ""),
      postcode: String(props["postcode"] ?? ""),
      gebruiksdoel: String(props["gebruiksdoel"] ?? ""),
      oppervlakte: Number(props["oppervlakte"] ?? 0),
      bouwjaar: Number(props["bouwjaar"] ?? 0),
      woonplaatsnaam: String(props["woonplaatsnaam"] ?? ""),
    },
  };
}

function buildOutlineFilter({
  selectedFeatureId,
  showHoog,
  showMiddel,
}: {
  selectedFeatureId: string | null;
  showHoog: boolean;
  showMiddel: boolean;
}): FilterSpecification {
  const filters: unknown[] = [];

  if (showHoog) {
    filters.push(["==", ["get", "score_tier"], "hoog"]);
  }
  if (showMiddel) {
    filters.push(["==", ["get", "score_tier"], "middel"]);
  }
  if (selectedFeatureId) {
    filters.push(["==", ["get", "identificatie"], selectedFeatureId]);
  }

  if (filters.length === 0) {
    return ["==", ["get", "identificatie"], "__none__"] as FilterSpecification;
  }

  return ["any", ...filters] as FilterSpecification;
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

function applyBasemapMode(
  map: maplibregl.Map,
  basemap: BasemapMode,
  forceDark = false,
) {
  const visible = "visible" as const;
  const none = "none" as const;
  const darkBrt = forceDark && basemap === "brt";

  map.setLayoutProperty(
    LAYER_BRT,
    "visibility",
    basemap === "luchtfoto" ? none : visible,
  );
  map.setPaintProperty(
    LAYER_BRT,
    "raster-opacity",
    basemap === "hybrid" ? 0.54 : darkBrt ? 0.24 : 0.28,
  );
  map.setPaintProperty(
    LAYER_BRT,
    "raster-brightness-max",
    basemap === "hybrid" ? 0.66 : darkBrt ? 0.34 : 0.34,
  );
  map.setPaintProperty(
    LAYER_BRT,
    "raster-brightness-min",
    basemap === "hybrid" ? 0.04 : darkBrt ? 0.02 : 0.02,
  );
  map.setPaintProperty(
    LAYER_BRT,
    "raster-saturation",
    basemap === "hybrid" ? -0.2 : -1,
  );
  map.setPaintProperty(
    LAYER_BRT,
    "raster-contrast",
    basemap === "hybrid" ? 0.24 : darkBrt ? 0.28 : 0.28,
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
