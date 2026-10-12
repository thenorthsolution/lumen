"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Gemeente } from "@lumen/pdok-client";
import type { ExpressionSpecification, FilterSpecification } from "maplibre-gl";
import type {
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
const SOURCE_BUURTEN = "buurten";
const SOURCE_BRT = "brt";
const SOURCE_LUCHTFOTO = "luchtfoto";
const LAYER_BRT = "brt-tiles";
const LAYER_LUCHTFOTO = "luchtfoto-tiles";
const LAYER_BUURTEN_FILL = "buurten-fill";
const LAYER_BUURTEN_LINE = "buurten-line";
const LAYER_BUURTEN_LABEL = "buurten-label";
const LAYER_HOOG = "leegstand-hoog";
const LAYER_MIDDEL = "leegstand-middel";
const LAYER_LAAG = "leegstand-laag";
const LAYER_PERCELEN = "leegstand-percelen";
const LAYER_PERCELEN_3D = "leegstand-percelen-3d";
const LAYER_PERCELEN_3D_TEXTURE = "leegstand-percelen-3d-texture";
const LAYER_HOOG_OUTLINE = "leegstand-hoog-outline";
const HUISDB_3D_ZOOM = 16.85;
const HUISDB_3D_PITCH = 50;
const HUISDB_3D_BEARING = -16;
const HUISDB_2D_BEARING = -12;
const DETAIL_OBJECT_ZOOM = 16.15;
const MIN_PAND_FETCH_ZOOM = DETAIL_OBJECT_ZOOM;
const INITIAL_SHORTLIST_DELAY_MS = 900;
const SHORTLIST_DEBOUNCE_MS = 240;
const PAND_FETCH_DEBOUNCE_MS = 180;
const NEIGHBORHOOD_FETCH_DEBOUNCE_MS = 260;
const VIEWPORT_INDEX_LIMIT = 500;
const NEIGHBORHOOD_INDEX_LIMIT = 180;
const MIN_FOCUSED_ZOOM = 14.25;
const GEMEENTE_FOCUSED_VIEW: Record<
  string,
  { center: [number, number]; zoom: number }
> = {
  "0150": {
    center: [6.1609, 52.2545],
    zoom: 14.75,
  },
};
const EMPTY_GEOJSON: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};
const EMPTY_VBO_COLLECTION: VboFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

// MapLibre paint properties do NOT support CSS variables — use resolved hex values
const COLORS = {
  hoog: "#3fb950",
  middel: "#d29922",
  laag: "#24476f",
  selected: "#58a6ff",
};

interface MapCanvasProps {
  gemeente: Gemeente;
  basemap: BasemapMode;
  layers: LayerVisibility;
  filters: FilterState;
  isLoading: boolean;
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
  selectedFeature,
  selectedFeatureId,
  focusSelectedNonce,
  view3DNonce,
  rotate3DCommand,
  detailLoadState,
  onFeatureSelect,
  onDataLoaded,
  onLoadStart,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pandAbortRef = useRef<AbortController | null>(null);
  const neighborhoodAbortRef = useRef<AbortController | null>(null);
  const viewportIndexAbortRef = useRef<AbortController | null>(null);
  const pandFetchTimerRef = useRef<number | null>(null);
  const neighborhoodFetchTimerRef = useRef<number | null>(null);
  const hoveredNeighborhoodIdRef = useRef<string | number | null>(null);
  const hasRequestedShortlistRef = useRef(false);
  const lastGemeenteCodeRef = useRef<string | null>(null);
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
  const [cityLoadDots, setCityLoadDots] = useState<
    Array<{ id: string; lngLat: [number, number] }>
  >([]);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<{
    code: string;
    name: string;
  } | null>(null);

  const exitThreeDMode = useCallback(
    (map: maplibregl.Map, duration = 950) => {
      if (!map.isStyleLoaded()) return;
      if (
        !is3DModeRef.current &&
        map.getPitch() <= 0.1 &&
        Math.abs(map.getBearing()) <= 0.1
      ) {
        return;
      }

      const restoreView = last2DViewRef.current;

      try {
        map.stop();
        is3DModeRef.current = false;
        setIs3DActive(false);
        map.setLayoutProperty(LAYER_PERCELEN_3D, "visibility", "none");
        map.setLayoutProperty(LAYER_PERCELEN_3D_TEXTURE, "visibility", "none");
        applyBasemapMode(map, userBasemapRef.current, false);
        map.easeTo({
          ...(restoreView ? { center: restoreView.center } : {}),
          zoom: restoreView
            ? Math.max(restoreView.zoom - 0.4, 14)
            : Math.max(map.getZoom() - 1.2, 14),
          pitch: 0,
          bearing: HUISDB_2D_BEARING,
          duration,
          essential: true,
        });
      } catch {
        // Map may not be fully ready yet.
      }
    },
    [],
  );

  // Initialise map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initialView = getFocusedGemeenteView(gemeente);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildDarkStyle(),
      center: initialView.center,
      zoom: initialView.zoom,
      bearing: HUISDB_2D_BEARING,
      pitch: 0,
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
      applyBasemapMode(map, userBasemapRef.current, false);

      map.addSource(SOURCE_PANDEN, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addSource(SOURCE_BUURTEN, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        promoteId: "buurtCode",
      });
      // Add empty source — data loaded separately
      map.addSource(SOURCE_LEEGSTAND, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        generateId: true,
      });

      map.addLayer({
        id: LAYER_BUURTEN_FILL,
        type: "fill",
        source: SOURCE_BUURTEN,
        minzoom: 10,
        maxzoom: 16,
        paint: {
          "fill-color": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            "#f6e7a6",
            ["==", ["get", "buurtCode"], selectedNeighborhood?.code ?? ""],
            "#efe2a4",
            "#e9e2d4",
          ],
          "fill-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            0.28,
            13,
            0.2,
            15.8,
            0.1,
          ],
        },
      });
      map.addLayer({
        id: LAYER_BUURTEN_LINE,
        type: "line",
        source: SOURCE_BUURTEN,
        minzoom: 10,
        maxzoom: 16.6,
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            "#c18a16",
            ["==", ["get", "buurtCode"], selectedNeighborhood?.code ?? ""],
            "#456f9d",
            "#6f86a8",
          ],
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            0.82,
            15.5,
            0.58,
          ],
          "line-width": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            2.2,
            ["==", ["get", "buurtCode"], selectedNeighborhood?.code ?? ""],
            2.1,
            [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              0.9,
              14,
              1.25,
              16,
              1.5,
            ],
          ],
        },
      });
      map.addLayer({
        id: LAYER_BUURTEN_LABEL,
        type: "symbol",
        source: SOURCE_BUURTEN,
        minzoom: 11,
        maxzoom: 16.1,
        layout: {
          "text-field": [
            "format",
            ["get", "buurtNaam"],
            {
              "font-scale": 1,
              "text-font": ["literal", ["Open Sans Bold"]],
            },
          ],
          "text-font": ["Open Sans Bold"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11,
            12,
            14,
            13.8,
            16,
            15,
          ],
          "text-line-height": 1.04,
          "text-max-width": 12,
          "text-allow-overlap": false,
          "text-ignore-placement": false,
          "text-padding": 6,
        },
        paint: {
          "text-color": "#344258",
          "text-halo-color": "rgba(255, 255, 255, 0.92)",
          "text-halo-width": 1.8,
          "text-halo-blur": 0.25,
          "text-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11,
            0.8,
            14.5,
            0.98,
          ],
        },
      });

      map.addLayer({
        id: LAYER_PERCELEN,
        type: "fill",
        source: SOURCE_PANDEN,
        minzoom: DETAIL_OBJECT_ZOOM,
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
        minzoom: DETAIL_OBJECT_ZOOM,
        layout: {
          visibility: "none",
        },
        paint: {
          "fill-extrusion-color": buildTexturedClayColorExpression(),
          "fill-extrusion-opacity": 1,
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
      map.addLayer({
        id: LAYER_PERCELEN_3D_TEXTURE,
        type: "line",
        source: SOURCE_PANDEN,
        minzoom: DETAIL_OBJECT_ZOOM,
        layout: {
          visibility: "none",
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": buildTexturedClayLineColorExpression(),
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            15,
            0.08,
            17,
            0.22,
            19,
            0.34,
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            15,
            0.35,
            17,
            0.75,
            19,
            1.35,
          ],
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
        [
          "in",
          ["get", "map_category"],
          ["literal", ["woning", "other"]],
        ] as FilterSpecification,
        true,
      );
      addCircleLayer(
        map,
        LAYER_MIDDEL,
        COLORS.middel,
        7,
        SOURCE_LEEGSTAND,
        ["==", ["get", "map_category"], "status"] as FilterSpecification,
        false,
      );
      addCircleLayer(
        map,
        LAYER_HOOG,
        COLORS.hoog,
        9,
        SOURCE_LEEGSTAND,
        ["==", ["get", "map_category"], "candidate"] as FilterSpecification,
        false,
      );

      // Outline for selected / higher-scored objects
      map.addLayer({
        id: LAYER_HOOG_OUTLINE,
        type: "circle",
        source: SOURCE_LEEGSTAND,
        minzoom: DETAIL_OBJECT_ZOOM,
        paint: {
          "circle-color": "transparent",
          "circle-stroke-color": [
            "case",
            ["==", ["get", "identificatie"], selectedFeatureId ?? ""],
            COLORS.selected,
            ["==", ["get", "map_category"], "candidate"],
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
            ["==", ["get", "map_category"], "candidate"],
            11,
            9,
          ],
          "circle-opacity": 1,
        },
        filter: [
          "in",
          ["get", "map_category"],
          ["literal", ["candidate", "status"]],
        ],
      });
      // Click handler
      const clickableLayers = [
        LAYER_HOOG,
        LAYER_MIDDEL,
        LAYER_LAAG,
      ];
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
              mapCategory: normalizeMapCategory(props["map_category"]),
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

      const clickableNeighborhoodLayers = [
        LAYER_BUURTEN_LABEL,
        LAYER_BUURTEN_FILL,
      ];
      clickableNeighborhoodLayers.forEach((layerId) => {
        map.on("click", layerId, (e) => {
          const feature = e.features?.[0];
          if (!feature) return;

          const props = feature.properties as Record<string, unknown>;
          const code = String(props["buurtCode"] ?? props["statcode"] ?? "");
          const name = String(props["buurtNaam"] ?? props["statnaam"] ?? "Buurt");
          const bbox = computeFeatureBbox(feature.geometry);
          setSelectedNeighborhood({ code, name });
          onFeatureSelect(null);

          if (bbox) {
            map.fitBounds(
              [
                [bbox[0], bbox[1]],
                [bbox[2], bbox[3]],
              ],
              {
                padding: { top: 72, right: 360, bottom: 88, left: 360 },
                maxZoom: 16.6,
                bearing: HUISDB_2D_BEARING,
                duration: 760,
                essential: true,
              },
            );
          }
        });
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mousemove", layerId, (e) => {
          const featureId = e.features?.[0]?.id;
          if (featureId == null) return;
          if (hoveredNeighborhoodIdRef.current === featureId) return;

          if (hoveredNeighborhoodIdRef.current != null) {
            map.setFeatureState(
              {
                source: SOURCE_BUURTEN,
                id: hoveredNeighborhoodIdRef.current,
              },
              { hover: false },
            );
          }
          hoveredNeighborhoodIdRef.current = featureId;
          map.setFeatureState(
            { source: SOURCE_BUURTEN, id: featureId },
            { hover: true },
          );
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
          if (hoveredNeighborhoodIdRef.current != null) {
            map.setFeatureState(
              {
                source: SOURCE_BUURTEN,
                id: hoveredNeighborhoodIdRef.current,
              },
              { hover: false },
            );
            hoveredNeighborhoodIdRef.current = null;
          }
        });
      });

      // Click on empty space deselects
      map.on("click", (e) => {
        if (is3DModeRef.current) {
          exitThreeDMode(map, 820);
          onFeatureSelect(null);
          return;
        }

        const features = map.queryRenderedFeatures(e.point, {
          layers: [...clickableLayers, ...clickableNeighborhoodLayers],
        });
        if (features.length === 0) {
          onFeatureSelect(null);
          setSelectedNeighborhood(null);
        }
      });
    });

    mapRef.current = map;

    return () => {
      neighborhoodAbortRef.current?.abort();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exitThreeDMode, onFeatureSelect]);

  // Keep building footprints aligned with the current viewport.
  // The gemeente selector only changes focus; panning/zooming updates context.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const loadViewportPanden = () => {
      if (pandFetchTimerRef.current !== null) {
        window.clearTimeout(pandFetchTimerRef.current);
      }

      pandFetchTimerRef.current = window.setTimeout(() => {
        pandFetchTimerRef.current = null;

        const source = map.getSource(SOURCE_PANDEN) as
          | maplibregl.GeoJSONSource
          | undefined;
        if (!source) return;

        if (map.getZoom() < MIN_PAND_FETCH_ZOOM) {
          pandAbortRef.current?.abort();
          source.setData(EMPTY_GEOJSON);
          return;
        }

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
      }, PAND_FETCH_DEBOUNCE_MS);
    };

    if (map.isStyleLoaded() && map.getSource(SOURCE_PANDEN)) {
      loadViewportPanden();
    } else {
      map.once("load", loadViewportPanden);
    }

    map.on("moveend", loadViewportPanden);

    return () => {
      if (pandFetchTimerRef.current !== null) {
        window.clearTimeout(pandFetchTimerRef.current);
        pandFetchTimerRef.current = null;
      }
      pandAbortRef.current?.abort();
      map.off("moveend", loadViewportPanden);
      map.off("load", loadViewportPanden);
    };
  }, []);

  // Keep CBS buurt polygons in sync with the current viewport.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const loadViewportNeighborhoods = () => {
      if (neighborhoodFetchTimerRef.current !== null) {
        window.clearTimeout(neighborhoodFetchTimerRef.current);
      }

      neighborhoodFetchTimerRef.current = window.setTimeout(() => {
        neighborhoodFetchTimerRef.current = null;

        const source = map.getSource(SOURCE_BUURTEN) as
          | maplibregl.GeoJSONSource
          | undefined;
        if (!source) return;

        neighborhoodAbortRef.current?.abort();
        const controller = new AbortController();
        neighborhoodAbortRef.current = controller;

        const url = new URL("/api/neighborhoods", window.location.origin);
        url.searchParams.set("bbox", getMapBBox(map).join(","));
        url.searchParams.set("limit", String(NEIGHBORHOOD_INDEX_LIMIT));

        fetch(url.toString(), { signal: controller.signal })
          .then(async (response) => {
            const payload = (await response.json()) as {
              error?: string;
              featureCollection?: GeoJSON.FeatureCollection;
            };
            if (!response.ok || !payload.featureCollection) {
              throw new Error(
                payload.error || "Buurten konden niet worden geladen.",
              );
            }
            return payload.featureCollection;
          })
          .then((featureCollection) => {
            if (controller.signal.aborted) return;
            source.setData(featureCollection);
          })
          .catch((err) => {
            if ((err as Error).name !== "AbortError") {
              console.error("CBS buurten fetch fout:", err);
            }
          });
      }, NEIGHBORHOOD_FETCH_DEBOUNCE_MS);
    };

    if (map.isStyleLoaded() && map.getSource(SOURCE_BUURTEN)) {
      loadViewportNeighborhoods();
    } else {
      map.once("load", loadViewportNeighborhoods);
    }

    map.on("moveend", loadViewportNeighborhoods);

    return () => {
      if (neighborhoodFetchTimerRef.current !== null) {
        window.clearTimeout(neighborhoodFetchTimerRef.current);
        neighborhoodFetchTimerRef.current = null;
      }
      neighborhoodAbortRef.current?.abort();
      map.off("moveend", loadViewportNeighborhoods);
      map.off("load", loadViewportNeighborhoods);
    };
  }, []);

  // Fly to gemeente on change and keep a lightweight viewport index in sync.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    let shortlistTimer: number | null = null;

    const loadViewportIndex = () => {
      if (controller.signal.aborted) return;

      const isGemeenteChange = lastGemeenteCodeRef.current !== gemeente.code;
      lastGemeenteCodeRef.current = gemeente.code;
      const source = map.getSource(SOURCE_LEEGSTAND) as
        | maplibregl.GeoJSONSource
        | undefined;

      if (map.getZoom() < DETAIL_OBJECT_ZOOM) {
        viewportIndexAbortRef.current?.abort();
        if (source) source.setData(EMPTY_GEOJSON);
        onDataLoaded(EMPTY_VBO_COLLECTION);
        return;
      }

      if (isGemeenteChange && source) {
        source.setData(EMPTY_GEOJSON);
      }

      const delay = hasRequestedShortlistRef.current
        ? SHORTLIST_DEBOUNCE_MS
        : INITIAL_SHORTLIST_DELAY_MS;
      hasRequestedShortlistRef.current = true;

      if (shortlistTimer !== null) {
        window.clearTimeout(shortlistTimer);
      }

      shortlistTimer = window.setTimeout(() => {
        if (controller.signal.aborted) return;

        onLoadStart();

        viewportIndexAbortRef.current?.abort();
        const requestController = new AbortController();
        viewportIndexAbortRef.current = requestController;

        const url = new URL("/api/shortlist-index", window.location.origin);
        url.searchParams.set("bbox", getMapBBox(map).join(","));
        url.searchParams.set("limit", String(VIEWPORT_INDEX_LIMIT));
        url.searchParams.set("bouwjaarMin", String(filters.bouwjaarMin));
        url.searchParams.set("oppervlakteMin", String(filters.oppervlakteMin));
        url.searchParams.set("gebruiksdoelen", filters.gebruiksdoelen.join(","));
        url.searchParams.set("vboStatuses", filters.vboStatuses.join(","));
        url.searchParams.set("pandStatuses", filters.pandStatuses.join(","));

        fetch(url.toString(), { signal: requestController.signal })
          .then(async (response) => {
            const payload = (await response.json()) as {
              error?: string;
              featureCollection?: VboFeatureCollection;
            };
            if (!response.ok || !payload.featureCollection) {
              throw new Error(
                payload.error || "Shortlist kon niet worden geladen.",
              );
            }
            return payload.featureCollection;
          })
          .then((fc) => {
            if (
              controller.signal.aborted ||
              requestController.signal.aborted
            ) {
              return;
            }

            const latestSource = map.getSource(SOURCE_LEEGSTAND) as
              | maplibregl.GeoJSONSource
              | undefined;
            if (latestSource) {
              const flat = {
                ...fc,
                features: fc.features.map((f) => ({
                  ...f,
                  properties: {
                    ...f.properties,
                    map_category: f.properties?.mapCategory ?? "other",
                    score_tier: f.properties?.score?.tier ?? "laag",
                    score: JSON.stringify(f.properties?.score),
                  },
                })),
              };
              latestSource.setData(flat);
            }

            onDataLoaded(fc);
          })
          .catch((err) => {
            if ((err as Error).name !== "AbortError") {
              console.error("BAG fetch fout:", err);
              onDataLoaded(EMPTY_VBO_COLLECTION);
            }
          });
      }, delay);
    };

    const focusGemeenteAndLoad = () => {
      const isGemeenteChange = lastGemeenteCodeRef.current !== gemeente.code;
      if (isGemeenteChange) {
        const focusedView = getFocusedGemeenteView(gemeente);
        const source = map.getSource(SOURCE_LEEGSTAND) as
          | maplibregl.GeoJSONSource
          | undefined;
        source?.setData(EMPTY_GEOJSON);
        lastGemeenteCodeRef.current = gemeente.code;

        const currentCenter = map.getCenter();
        const alreadyFocused =
          Math.abs(currentCenter.lng - focusedView.center[0]) < 0.0001 &&
          Math.abs(currentCenter.lat - focusedView.center[1]) < 0.0001 &&
          Math.abs(map.getZoom() - focusedView.zoom) < 0.05;

        if (alreadyFocused) {
          loadViewportIndex();
          return;
        }

        map.flyTo({
          center: focusedView.center,
          zoom: focusedView.zoom,
          bearing: HUISDB_2D_BEARING,
          pitch: 0,
          duration: 650,
          essential: true,
        });
        return;
      }

      loadViewportIndex();
    };

    map.on("moveend", loadViewportIndex);

    if (
      map.isStyleLoaded() &&
      map.getSource(SOURCE_LEEGSTAND)
    ) {
      focusGemeenteAndLoad();
    } else {
      map.once("load", focusGemeenteAndLoad);
    }

    return () => {
      if (shortlistTimer !== null) {
        window.clearTimeout(shortlistTimer);
      }
      viewportIndexAbortRef.current?.abort();
      controller.abort();
      map.off("load", focusGemeenteAndLoad);
      map.off("moveend", loadViewportIndex);
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
      map.setLayoutProperty(LAYER_PERCELEN_3D_TEXTURE, "visibility", "visible");
      applyBasemapMode(map, userBasemapRef.current, true);
      map.easeTo({
        center: getFeatureCenter(selectedFeature),
        zoom: Math.max(map.getZoom(), HUISDB_3D_ZOOM),
        pitch: HUISDB_3D_PITCH,
        bearing: HUISDB_3D_BEARING,
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

    exitThreeDMode(map);
  }, [exitThreeDMode, selectedFeature]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (!selectedFeature || rotate3DCommand.nonce === 0) return;

    if (rotate3DCommand.reset) {
      map.easeTo({
        center: getFeatureCenter(selectedFeature),
        zoom: Math.max(map.getZoom(), HUISDB_3D_ZOOM),
        pitch: HUISDB_3D_PITCH,
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
      LAYER_PERCELEN_3D_TEXTURE,
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

  // Update selected feature outline
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    try {
      map.setPaintProperty(LAYER_HOOG_OUTLINE, "circle-stroke-color", [
        "case",
        ["==", ["get", "identificatie"], selectedFeatureId ?? "__none__"],
        COLORS.selected,
        ["==", ["get", "map_category"], "candidate"],
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
        ["==", ["get", "map_category"], "candidate"],
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

    try {
      map.setPaintProperty(LAYER_BUURTEN_FILL, "fill-color", [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        "#f6e7a6",
        ["==", ["get", "buurtCode"], selectedNeighborhood?.code ?? "__none__"],
        "#efe2a4",
        "#e9e2d4",
      ]);
      map.setPaintProperty(LAYER_BUURTEN_LINE, "line-color", [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        "#c18a16",
        ["==", ["get", "buurtCode"], selectedNeighborhood?.code ?? "__none__"],
        "#456f9d",
        "#6f86a8",
      ]);
      map.setPaintProperty(LAYER_BUURTEN_LINE, "line-width", [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        2.2,
        ["==", ["get", "buurtCode"], selectedNeighborhood?.code ?? "__none__"],
        2.1,
        [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          0.9,
          14,
          1.25,
          16,
          1.5,
        ],
      ]);
    } catch {
      // Layer may not be ready yet.
    }
  }, [selectedNeighborhood]);

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
          zoom: Math.max(map.getZoom(), HUISDB_3D_ZOOM),
          pitch: HUISDB_3D_PITCH,
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
      zoom: Math.max(map.getZoom(), HUISDB_3D_ZOOM),
      pitch: HUISDB_3D_PITCH,
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

      {selectedNeighborhood && !selectedFeature ? (
        <div className={styles.neighborhoodPill}>
          <span className={styles.neighborhoodEyebrow}>Buurt</span>
          <strong>{selectedNeighborhood.name}</strong>
        </div>
      ) : null}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTexturedClayColorExpression(): ExpressionSpecification {
  return [
    "case",
    ["==", ["get", "status"], "Pand gesloopt"],
    "#b9b6ae",
    ["==", ["get", "status"], "Verbouwing pand"],
    "#ded6c9",
    ["<", ["coalesce", ["to-number", ["get", "bouwjaar"]], 1950], 1900],
    "#d2c2ac",
    ["<", ["coalesce", ["to-number", ["get", "bouwjaar"]], 1950], 1975],
    "#dfd6c9",
    ["<", ["coalesce", ["to-number", ["get", "bouwjaar"]], 1950], 2005],
    "#e9e3d8",
    "#f2eee6",
  ];
}

function buildTexturedClayLineColorExpression(): ExpressionSpecification {
  return [
    "case",
    ["==", ["get", "status"], "Pand gesloopt"],
    "#6f6a61",
    ["<", ["coalesce", ["to-number", ["get", "bouwjaar"]], 1950], 1945],
    "#8f806c",
    "#ffffff",
  ];
}

function addCircleLayer(
  map: maplibregl.Map,
  id: string,
  color: string,
  radius: number,
  source: string,
  filter: FilterSpecification,
  isBaseIndex: boolean,
) {
  map.addLayer({
    id,
    type: "circle",
    source,
    minzoom: DETAIL_OBJECT_ZOOM,
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
      "circle-opacity": isBaseIndex ? 0.92 : 0.85,
      "circle-stroke-color": isBaseIndex ? "#ffffff" : "#0d1117",
      "circle-stroke-width": isBaseIndex ? 1.2 : 1,
    },
    filter,
  });
}

function getFocusedGemeenteView(gemeente: Gemeente): {
  center: [number, number];
  zoom: number;
} {
  return (
    GEMEENTE_FOCUSED_VIEW[gemeente.code] ?? {
      center: gemeente.centroid,
      zoom: Math.max(gemeente.zoom, MIN_FOCUSED_ZOOM),
    }
  );
}

function normalizeMapCategory(
  value: unknown,
): VboFeature["properties"]["mapCategory"] {
  return value === "candidate" ||
    value === "status" ||
    value === "woning" ||
    value === "other"
    ? value
    : "other";
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

function computeFeatureBbox(geometry: GeoJSON.Geometry): Gemeente["bbox"] | null {
  const coords: [number, number][] = [];
  collectGeometryCoordinates(geometry, coords);

  if (coords.length === 0) return null;

  const lngs = coords.map(([lng]) => lng);
  const lats = coords.map(([, lat]) => lat);
  return [
    Math.min(...lngs),
    Math.min(...lats),
    Math.max(...lngs),
    Math.max(...lats),
  ];
}

function collectGeometryCoordinates(
  geometry: GeoJSON.Geometry,
  acc: [number, number][],
) {
  if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries) {
      collectGeometryCoordinates(child, acc);
    }
    return;
  }

  collectCoordinates(geometry.coordinates, acc);
}

function rotateMap(map: maplibregl.Map, delta: number) {
  map.easeTo({
    bearing: map.getBearing() + delta,
    duration: 350,
    essential: true,
  });
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
    filters.push(["==", ["get", "map_category"], "candidate"]);
  }
  if (showMiddel) {
    filters.push(["==", ["get", "map_category"], "status"]);
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
  const dataviz = basemap === "dataviz";

  map.setLayoutProperty(
    LAYER_BRT,
    "visibility",
    basemap === "luchtfoto" ? none : visible,
  );
  map.setPaintProperty(
    LAYER_BRT,
    "raster-opacity",
    dataviz ? 0.98 : basemap === "hybrid" ? 0.54 : darkBrt ? 0.24 : 0.28,
  );
  map.setPaintProperty(
    LAYER_BRT,
    "raster-brightness-max",
    dataviz ? 1 : basemap === "hybrid" ? 0.66 : darkBrt ? 0.34 : 0.34,
  );
  map.setPaintProperty(
    LAYER_BRT,
    "raster-brightness-min",
    dataviz ? 0.82 : basemap === "hybrid" ? 0.04 : darkBrt ? 0.02 : 0.02,
  );
  map.setPaintProperty(
    LAYER_BRT,
    "raster-saturation",
    dataviz ? -0.95 : basemap === "hybrid" ? -0.2 : -1,
  );
  map.setPaintProperty(
    LAYER_BRT,
    "raster-contrast",
    dataviz ? -0.12 : basemap === "hybrid" ? 0.24 : darkBrt ? 0.28 : 0.28,
  );

  map.setLayoutProperty(
    LAYER_LUCHTFOTO,
    "visibility",
    basemap === "brt" || dataviz ? none : visible,
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
