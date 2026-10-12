"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type FilterSpecification, type GeoJSONSource, type Map as MapLibreMap, type MapLayerMouseEvent, type StyleSpecification } from "maplibre-gl";
import type { CameraState, Provenance, RendererAdapter, WorldEntity } from "@lumen/world";
import { entityId } from "@lumen/world";
import { useWorldSelector, worldStore } from "@/lib/world-store";
import { centeredViewportBounds, coverViewportBounds, expandViewportBounds, expandViewportBoundsWithin, quantizedViewportKey, viewportContains, ViewportLoader, type NumericBounds } from "@/lib/viewport-loader";
import { drawingFeatures, drawingVertexFeatures } from "@/lib/drawing-geometry";
import { containingParcelEntity } from "@/lib/spatial-relations";
import { decorateBuildingsWithOpportunities, decorateBuildingsWithPois, poiImportance } from "@/lib/building-poi-index";

const SOURCE_ID = "bag-buildings";
const FILL_ID = "bag-buildings-fill";
const OUTLINE_ID = "bag-buildings-outline";
const BAG_TILE_SOURCE_ID = "pdok-bag-tiles";
const BAG_TILE_FILL_ID = "pdok-bag-buildings-fill";
const BAG_TILE_OUTLINE_ID = "pdok-bag-buildings-outline";
const BAG_TILE_SOURCE_LAYER = "pand";
const BAG_TILE_URL = "https://api.pdok.nl/kadaster/bag/ogc/v2/tiles/WebMercatorQuad/{z}/{y}/{x}?f=mvt";
const PARCEL_SOURCE_ID = "brk-parcels";
const PARCEL_FILL_ID = "brk-parcels-fill";
const PARCEL_OUTLINE_ID = "brk-parcels-outline";
const BRT_TILE_URL = "https://api.pdok.nl/kadaster/brt-achtergrondkaart/ogc/v1/tiles/WebMercatorQuad/{z}/{y}/{x}?f=mvt";
const BRT_GLYPHS_URL = "https://api.pdok.nl/kadaster/brt-achtergrondkaart/ogc/v1/resources/fonts/{fontstack}/{range}.pbf";
const OPPORTUNITY_SOURCE_ID = "vacancy-opportunities";
const OPPORTUNITY_LAYER_ID = "vacancy-opportunities-circle";
const OPPORTUNITY_SELECTED_ID = "vacancy-opportunities-selected";
const POI_SOURCE_ID = "osm-pois";
const POI_LAYER_ID = "osm-pois-circle";
const POI_LABEL_ID = "osm-pois-label";
const SCENARIO_SOURCE_ID = "scenario-objects";
const SCENARIO_FILL_ID = "scenario-objects-fill";
const SCENARIO_OUTLINE_ID = "scenario-objects-outline";
const DRAWING_SOURCE_ID = "project-drawings";
const DRAWING_FILL_ID = "project-drawings-fill";
const DRAWING_LINE_ID = "project-drawings-line";
const DRAWING_POINT_ID = "project-drawings-point";
const DRAWING_VERTEX_SOURCE_ID = "project-drawing-vertices";
const DRAWING_VERTEX_ID = "project-drawing-vertices-handle";
const AREA_SOURCE_ID = "cbs-areas";
const MUNICIPALITY_FILL_ID = "cbs-municipalities-fill";
const MUNICIPALITY_LINE_ID = "cbs-municipalities-line";
const MUNICIPALITY_LABEL_ID = "cbs-municipalities-label";
const DISTRICT_FILL_ID = "cbs-districts-fill";
const DISTRICT_LINE_ID = "cbs-districts-line";
const DISTRICT_LABEL_ID = "cbs-districts-label";
const NEIGHBORHOOD_FILL_ID = "cbs-neighborhoods-fill";
const NEIGHBORHOOD_LINE_ID = "cbs-neighborhoods-line";
const NEIGHBORHOOD_LABEL_ID = "cbs-neighborhoods-label";
const AREA_HOVER_FILL_ID = "cbs-area-hover-fill";
const AREA_HOVER_LINE_ID = "cbs-area-hover-line";
const MUNICIPALITY_MAX_ZOOM = 9.5;
const DISTRICT_MIN_ZOOM = MUNICIPALITY_MAX_ZOOM;
const DISTRICT_MAX_ZOOM = 12.5;
const NEIGHBORHOOD_MIN_ZOOM = DISTRICT_MAX_ZOOM;
const NEIGHBORHOOD_MAX_ZOOM = 14.5;
const BAG_SELECTION_MIN_ZOOM = 14.5;
const PARCEL_MIN_ZOOM = 14;

const MAP_COLORS = {
  ground: "#e8e7e3",
  terrain: "#deded8",
  vegetation: "#d5dbd1",
  sand: "#e4dfd3",
  water: "#c2d3d3",
  road: "#f1f0eb",
  rail: "#aaa9a4",
  building: "#cfcec9",
  buildingBorder: "#777772",
  label: "#686863",
  labelHalo: "#f2f1ec",
} as const;

type BuildingResponse = { type: "FeatureCollection"; features: GeoJSON.Feature[]; entities: WorldEntity[]; truncated?: boolean; error?: string };
type OpportunityLoad = { response: BuildingResponse; coverage: NumericBounds };
type BuildingDetailResponse = { feature?: GeoJSON.Feature; entity?: WorldEntity; error?: string };
type ParcelResponse = { type: "FeatureCollection"; features: GeoJSON.Feature[]; entities: WorldEntity[]; truncated?: boolean; error?: string };
type ParcelLoad = { response: ParcelResponse; coverage: NumericBounds };
type PoiResponse = { type: "FeatureCollection"; features: GeoJSON.Feature[]; entities: WorldEntity[]; degraded?: boolean; warning?: string; error?: string };
type PoiLoad = { response: PoiResponse; coverage: NumericBounds };
type BuildingOutlineResponse = { type: "FeatureCollection"; features: GeoJSON.Feature[]; truncated?: boolean; error?: string };
type BuildingOutlineLoad = { response: BuildingOutlineResponse; coverage: NumericBounds };
type AreaResponse = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { areaKind: "municipality" | "district" | "neighborhood"; code: string; name: string; municipality: string; municipalityCode: string | null; districtCode: string | null; parentCode: string | null; parentName: string | null; residents: number | null; year: number }> & { provenance?: Provenance; error?: string };
type AreaDetail = "municipality" | "district" | "neighborhood";
type AreaLoad = { response: AreaResponse; coverage: NumericBounds; detail: AreaDetail };

const LUMEN_MAP_STYLE: StyleSpecification = {
  version: 8,
  glyphs: BRT_GLYPHS_URL,
  sources: {
    brt: { type: "vector", tiles: [BRT_TILE_URL], minzoom: 0, maxzoom: 17, attribution: "© PDOK / Kadaster" },
  },
  layers: [
    { id: "lumen-ground", type: "background", paint: { "background-color": MAP_COLORS.ground } },
    { id: "lumen-terrain", type: "fill", source: "brt", "source-layer": "terreinvlak", paint: { "fill-color": ["match", ["get", "vistext"], "bos", MAP_COLORS.vegetation, "bos: dras, moeras, riet", MAP_COLORS.vegetation, "heide", MAP_COLORS.terrain, "zand", MAP_COLORS.sand, MAP_COLORS.terrain] } },
    { id: "lumen-water", type: "fill", source: "brt", "source-layer": "waterdeelvlak", paint: { "fill-color": MAP_COLORS.water, "fill-opacity": .94 } },
    { id: "lumen-roads", type: "fill", source: "brt", "source-layer": "wegdeelvlak", paint: { "fill-color": MAP_COLORS.road, "fill-outline-color": MAP_COLORS.road } },
    { id: "lumen-road-lines", type: "line", source: "brt", "source-layer": "wegdeellijn", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": MAP_COLORS.road, "line-width": ["interpolate", ["linear"], ["zoom"], 10, .6, 14, 1.3, 17, 3] } },
    { id: "lumen-rail", type: "line", source: "brt", "source-layer": "spoorbaandeellijn", paint: { "line-color": MAP_COLORS.rail, "line-width": ["interpolate", ["linear"], ["zoom"], 10, .5, 17, 2] } },
    { id: "lumen-buildings", type: "fill", source: "brt", "source-layer": "gebouwvlak", minzoom: 10, paint: { "fill-color": MAP_COLORS.building, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 10, .62, 14, .92, 17, 1] } },
    { id: "lumen-building-outlines", type: "line", source: "brt", "source-layer": "gebouwvlak", minzoom: 10, paint: { "line-color": MAP_COLORS.buildingBorder, "line-opacity": ["interpolate", ["linear"], ["zoom"], 10, .18, 14, .3, 17, .4], "line-width": ["interpolate", ["linear"], ["zoom"], 10, .2, 17, .55] } },
    { id: "lumen-water-labels", type: "symbol", source: "brt", "source-layer": "waterdeelvlak_label", minzoom: 11, layout: { "text-field": ["get", "naam"], "text-font": ["Liberation Sans Italic"], "text-size": 11 }, paint: { "text-color": "#718888", "text-halo-color": MAP_COLORS.labelHalo, "text-halo-width": 1 } },
    { id: "lumen-street-labels", type: "symbol", source: "brt", "source-layer": "straatnamen", minzoom: 13, layout: { "symbol-placement": "line", "text-field": ["get", "label"], "text-font": ["Liberation Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 13, 9, 17, 12] }, paint: { "text-color": MAP_COLORS.label, "text-halo-color": MAP_COLORS.labelHalo, "text-halo-width": 1.2 } },
    { id: "lumen-place-labels", type: "symbol", source: "brt", "source-layer": "annotaties", layout: { "text-field": ["get", "label"], "text-font": ["Liberation Sans Regular"], "text-size": ["coalesce", ["get", "size"], 11] }, paint: { "text-color": MAP_COLORS.label, "text-halo-color": MAP_COLORS.labelHalo, "text-halo-width": 1.2 } },
  ],
};

class MapLibreAdapter implements RendererAdapter {
  readonly mode = "map-2d" as const;
  readonly capabilities = { selection: true, annotations: false, terrain: false, threeDimensional: false };
  private selectedFeatureId: string | number | null = null;
  private hoveredFeatureId: string | number | null = null;
  private selectedAreaId: string | number | null = null;
  private hoveredAreaId: string | number | null = null;
  private selectedParcelId: string | number | null = null;
  private hoveredParcelId: string | number | null = null;
  constructor(readonly map: MapLibreMap) {}
  mount() {}
  unmount() { this.map.remove(); }
  resize() { this.map.resize(); }
  applyCamera(camera: CameraState) {
    const center = this.map.getCenter();
    if (Math.abs(center.lng - camera.center[0]) < .00001 && Math.abs(center.lat - camera.center[1]) < .00001 && Math.abs(this.map.getZoom() - camera.zoom) < .01) return;
    this.map.easeTo({ center: [camera.center[0], camera.center[1]], zoom: camera.zoom, bearing: camera.bearing, pitch: camera.pitch, duration: 500 });
  }
  readCamera(): CameraState { const center = this.map.getCenter(); return { center: [center.lng, center.lat], zoom: this.map.getZoom(), bearing: this.map.getBearing(), pitch: this.map.getPitch() }; }
  applySelection(entity: WorldEntity | null) {
    const nextId = entity?.properties.identificatie;
    const selectableId = typeof nextId === "string" || typeof nextId === "number" ? nextId : null;
    this.selectTileFeature(entity?.type === "building" ? selectableId : null);
    this.selectParcelFeature(entity?.type === "parcel" ? selectableId : null);
    const areaCode = entity?.properties.code;
    this.selectAreaFeature(
      entity && (entity.type === "municipality" || entity.type === "district" || entity.type === "neighborhood")
        && (typeof areaCode === "string" || typeof areaCode === "number") ? areaCode : null,
    );
    const filter: FilterSpecification = entity ? ["==", ["get", "lumenEntityId"], entity.id] : ["==", ["get", "lumenEntityId"], "__none__"];
    if (this.map.getLayer(OPPORTUNITY_SELECTED_ID)) this.map.setFilter(OPPORTUNITY_SELECTED_ID, filter);
  }
  selectAreaFeature(id: string | number | null) {
    if (this.selectedAreaId === id) return;
    if (this.selectedAreaId !== null && this.map.getSource(AREA_SOURCE_ID)) {
      this.map.setFeatureState({ source: AREA_SOURCE_ID, id: this.selectedAreaId }, { selected: false });
    }
    this.selectedAreaId = id;
    if (id !== null && this.map.getSource(AREA_SOURCE_ID)) {
      this.map.setFeatureState({ source: AREA_SOURCE_ID, id }, { selected: true });
    }
  }
  hoverAreaFeature(id: string | number | null) {
    if (this.hoveredAreaId === id) return;
    if (this.hoveredAreaId !== null && this.map.getSource(AREA_SOURCE_ID)) {
      this.map.setFeatureState({ source: AREA_SOURCE_ID, id: this.hoveredAreaId }, { hovered: false });
    }
    this.hoveredAreaId = id;
    if (id !== null && this.map.getSource(AREA_SOURCE_ID)) {
      this.map.setFeatureState({ source: AREA_SOURCE_ID, id }, { hovered: true });
    }
    const filter: FilterSpecification = id === null ? ["==", "code", "__none__"] : ["==", "code", String(id)];
    if (this.map.getLayer(AREA_HOVER_FILL_ID)) this.map.setFilter(AREA_HOVER_FILL_ID, filter);
    if (this.map.getLayer(AREA_HOVER_LINE_ID)) this.map.setFilter(AREA_HOVER_LINE_ID, filter);
  }
  selectTileFeature(id: string | number | null) {
    if (this.selectedFeatureId === id) return;
    if (this.selectedFeatureId !== null && this.map.getSource(SOURCE_ID)) {
      this.map.setFeatureState({ source: SOURCE_ID, id: this.selectedFeatureId }, { selected: false });
    }
    if (this.selectedFeatureId !== null && this.map.getSource(BAG_TILE_SOURCE_ID)) {
      this.map.setFeatureState({ source: BAG_TILE_SOURCE_ID, sourceLayer: BAG_TILE_SOURCE_LAYER, id: this.selectedFeatureId }, { selected: false });
    }
    this.selectedFeatureId = id;
    if (id !== null && this.map.getSource(SOURCE_ID)) {
      this.map.setFeatureState({ source: SOURCE_ID, id }, { selected: true });
    }
    if (id !== null && this.map.getSource(BAG_TILE_SOURCE_ID)) {
      this.map.setFeatureState({ source: BAG_TILE_SOURCE_ID, sourceLayer: BAG_TILE_SOURCE_LAYER, id }, { selected: true });
    }
  }
  hoverTileFeature(id: string | number | null) {
    if (this.hoveredFeatureId === id) return;
    if (this.hoveredFeatureId !== null && this.map.getSource(SOURCE_ID)) {
      this.map.setFeatureState({ source: SOURCE_ID, id: this.hoveredFeatureId }, { hovered: false });
    }
    if (this.hoveredFeatureId !== null && this.map.getSource(BAG_TILE_SOURCE_ID)) {
      this.map.setFeatureState({ source: BAG_TILE_SOURCE_ID, sourceLayer: BAG_TILE_SOURCE_LAYER, id: this.hoveredFeatureId }, { hovered: false });
    }
    this.hoveredFeatureId = id;
    if (id !== null && this.map.getSource(SOURCE_ID)) {
      this.map.setFeatureState({ source: SOURCE_ID, id }, { hovered: true });
    }
    if (id !== null && this.map.getSource(BAG_TILE_SOURCE_ID)) {
      this.map.setFeatureState({ source: BAG_TILE_SOURCE_ID, sourceLayer: BAG_TILE_SOURCE_LAYER, id }, { hovered: true });
    }
  }
  selectParcelFeature(id: string | number | null) {
    if (this.selectedParcelId === id) return;
    if (this.selectedParcelId !== null && this.map.getSource(PARCEL_SOURCE_ID)) this.map.setFeatureState({ source: PARCEL_SOURCE_ID, id: this.selectedParcelId }, { selected: false });
    this.selectedParcelId = id;
    if (id !== null && this.map.getSource(PARCEL_SOURCE_ID)) this.map.setFeatureState({ source: PARCEL_SOURCE_ID, id }, { selected: true });
  }
  hoverParcelFeature(id: string | number | null) {
    if (this.hoveredParcelId === id) return;
    if (this.hoveredParcelId !== null && this.map.getSource(PARCEL_SOURCE_ID)) this.map.setFeatureState({ source: PARCEL_SOURCE_ID, id: this.hoveredParcelId }, { hovered: false });
    this.hoveredParcelId = id;
    if (id !== null && this.map.getSource(PARCEL_SOURCE_ID)) this.map.setFeatureState({ source: PARCEL_SOURCE_ID, id }, { hovered: true });
  }
  applyLayers(layers: ReturnType<typeof worldStore.getState>["layers"]) {
    for (const id of ["lumen-buildings", "lumen-building-outlines", FILL_ID, OUTLINE_ID, BAG_TILE_FILL_ID, BAG_TILE_OUTLINE_ID]) {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, "visibility", layers.buildings?.visible ? "visible" : "none");
    }
    for (const id of [PARCEL_FILL_ID, PARCEL_OUTLINE_ID]) {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, "visibility", layers.parcels?.visible ? "visible" : "none");
    }
    if (this.map.getLayer(OPPORTUNITY_LAYER_ID)) this.map.setLayoutProperty(OPPORTUNITY_LAYER_ID, "visibility", layers.vacancy?.visible ? "visible" : "none");
    if (this.map.getLayer(OPPORTUNITY_SELECTED_ID)) this.map.setLayoutProperty(OPPORTUNITY_SELECTED_ID, "visibility", layers.vacancy?.visible ? "visible" : "none");
    for (const id of [POI_LAYER_ID, POI_LABEL_ID]) {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, "visibility", layers.amenities?.visible ? "visible" : "none");
    }
  }
  applyAnnotations() {}
  applyScenarioObjects(objects: ReturnType<typeof worldStore.getState>["scenarioObjects"]) {
    const features: GeoJSON.Feature[] = objects.flatMap((object) => {
      const bounds = object.geometry.bounds;
      if (!bounds) return [];
      return [{
        type: "Feature",
        properties: { id: object.id, heightM: object.parameters.heightM },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [bounds[0], bounds[1]],
            [bounds[2], bounds[1]],
            [bounds[2], bounds[3]],
            [bounds[0], bounds[3]],
            [bounds[0], bounds[1]],
          ]],
        },
      }];
    });
    (this.map.getSource(SCENARIO_SOURCE_ID) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
  }
}

function geometryBounds(geometry: GeoJSON.Geometry | null): [[number, number], [number, number]] | null {
  if (!geometry || geometry.type === "GeometryCollection") return null;
  const points: [number, number][] = [];
  const collect = (coordinates: unknown) => {
    if (!Array.isArray(coordinates)) return;
    if (coordinates.length >= 2 && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
      points.push([coordinates[0], coordinates[1]]);
      return;
    }
    coordinates.forEach(collect);
  };
  collect(geometry.coordinates);
  if (!points.length) return null;
  const longitudes = points.map(([longitude]) => longitude);
  const latitudes = points.map(([, latitude]) => latitude);
  return [[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]];
}

function areaEntity(feature: GeoJSON.Feature, source: Provenance | null): WorldEntity | null {
  const properties = feature.properties ?? {};
  const code = properties.code;
  const kind = properties.areaKind;
  const name = properties.name;
  const bounds = geometryBounds(feature.geometry);
  if ((kind !== "municipality" && kind !== "district" && kind !== "neighborhood") || typeof code !== "string" || typeof name !== "string" || !bounds) return null;
  const center: [number, number] = [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2];
  const parentCode = typeof properties.parentCode === "string" && properties.parentCode ? properties.parentCode : null;
  const parentType = kind === "district" ? "municipality" : kind === "neighborhood" ? "district" : null;
  return {
    id: entityId(`cbs-${kind}-${code}`),
    type: kind,
    name,
    description: kind === "municipality" ? "Gemeente" : `${kind === "district" ? "Wijk" : "Buurt"} in ${String(properties.municipality ?? "Nederland")}`,
    geometry: { kind: feature.geometry?.type === "MultiPolygon" ? "multipolygon" : "polygon", center, bounds: [bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]], coordinateSystem: "WGS84" },
    properties: {
      code,
      areaKind: kind,
      municipality: String(properties.municipality ?? name),
      municipalityCode: typeof properties.municipalityCode === "string" ? properties.municipalityCode : null,
      districtCode: typeof properties.districtCode === "string" ? properties.districtCode : null,
      parentCode,
      parentName: typeof properties.parentName === "string" ? properties.parentName : null,
      residents: typeof properties.residents === "number" ? properties.residents : null,
      population: typeof properties.residents === "number" ? properties.residents : null,
      year: typeof properties.year === "number" ? properties.year : 2025,
    },
    ...(parentCode && parentType ? { relatedEntityIds: [entityId(`cbs-${parentType}-${parentCode}`)] } : {}),
    provenance: [source ?? { sourceId: "cbs-wijken-buurten-2025", sourceLabel: "CBS Wijken en Buurten 2025 via PDOK", sourceUrl: "https://www.pdok.nl/ogc-apis/-/article/cbs-wijken-en-buurten", retrievedAt: "", confidence: "unknown", methodVersion: "cbs-area-navigation-1.0.0", limitations: ["Het daadwerkelijke ophaalmoment ontbreekt; actualiteit kan niet worden bevestigd."] }],
  };
}

function selectionIsOutsideMap(map: MapLibreMap) {
  const selectedId = worldStore.getState().selectedEntityId;
  const selectedBounds = selectedId ? worldStore.getState().entities[selectedId]?.geometry?.bounds : undefined;
  if (!selectedBounds) return false;
  const viewport = map.getBounds();
  return selectedBounds[2] < viewport.getWest()
    || selectedBounds[0] > viewport.getEast()
    || selectedBounds[3] < viewport.getSouth()
    || selectedBounds[1] > viewport.getNorth();
}

function opportunityUrl(bounds: NumericBounds) {
  return `/api/world/opportunities?bbox=${quantizedViewportKey(bounds, 4)}`;
}

function poiUrl(bounds: NumericBounds) {
  return `/api/world/pois?bbox=${quantizedViewportKey(bounds, 3)}`;
}

function mapBounds(map: MapLibreMap): NumericBounds {
  const bounds = map.getBounds();
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

function buildingOutlineUrl(bounds: NumericBounds) {
  return `/api/world/buildings?geometry=1&bbox=${quantizedViewportKey(bounds, 4)}`;
}

function parcelUrl(bounds: NumericBounds) {
  return `/api/world/parcels?bbox=${quantizedViewportKey(bounds, 4)}`;
}

function areaDetailForZoom(zoom: number) {
  return zoom < DISTRICT_MIN_ZOOM ? "municipality" : zoom < NEIGHBORHOOD_MIN_ZOOM ? "district" : "neighborhood";
}

function areaUrl(detail: AreaDetail, bounds: NumericBounds) {
  return `/api/world/areas?v=3&detail=${detail}&bbox=${quantizedViewportKey(bounds, 4)}`;
}

export default function MapLibreWorld({ active = true }: { active?: boolean }) {
  const camera = useWorldSelector((state) => state.camera);
  const entities = useWorldSelector((state) => state.entities);
  const selectedEntityId = useWorldSelector((state) => state.selectedEntityId);
  // Layer load status is written by this component. Subscribe only to the
  // visibility values that can actually require a renderer/data refresh;
  // observing the complete runtime object feeds loading -> ready updates back
  // into every loader and can lock the browser in a reload loop.
  const buildingsVisible = useWorldSelector((state) => Boolean(state.layers.buildings?.visible));
  const parcelsVisible = useWorldSelector((state) => Boolean(state.layers.parcels?.visible));
  const vacancyVisible = useWorldSelector((state) => Boolean(state.layers.vacancy?.visible));
  const amenitiesVisible = useWorldSelector((state) => Boolean(state.layers.amenities?.visible));
  const scenarioObjects = useWorldSelector((state) => state.scenarioObjects);
  const drawings = useWorldSelector((state) => state.drawings);
  const drawingMode = useWorldSelector((state) => state.drawingMode);
  const editingDrawingId = useWorldSelector((state) => state.editingDrawingId);
  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<MapLibreAdapter | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const opportunityLoaderRef = useRef(new ViewportLoader<OpportunityLoad>());
  const poiLoaderRef = useRef(new ViewportLoader<PoiLoad>(3_600_000, 16));
  const outlineLoaderRef = useRef(new ViewportLoader<BuildingOutlineLoad>(300_000, 12));
  const parcelLoaderRef = useRef(new ViewportLoader<ParcelLoad>(300_000, 12));
  const loadBuildingsRef = useRef<(() => void) | null>(null);
  const loadParcelsRef = useRef<(() => void) | null>(null);
  const loadOpportunitiesRef = useRef<(() => void) | null>(null);
  const loadPoisRef = useRef<(() => void) | null>(null);
  const areaLoaderRef = useRef(new ViewportLoader<AreaLoad>(3_600_000, 16));
  const detailControllerRef = useRef<AbortController | null>(null);
  const [rendererError, setRendererError] = useState("");
  const [settledZoom, setSettledZoom] = useState(camera.zoom);

  useEffect(() => {
    if (!containerRef.current) return;
    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
      container: containerRef.current, center: [camera.center[0], camera.center[1]], zoom: camera.zoom,
      bearing: camera.bearing, pitch: camera.pitch, attributionControl: false,
      fadeDuration: 0,
      style: LUMEN_MAP_STYLE,
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "De kaart kon niet worden gestart.";
      setRendererError(message);
      worldStore.setLayerStatus("buildings", "error", message);
      return;
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    const adapter = new MapLibreAdapter(map); adapterRef.current = adapter;
    let buildingFeatures: GeoJSON.Feature[] = [];
    let buildingRevision = 0;
    let poiRevision = 0;
    let opportunityRevision = 0;
    let renderedBuildingRevision = -1;
    let renderedPoiRevision = -1;
    let renderedOpportunityRevision = -1;
    let buildingSourceCleared = true;
    let buildingCoverage: NumericBounds | null = null;
    let pendingBuildingCoverage: NumericBounds | null = null;
    let pendingBuildingKey: string | null = null;
    let parcelCoverage: NumericBounds | null = null;
    let pendingParcelCoverage: NumericBounds | null = null;
    let pendingParcelKey: string | null = null;
    let opportunityCoverage: NumericBounds | null = null;
    let pendingOpportunityCoverage: NumericBounds | null = null;
    let pendingOpportunityKey: string | null = null;
    let poiCoverage: NumericBounds | null = null;
    let pendingPoiCoverage: NumericBounds | null = null;
    let pendingPoiKey: string | null = null;
    let areaCoverage: NumericBounds | null = null;
    let areaCoverageDetail: AreaDetail | null = null;
    let pendingAreaCoverage: NumericBounds | null = null;
    let pendingAreaDetail: AreaDetail | null = null;
    let pendingAreaKey: string | null = null;
    let areaProvenance: Provenance | null = null;
    let parcelFeatures: GeoJSON.Feature[] = [];
    let parcelEntities = new Map<string, WorldEntity>();
    let opportunityFeatures: GeoJSON.Feature[] = [];
    let poiFeatures: GeoJSON.Feature[] = [];
    let poiByBuildingId = new Map<string, WorldEntity>();
    let poiTileBuildingIds = new Set<string>();
    let vacancyTileBuildingIds = new Set<string>();
    let poiDecorationScheduled = false;
    let draftDrawing: [number, number][] = [];
    let previousDrawingMode = worldStore.getState().drawingMode;
    let previousEditingDrawingId = worldStore.getState().editingDrawingId;
    let previousDrawings = worldStore.getState().drawings;
    let editingCoordinates: [number, number][] | null = previousEditingDrawingId ? worldStore.getState().drawings.find((drawing) => drawing.id === previousEditingDrawingId)?.coordinates.map(([longitude, latitude]) => [longitude, latitude]) ?? null : null;
    const renderDrawingVertices = () => (map.getSource(DRAWING_VERTEX_SOURCE_ID) as GeoJSONSource | undefined)?.setData(drawingVertexFeatures(previousEditingDrawingId, editingCoordinates));
    const renderDrawings = () => (map.getSource(DRAWING_SOURCE_ID) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: drawingFeatures(worldStore.getState().drawings, draftDrawing, previousEditingDrawingId && editingCoordinates ? { id: previousEditingDrawingId, coordinates: editingCoordinates } : null, previousDrawingMode ?? "line") });
    const finishDrawing = () => {
      const mode = worldStore.getState().drawingMode;
      if (!mode || !draftDrawing.length || (mode === "line" && draftDrawing.length < 2) || (mode === "polygon" && draftDrawing.length < 3)) return;
      const now = new Date().toISOString();
      worldStore.execute({ type: "add_drawing", drawing: { id: crypto.randomUUID(), kind: mode, name: `Nieuwe ${mode === "polygon" ? "locatie" : mode}`, coordinates: draftDrawing, color: "#315df0", version: 1, createdAt: now, updatedAt: now, ...(worldStore.getState().activeProject ? { projectId: worldStore.getState().activeProject!.id } : {}) } });
      draftDrawing = []; renderDrawings(); map.getCanvas().style.cursor = "";
    };
    const unsubscribeDrawingMode = worldStore.subscribe(() => {
      const nextMode = worldStore.getState().drawingMode;
      const nextEditingDrawingId = worldStore.getState().editingDrawingId;
      const nextDrawings = worldStore.getState().drawings;
      let drawingChanged = false;
      if (nextMode !== previousDrawingMode) { draftDrawing = []; previousDrawingMode = nextMode; drawingChanged = true; }
      if (nextEditingDrawingId !== previousEditingDrawingId || nextDrawings !== previousDrawings) {
        previousEditingDrawingId = nextEditingDrawingId;
        editingCoordinates = nextEditingDrawingId ? nextDrawings.find((drawing) => drawing.id === nextEditingDrawingId)?.coordinates.map(([longitude, latitude]) => [longitude, latitude]) ?? null : null;
        previousDrawings = nextDrawings;
        renderDrawingVertices();
        drawingChanged = true;
      }
      if (drawingChanged) renderDrawings();
    });
    const renderBuildingFeatures = () => {
      if (!buildingSourceCleared && renderedBuildingRevision === buildingRevision && renderedPoiRevision === poiRevision && renderedOpportunityRevision === opportunityRevision) return;
      const poiEntities = Object.values(worldStore.getState().entities).filter((entity) => entity.type === "infrastructure");
      const decorated = decorateBuildingsWithPois(buildingFeatures, poiFeatures, poiEntities);
      poiByBuildingId = decorated.poiByBuildingId;
      const signaled = decorateBuildingsWithOpportunities(decorated.features, opportunityFeatures);
      (map.getSource(SOURCE_ID) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: signaled });
      renderedBuildingRevision = buildingRevision;
      renderedPoiRevision = poiRevision;
      renderedOpportunityRevision = opportunityRevision;
      buildingSourceCleared = false;
    };
    const clearPoiTileStates = () => {
      poiTileBuildingIds.forEach((id) => map.setFeatureState({ source: BAG_TILE_SOURCE_ID, sourceLayer: BAG_TILE_SOURCE_LAYER, id }, { poi: false }));
      poiTileBuildingIds = new Set();
    };
    const clearVacancyTileStates = () => {
      vacancyTileBuildingIds.forEach((id) => map.setFeatureState({ source: BAG_TILE_SOURCE_ID, sourceLayer: BAG_TILE_SOURCE_LAYER, id }, { vacancy: false }));
      vacancyTileBuildingIds = new Set();
    };
    const decorateVisibleTileBuildings = () => {
      if (map.getZoom() < 17 || !map.getLayer(BAG_TILE_FILL_ID)) return;
      clearPoiTileStates();
      clearVacancyTileStates();
      poiByBuildingId = new Map();
      const entitiesById = new Map(Object.values(worldStore.getState().entities)
        .filter((entity) => entity.type === "infrastructure")
        .map((entity) => [String(entity.id), entity]));
      for (const feature of [...poiFeatures].sort((left, right) => poiImportance(left) - poiImportance(right))) {
        if (feature.geometry.type !== "Point") continue;
        const [longitude, latitude] = feature.geometry.coordinates;
        if (typeof longitude !== "number" || typeof latitude !== "number") continue;
        const building = map.queryRenderedFeatures(map.project([longitude, latitude]), { layers: [BAG_TILE_FILL_ID] })[0];
        const rawId = building?.properties?.identificatie ?? building?.id;
        if (rawId === undefined || rawId === null) continue;
        const id = String(rawId);
        map.setFeatureState({ source: BAG_TILE_SOURCE_ID, sourceLayer: BAG_TILE_SOURCE_LAYER, id }, { poi: true });
        poiTileBuildingIds.add(id);
        const poiId = feature.properties?.lumenEntityId;
        const poi = poiId ? entitiesById.get(String(poiId)) : undefined;
        if (poi) poiByBuildingId.set(id, poi);
      }
      for (const feature of opportunityFeatures) {
        if (feature.properties?.opportunityCandidate === false) continue;
        const point = feature.geometry.type === "Point"
          ? feature.geometry.coordinates
          : (() => { const box = geometryBounds(feature.geometry); return box ? [(box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2] : null; })();
        if (!point || typeof point[0] !== "number" || typeof point[1] !== "number") continue;
        const building = map.queryRenderedFeatures(map.project([point[0], point[1]]), { layers: [BAG_TILE_FILL_ID] })[0];
        const rawId = building?.properties?.identificatie ?? building?.id;
        if (rawId === undefined || rawId === null) continue;
        const id = String(rawId);
        map.setFeatureState({ source: BAG_TILE_SOURCE_ID, sourceLayer: BAG_TILE_SOURCE_LAYER, id }, { vacancy: true });
        vacancyTileBuildingIds.add(id);
      }
    };
    const schedulePoiTileDecoration = () => {
      if (map.getZoom() < 17 || poiDecorationScheduled || (!poiFeatures.length && !opportunityFeatures.length)) return;
      poiDecorationScheduled = true;
      map.once("idle", () => { poiDecorationScheduled = false; decorateVisibleTileBuildings(); });
    };
    const loadBuildingOutlines = async () => {
      if (!activeRef.current) return;
      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      if (map.getZoom() < BAG_SELECTION_MIN_ZOOM || !worldStore.getState().layers.buildings?.visible) {
        outlineLoaderRef.current.cancel();
        pendingBuildingCoverage = null; pendingBuildingKey = null;
        if (!buildingSourceCleared) source?.setData({ type: "FeatureCollection", features: [] });
        buildingSourceCleared = true;
        worldStore.setLayerStatus("buildings", "idle");
        return;
      }
      if (map.getZoom() >= 17) {
        outlineLoaderRef.current.cancel();
        pendingBuildingCoverage = null; pendingBuildingKey = null; buildingCoverage = null;
        if (buildingFeatures.length) { buildingFeatures = []; buildingRevision += 1; }
        if (!buildingSourceCleared) source?.setData({ type: "FeatureCollection", features: [] });
        buildingSourceCleared = true;
        worldStore.setLayerStatus("buildings", "ready");
        return;
      }
      const viewport = mapBounds(map);
      if (viewportContains(buildingCoverage, viewport)) { renderBuildingFeatures(); worldStore.setLayerStatus("buildings", "ready"); return; }
      if (viewportContains(pendingBuildingCoverage, viewport)) return;
      const requestBounds = coverViewportBounds(expandViewportBoundsWithin(viewport, .35, .0795), 4);
      const key = quantizedViewportKey(requestBounds, 4);
      pendingBuildingCoverage = requestBounds;
      pendingBuildingKey = key;
      worldStore.setLayerStatus("buildings", "loading");
      try {
        const loaded = await outlineLoaderRef.current.load(key, async (signal) => {
          const response = await fetch(buildingOutlineUrl(requestBounds), { signal });
          const data = await response.json() as BuildingOutlineResponse;
          if (!response.ok) throw new Error(data.error ?? "Gebouwcontouren konden niet worden geladen.");
          return { response: data, coverage: requestBounds };
        });
        if (!loaded.current) return;
        if (pendingBuildingKey === key) { pendingBuildingCoverage = null; pendingBuildingKey = null; }
        buildingCoverage = loaded.value.coverage;
        buildingFeatures = loaded.value.response.features;
        buildingRevision += 1;
        renderBuildingFeatures();
        worldStore.setLayerStatus("buildings", "ready");
      } catch (error) {
        if (pendingBuildingKey === key) { pendingBuildingCoverage = null; pendingBuildingKey = null; }
        if (error instanceof Error && error.name === "AbortError") return;
        worldStore.setLayerStatus("buildings", "error", error instanceof Error ? error.message : "Gebouwcontouren konden niet worden geladen.");
      }
    };
    loadBuildingsRef.current = () => { void loadBuildingOutlines(); };
    const loadParcels = async () => {
      if (!activeRef.current) return;
      const source = map.getSource(PARCEL_SOURCE_ID) as GeoJSONSource | undefined;
      if (map.getZoom() < PARCEL_MIN_ZOOM || !worldStore.getState().layers.parcels?.visible) {
        parcelLoaderRef.current.cancel(); pendingParcelCoverage = null; pendingParcelKey = null; source?.setData({ type: "FeatureCollection", features: [] });
        worldStore.replaceEntitiesOfType("parcel", []); worldStore.setLayerStatus("parcels", "idle"); return;
      }
      const viewport = mapBounds(map);
      if (viewportContains(parcelCoverage, viewport)) { source?.setData({ type: "FeatureCollection", features: parcelFeatures }); worldStore.setLayerStatus("parcels", "ready"); return; }
      if (viewportContains(pendingParcelCoverage, viewport)) return;
      const requestBounds = coverViewportBounds(expandViewportBoundsWithin(viewport, .3, .0795), 4);
      const key = quantizedViewportKey(requestBounds, 4);
      pendingParcelCoverage = requestBounds;
      pendingParcelKey = key;
      worldStore.setLayerStatus("parcels", "loading");
      try {
        const loaded = await parcelLoaderRef.current.load(key, async (signal) => {
          const response = await fetch(parcelUrl(requestBounds), { signal });
          const data = await response.json() as ParcelResponse;
          if (!response.ok) throw new Error(data.error ?? "Percelen konden niet worden geladen.");
          return { response: data, coverage: requestBounds };
        });
        if (!loaded.current) return;
        if (pendingParcelKey === key) { pendingParcelCoverage = null; pendingParcelKey = null; }
        parcelCoverage = loaded.value.coverage; parcelFeatures = loaded.value.response.features;
        parcelEntities = new Map(loaded.value.response.entities.map((entity) => [String(entity.properties.identificatie), entity]));
        source?.setData({ type: "FeatureCollection", features: parcelFeatures });
        worldStore.replaceEntitiesOfType("parcel", loaded.value.response.entities);
        worldStore.setLayerStatus("parcels", loaded.value.response.truncated ? "error" : "ready", loaded.value.response.truncated ? "Niet alle percelen pasten in deze viewport; zoom verder in." : undefined);
      } catch (error) {
        if (pendingParcelKey === key) { pendingParcelCoverage = null; pendingParcelKey = null; }
        if (error instanceof Error && error.name === "AbortError") return;
        worldStore.setLayerStatus("parcels", "error", error instanceof Error ? error.message : "Percelen konden niet worden geladen.");
      }
    };
    loadParcelsRef.current = () => { void loadParcels(); };
    const loadAreas = async () => {
      if (!activeRef.current) return;
      if (map.getZoom() >= NEIGHBORHOOD_MAX_ZOOM) {
        areaLoaderRef.current.cancel();
        areaCoverage = null; areaCoverageDetail = null;
        pendingAreaCoverage = null; pendingAreaDetail = null; pendingAreaKey = null;
        adapter.hoverAreaFeature(null); adapter.selectAreaFeature(null);
        (map.getSource(AREA_SOURCE_ID) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
        return;
      }
      const detail = areaDetailForZoom(map.getZoom());
      const viewport = mapBounds(map);
      if (areaCoverageDetail === detail && viewportContains(areaCoverage, viewport)) return;
      if (pendingAreaDetail === detail && viewportContains(pendingAreaCoverage, viewport)) return;
      const requestBounds = coverViewportBounds(expandViewportBounds(viewport, .25), 4);
      const key = `${detail}:${quantizedViewportKey(requestBounds, 4)}`;
      pendingAreaCoverage = requestBounds; pendingAreaDetail = detail; pendingAreaKey = key;
      try {
        const loaded = await areaLoaderRef.current.load(key, async (signal) => {
          const response = await fetch(areaUrl(detail, requestBounds), { signal });
          const data = await response.json() as AreaResponse;
          if (!response.ok) throw new Error(data.error ?? "Gebieden konden niet worden geladen.");
          return { response: data, coverage: requestBounds, detail };
        });
        if (!loaded.current) return;
        if (pendingAreaKey === key) { pendingAreaCoverage = null; pendingAreaDetail = null; pendingAreaKey = null; }
        areaCoverage = loaded.value.coverage; areaCoverageDetail = loaded.value.detail;
        areaProvenance = loaded.value.response.provenance ?? null;
        adapter.hoverAreaFeature(null);
        (map.getSource(AREA_SOURCE_ID) as GeoJSONSource | undefined)?.setData(loaded.value.response);
        adapter.selectAreaFeature(null);
        const selectedId = worldStore.getState().selectedEntityId;
        adapter.applySelection(selectedId ? worldStore.getState().entities[selectedId] ?? null : null);
      } catch (error) {
        if (pendingAreaKey === key) { pendingAreaCoverage = null; pendingAreaDetail = null; pendingAreaKey = null; }
        if (!(error instanceof Error && error.name === "AbortError")) console.warn("Area navigation unavailable", error);
      }
    };
    const loadOpportunities = async () => {
      if (!activeRef.current) return;
      if (map.getZoom() < 14 || !worldStore.getState().layers.vacancy?.visible) {
        opportunityLoaderRef.current.cancel();
        opportunityCoverage = null; pendingOpportunityCoverage = null; pendingOpportunityKey = null;
        (map.getSource(OPPORTUNITY_SOURCE_ID) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
        if (opportunityFeatures.length) { opportunityFeatures = []; opportunityRevision += 1; if (map.getZoom() < 17) renderBuildingFeatures(); }
        clearVacancyTileStates();
        worldStore.replaceEntitiesOfType("opportunity", []);
        worldStore.setLayerStatus("vacancy", "idle"); return;
      }
      const viewport = mapBounds(map);
      if (viewportContains(opportunityCoverage, viewport)) { worldStore.setLayerStatus("vacancy", "ready"); return; }
      if (viewportContains(pendingOpportunityCoverage, viewport)) return;
      const requestBounds = coverViewportBounds(expandViewportBoundsWithin(viewport, .3, .0795), 4);
      const key = quantizedViewportKey(requestBounds, 4);
      pendingOpportunityCoverage = requestBounds;
      pendingOpportunityKey = key;
      worldStore.setLayerStatus("vacancy", "loading");
      try {
        const loaded = await opportunityLoaderRef.current.load(key, async (signal) => {
          const response = await fetch(opportunityUrl(requestBounds), { signal });
          const data = await response.json() as BuildingResponse;
          if (!response.ok) throw new Error(data.error ?? "Kansen konden niet worden geladen.");
          return { response: data, coverage: requestBounds };
        });
        if (!loaded.current) return;
        if (pendingOpportunityKey === key) { pendingOpportunityCoverage = null; pendingOpportunityKey = null; }
        opportunityCoverage = loaded.value.coverage;
        opportunityFeatures = loaded.value.response.features;
        opportunityRevision += 1;
        (map.getSource(OPPORTUNITY_SOURCE_ID) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: opportunityFeatures });
        worldStore.replaceEntitiesOfType("opportunity", loaded.value.response.entities);
        if (map.getZoom() < 17) renderBuildingFeatures();
        else schedulePoiTileDecoration();
        worldStore.setLayerStatus("vacancy", loaded.value.response.truncated ? "error" : "ready", loaded.value.response.truncated ? "Niet alle kansen pasten in deze viewport; zoom verder in." : undefined);
      } catch (error) {
        if (pendingOpportunityKey === key) { pendingOpportunityCoverage = null; pendingOpportunityKey = null; }
        if (error instanceof Error && error.name === "AbortError") return;
        worldStore.setLayerStatus("vacancy", "error", error instanceof Error ? error.message : "Kansen konden niet worden geladen.");
      }
    };
    loadOpportunitiesRef.current = () => { void loadOpportunities(); };
    const loadPois = async () => {
      if (!activeRef.current) return;
      const source = map.getSource(POI_SOURCE_ID) as GeoJSONSource | undefined;
      const selectedId = worldStore.getState().selectedEntityId;
      const selected = selectedId ? worldStore.getState().entities[selectedId] : null;
      const selectedArea = Boolean(selected && ["municipality", "district", "neighborhood"].includes(selected.type));
      if ((map.getZoom() < 13 && !selectedArea) || !worldStore.getState().layers.amenities?.visible) {
        poiLoaderRef.current.cancel();
        poiCoverage = null; pendingPoiCoverage = null; pendingPoiKey = null;
        source?.setData({ type: "FeatureCollection", features: [] });
        if (poiFeatures.length) { poiFeatures = []; poiRevision += 1; if (map.getZoom() < 17) renderBuildingFeatures(); }
        clearPoiTileStates();
        worldStore.replaceEntitiesOfType("infrastructure", []);
        worldStore.setLayerStatus("amenities", "idle");
        return;
      }
      const viewport = mapBounds(map);
      if (viewportContains(poiCoverage, viewport)) { schedulePoiTileDecoration(); worldStore.setLayerStatus("amenities", "ready"); return; }
      if (viewportContains(pendingPoiCoverage, viewport)) return;
      const boundedViewport = selectedArea && (viewport[2] - viewport[0] > .077 || viewport[3] - viewport[1] > .077)
        ? centeredViewportBounds(viewport, .07)
        : viewport;
      const requestBounds = coverViewportBounds(expandViewportBoundsWithin(boundedViewport, .3, .077), 3);
      const key = quantizedViewportKey(requestBounds, 3);
      pendingPoiCoverage = requestBounds;
      pendingPoiKey = key;
      worldStore.setLayerStatus("amenities", "loading");
      try {
        const loaded = await poiLoaderRef.current.load(key, async (signal) => {
          const response = await fetch(poiUrl(requestBounds), { signal });
          const data = await response.json() as PoiResponse;
          if (!response.ok) throw new Error(data.error ?? "Voorzieningen konden niet worden geladen.");
          if (data.degraded) throw new Error(data.warning ?? "Voorzieningenbron is tijdelijk niet beschikbaar.");
          return { response: data, coverage: requestBounds };
        });
        if (!loaded.current) return;
        if (pendingPoiKey === key) { pendingPoiCoverage = null; pendingPoiKey = null; }
        poiCoverage = loaded.value.coverage;
        worldStore.replaceEntitiesOfType("infrastructure", loaded.value.response.entities);
        poiFeatures = loaded.value.response.features;
        poiRevision += 1;
        source?.setData({ type: "FeatureCollection", features: poiFeatures });
        if (map.getZoom() < 17) renderBuildingFeatures();
        else schedulePoiTileDecoration();
        worldStore.setLayerStatus("amenities", "ready");
      } catch (error) {
        if (pendingPoiKey === key) { pendingPoiCoverage = null; pendingPoiKey = null; }
        if (error instanceof Error && error.name === "AbortError") return;
        worldStore.setLayerStatus("amenities", "error", error instanceof Error ? error.message : "Voorzieningen konden niet worden geladen.");
      }
    };
    loadPoisRef.current = () => { void loadPois(); };
    map.on("load", () => {
      worldStore.setLayerStatus("buildings", "loading");
      map.addSource(SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "identificatie" });
      map.addSource(BAG_TILE_SOURCE_ID, { type: "vector", tiles: [BAG_TILE_URL], minzoom: 17, maxzoom: 17, promoteId: { [BAG_TILE_SOURCE_LAYER]: "identificatie" } });
      map.addSource(PARCEL_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "identificatie" });
      map.addSource(OPPORTUNITY_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource(POI_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource(SCENARIO_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource(AREA_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource(DRAWING_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource(DRAWING_VERTEX_SOURCE_ID, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: MUNICIPALITY_FILL_ID, type: "fill", source: AREA_SOURCE_ID, minzoom: 7, maxzoom: MUNICIPALITY_MAX_ZOOM, filter: ["==", "areaKind", "municipality"], paint: { "fill-color": "#1142eb", "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], .1, ["boolean", ["feature-state", "hovered"], false], .055, .012] } });
      map.addLayer({ id: MUNICIPALITY_LINE_ID, type: "line", source: AREA_SOURCE_ID, minzoom: 7, maxzoom: MUNICIPALITY_MAX_ZOOM, filter: ["==", "areaKind", "municipality"], paint: { "line-color": ["case", ["any", ["boolean", ["feature-state", "selected"], false], ["boolean", ["feature-state", "hovered"], false]], "#1142eb", "#6f7b94"], "line-opacity": .94, "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.4, ["boolean", ["feature-state", "hovered"], false], 1.8, 1.35] } });
      map.addLayer({ id: MUNICIPALITY_LABEL_ID, type: "symbol", source: AREA_SOURCE_ID, minzoom: 7, maxzoom: MUNICIPALITY_MAX_ZOOM, filter: ["==", "areaKind", "municipality"], layout: { "text-field": ["get", "name"], "text-font": ["Liberation Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 7, 12, 11, 16], "text-allow-overlap": false }, paint: { "text-color": "#4f504d", "text-halo-color": "#eeece6", "text-halo-width": 1.5 } });
      map.addLayer({ id: DISTRICT_FILL_ID, type: "fill", source: AREA_SOURCE_ID, minzoom: DISTRICT_MIN_ZOOM, maxzoom: DISTRICT_MAX_ZOOM, filter: ["==", "areaKind", "district"], paint: { "fill-color": "#1142eb", "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], .085, ["boolean", ["feature-state", "hovered"], false], .055, 0] } });
      map.addLayer({ id: DISTRICT_LINE_ID, type: "line", source: AREA_SOURCE_ID, minzoom: DISTRICT_MIN_ZOOM, maxzoom: DISTRICT_MAX_ZOOM, filter: ["==", "areaKind", "district"], paint: { "line-color": ["case", ["any", ["boolean", ["feature-state", "selected"], false], ["boolean", ["feature-state", "hovered"], false]], "#1142eb", "#758198"], "line-opacity": .9, "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.2, ["boolean", ["feature-state", "hovered"], false], 1.8, 1.2] } });
      map.addLayer({ id: DISTRICT_LABEL_ID, type: "symbol", source: AREA_SOURCE_ID, minzoom: DISTRICT_MIN_ZOOM, maxzoom: DISTRICT_MAX_ZOOM, filter: ["==", "areaKind", "district"], layout: { "text-field": ["get", "name"], "text-font": ["Liberation Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 11, 11, 15, 13], "text-allow-overlap": false }, paint: { "text-color": "#5d5e5a", "text-halo-color": "#eeece6", "text-halo-width": 1.4 } });
      map.addLayer({ id: NEIGHBORHOOD_FILL_ID, type: "fill", source: AREA_SOURCE_ID, minzoom: NEIGHBORHOOD_MIN_ZOOM, maxzoom: NEIGHBORHOOD_MAX_ZOOM, filter: ["==", "areaKind", "neighborhood"], paint: { "fill-color": "#1142eb", "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], .08, ["boolean", ["feature-state", "hovered"], false], .035, .006] } });
      map.addLayer({ id: NEIGHBORHOOD_LINE_ID, type: "line", source: AREA_SOURCE_ID, minzoom: NEIGHBORHOOD_MIN_ZOOM, maxzoom: NEIGHBORHOOD_MAX_ZOOM, filter: ["==", "areaKind", "neighborhood"], paint: { "line-color": ["case", ["any", ["boolean", ["feature-state", "selected"], false], ["boolean", ["feature-state", "hovered"], false]], "#1142eb", "#7f899f"], "line-opacity": .9, "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.2, ["boolean", ["feature-state", "hovered"], false], 1.8, 1.15] } });
      map.addLayer({ id: NEIGHBORHOOD_LABEL_ID, type: "symbol", source: AREA_SOURCE_ID, minzoom: NEIGHBORHOOD_MIN_ZOOM, maxzoom: NEIGHBORHOOD_MAX_ZOOM, filter: ["==", "areaKind", "neighborhood"], layout: { "text-field": ["get", "name"], "text-font": ["Liberation Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 15, 12], "text-allow-overlap": false }, paint: { "text-color": "#50555f", "text-halo-color": "#eeece6", "text-halo-width": 1.5 } });
      map.addLayer({ id: AREA_HOVER_FILL_ID, type: "fill", source: AREA_SOURCE_ID, filter: ["==", "code", "__none__"], paint: { "fill-color": "#1142eb", "fill-opacity": .1 } });
      map.addLayer({ id: AREA_HOVER_LINE_ID, type: "line", source: AREA_SOURCE_ID, filter: ["==", "code", "__none__"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#1142eb", "line-opacity": .95, "line-width": 2.2 } });
      map.addLayer({ id: PARCEL_FILL_ID, type: "fill", source: PARCEL_SOURCE_ID, minzoom: PARCEL_MIN_ZOOM, paint: { "fill-color": ["case", ["boolean", ["feature-state", "selected"], false], "#315de9", ["boolean", ["feature-state", "hovered"], false], "#8fa5ff", "#7c7d78"], "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], .14, ["boolean", ["feature-state", "hovered"], false], .08, .015] } });
      map.addLayer({ id: PARCEL_OUTLINE_ID, type: "line", source: PARCEL_SOURCE_ID, minzoom: PARCEL_MIN_ZOOM, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["case", ["any", ["boolean", ["feature-state", "selected"], false], ["boolean", ["feature-state", "hovered"], false]], "#315de9", "#7b7c77"], "line-opacity": ["case", ["any", ["boolean", ["feature-state", "selected"], false], ["boolean", ["feature-state", "hovered"], false]], .92, .62], "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2, ["boolean", ["feature-state", "hovered"], false], 1.45, .75] } });
      map.addLayer({ id: FILL_ID, type: "fill", source: SOURCE_ID, minzoom: BAG_SELECTION_MIN_ZOOM, maxzoom: 17, layout: { "fill-sort-key": ["case", ["==", ["get", "status"], "Pand gesloopt"], 0, 1] }, paint: { "fill-antialias": true, "fill-color": ["case", ["boolean", ["feature-state", "selected"], false], "#315de9", ["boolean", ["feature-state", "hovered"], false], "#8fa5ff", ["==", ["get", "status"], "Pand gesloopt"], "#d98b8b", ["boolean", ["get", "opportunityCandidate"], false], "#c6addd", ["has", "poiCategory"], "#f3e8ad", "#d7d6d2"], "fill-opacity": ["case", ["any", ["boolean", ["feature-state", "selected"], false], ["boolean", ["feature-state", "hovered"], false]], .9, 1], "fill-outline-color": ["case", ["boolean", ["feature-state", "selected"], false], "#1142eb", ["boolean", ["feature-state", "hovered"], false], "#315de9", ["==", ["get", "status"], "Pand gesloopt"], "#a64a4a", ["boolean", ["get", "opportunityCandidate"], false], "#785096", ["has", "poiCategory"], "#d8c96f", "#555653"] } });
      map.addLayer({ id: OUTLINE_ID, type: "line", source: SOURCE_ID, minzoom: BAG_SELECTION_MIN_ZOOM, maxzoom: 17, layout: { "line-cap": "round", "line-join": "round", "line-sort-key": ["case", ["==", ["get", "status"], "Pand gesloopt"], 0, 1] }, paint: { "line-color": ["case", ["boolean", ["feature-state", "selected"], false], "#1142eb", ["boolean", ["feature-state", "hovered"], false], "#315de9", ["==", ["get", "status"], "Pand gesloopt"], "#a64a4a", ["boolean", ["get", "opportunityCandidate"], false], "#785096", ["has", "poiCategory"], "#d8c96f", "#555653"], "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.8, ["boolean", ["feature-state", "hovered"], false], 2, ["any", ["==", ["get", "status"], "Pand gesloopt"], ["boolean", ["get", "opportunityCandidate"], false], ["has", "poiCategory"]], 1.15, .65], "line-opacity": ["case", ["boolean", ["feature-state", "selected"], false], .92, ["boolean", ["feature-state", "hovered"], false], .95, ["any", ["==", ["get", "status"], "Pand gesloopt"], ["boolean", ["get", "opportunityCandidate"], false], ["has", "poiCategory"]], .9, .7], "line-blur": ["case", ["boolean", ["feature-state", "selected"], false], .8, 0] } });
      map.addLayer({ id: BAG_TILE_FILL_ID, type: "fill", source: BAG_TILE_SOURCE_ID, "source-layer": BAG_TILE_SOURCE_LAYER, minzoom: 17, layout: { "fill-sort-key": ["case", ["==", ["get", "status"], "Pand gesloopt"], 0, 1] }, paint: { "fill-antialias": true, "fill-color": ["case", ["boolean", ["feature-state", "selected"], false], "#315de9", ["boolean", ["feature-state", "hovered"], false], "#8fa5ff", ["==", ["get", "status"], "Pand gesloopt"], "#d98b8b", ["boolean", ["feature-state", "vacancy"], false], "#c6addd", ["any", ["boolean", ["feature-state", "poi"], false], ["in", "onderwijsfunctie", ["to-string", ["get", "gebruiksdoel"]]], ["in", "gezondheidszorgfunctie", ["to-string", ["get", "gebruiksdoel"]]]], "#f3e8ad", "#d7d6d2"], "fill-opacity": ["case", ["any", ["boolean", ["feature-state", "selected"], false], ["boolean", ["feature-state", "hovered"], false]], .9, 1], "fill-outline-color": ["case", ["boolean", ["feature-state", "selected"], false], "#1142eb", ["boolean", ["feature-state", "hovered"], false], "#315de9", ["==", ["get", "status"], "Pand gesloopt"], "#a64a4a", ["boolean", ["feature-state", "vacancy"], false], "#785096", ["any", ["boolean", ["feature-state", "poi"], false], ["in", "onderwijsfunctie", ["to-string", ["get", "gebruiksdoel"]]], ["in", "gezondheidszorgfunctie", ["to-string", ["get", "gebruiksdoel"]]]], "#d8c96f", "#555653"] } });
      map.addLayer({ id: BAG_TILE_OUTLINE_ID, type: "line", source: BAG_TILE_SOURCE_ID, "source-layer": BAG_TILE_SOURCE_LAYER, minzoom: 17, layout: { "line-cap": "round", "line-join": "round", "line-sort-key": ["case", ["==", ["get", "status"], "Pand gesloopt"], 0, 1] }, paint: { "line-color": ["case", ["boolean", ["feature-state", "selected"], false], "#1142eb", ["boolean", ["feature-state", "hovered"], false], "#315de9", ["==", ["get", "status"], "Pand gesloopt"], "#a64a4a", ["boolean", ["feature-state", "vacancy"], false], "#785096", ["any", ["boolean", ["feature-state", "poi"], false], ["in", "onderwijsfunctie", ["to-string", ["get", "gebruiksdoel"]]], ["in", "gezondheidszorgfunctie", ["to-string", ["get", "gebruiksdoel"]]]], "#d8c96f", "#555653"], "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.8, ["boolean", ["feature-state", "hovered"], false], 2, ["any", ["==", ["get", "status"], "Pand gesloopt"], ["boolean", ["feature-state", "vacancy"], false], ["boolean", ["feature-state", "poi"], false]], 1.15, .65], "line-opacity": ["case", ["boolean", ["feature-state", "selected"], false], .92, ["boolean", ["feature-state", "hovered"], false], .95, ["any", ["==", ["get", "status"], "Pand gesloopt"], ["boolean", ["feature-state", "vacancy"], false], ["boolean", ["feature-state", "poi"], false]], .9, .7], "line-blur": ["case", ["boolean", ["feature-state", "selected"], false], .8, 0] } });
      map.addLayer({ id: OPPORTUNITY_LAYER_ID, type: "circle", source: OPPORTUNITY_SOURCE_ID, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 4, 18, 9], "circle-color": ["match", ["get", "opportunityTier"], "high", "#1142eb", "medium", "#5375f2", "#91a6f8"], "circle-opacity": .82, "circle-stroke-color": "#ffffff", "circle-stroke-width": .6 } });
      map.addLayer({ id: OPPORTUNITY_SELECTED_ID, type: "circle", source: OPPORTUNITY_SOURCE_ID, filter: ["==", ["get", "lumenEntityId"], "__none__"], paint: { "circle-radius": 13, "circle-color": "transparent", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
      map.addLayer({ id: SCENARIO_FILL_ID, type: "fill", source: SCENARIO_SOURCE_ID, paint: { "fill-color": "#1142eb", "fill-opacity": .42 } });
      map.addLayer({ id: SCENARIO_OUTLINE_ID, type: "line", source: SCENARIO_SOURCE_ID, paint: { "line-color": "#ffffff", "line-width": 1.5, "line-dasharray": [2, 1] } });
      map.addLayer({ id: DRAWING_FILL_ID, type: "fill", source: DRAWING_SOURCE_ID, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": ["get", "color"], "fill-opacity": .14 } });
      map.addLayer({ id: DRAWING_LINE_ID, type: "line", source: DRAWING_SOURCE_ID, paint: { "line-color": ["get", "color"], "line-width": 2, "line-opacity": .95 } });
      map.addLayer({ id: DRAWING_POINT_ID, type: "circle", source: DRAWING_SOURCE_ID, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": ["get", "color"], "circle-stroke-color": "#fff", "circle-stroke-width": 1 } });
      map.addLayer({ id: DRAWING_VERTEX_ID, type: "circle", source: DRAWING_VERTEX_SOURCE_ID, paint: { "circle-radius": 6, "circle-color": "#ffffff", "circle-stroke-color": "#1142eb", "circle-stroke-width": 2 } });
      renderDrawings();
      renderDrawingVertices();
      adapter.applyScenarioObjects(worldStore.getState().scenarioObjects);
      void loadAreas();
      void loadBuildingOutlines();
      void loadParcels();
      void loadOpportunities();
      void loadPois();
    });
    map.on("error", (event) => {
      if (!("sourceId" in event) || event.sourceId !== SOURCE_ID && event.sourceId !== BAG_TILE_SOURCE_ID) return;
      const message = event.error instanceof Error ? event.error.message : "BAG-kaarttegels konden niet worden geladen.";
      worldStore.setLayerStatus("buildings", "error", message);
    });
    let draggedVertexIndex: number | null = null;
    let dragMoved = false;
    let suppressNextMapClick = false;
    map.on("mousedown", DRAWING_VERTEX_ID, (event: MapLayerMouseEvent) => {
      const vertexIndex = Number(event.features?.[0]?.properties?.vertexIndex);
      if (!Number.isInteger(vertexIndex) || !editingCoordinates?.[vertexIndex]) return;
      event.preventDefault();
      draggedVertexIndex = vertexIndex;
      dragMoved = false;
      map.dragPan.disable();
      map.getCanvas().style.cursor = "grabbing";
    });
    map.on("mousemove", (event) => {
      if (draggedVertexIndex === null || !editingCoordinates) return;
      editingCoordinates[draggedVertexIndex] = [event.lngLat.lng, event.lngLat.lat];
      dragMoved = true;
      renderDrawings();
      renderDrawingVertices();
    });
    const finishVertexDrag = () => {
      if (draggedVertexIndex === null) return;
      draggedVertexIndex = null;
      map.dragPan.enable();
      map.getCanvas().style.cursor = "grab";
      if (!dragMoved || !previousEditingDrawingId || !editingCoordinates) return;
      suppressNextMapClick = true;
      worldStore.execute({ type: "update_drawing", drawingId: previousEditingDrawingId, changes: { coordinates: editingCoordinates } });
    };
    map.on("mouseup", finishVertexDrag);
    window.addEventListener("mouseup", finishVertexDrag);
    map.on("mouseenter", DRAWING_VERTEX_ID, () => { if (draggedVertexIndex === null) map.getCanvas().style.cursor = "grab"; });
    map.on("mouseleave", DRAWING_VERTEX_ID, () => { if (draggedVertexIndex === null) map.getCanvas().style.cursor = ""; });
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let outlinePreloadTimer: ReturnType<typeof setTimeout> | null = null;
    map.on("movestart", () => { adapter.hoverAreaFeature(null); adapter.hoverParcelFeature(null); adapter.hoverTileFeature(null); });
    map.on("move", () => {
      if (!activeRef.current || map.getZoom() < BAG_SELECTION_MIN_ZOOM) return;
      if (outlinePreloadTimer) clearTimeout(outlinePreloadTimer);
      outlinePreloadTimer = setTimeout(() => void loadBuildingOutlines(), 120);
    });
    map.on("moveend", () => {
      if (!activeRef.current) return;
      if (outlinePreloadTimer) {
        clearTimeout(outlinePreloadTimer);
        outlinePreloadTimer = null;
      }
      setSettledZoom(map.getZoom());
      worldStore.execute({ type: "set_camera", camera: adapter.readCamera() });
      const selectedId = worldStore.getState().selectedEntityId;
      const selected = selectedId ? worldStore.getState().entities[selectedId] : null;
      const selectedAreaKind = selected?.properties.areaKind;
      const areaLevelEnded = (selectedAreaKind === "municipality" && map.getZoom() >= MUNICIPALITY_MAX_ZOOM)
        || (selectedAreaKind === "district" && map.getZoom() >= DISTRICT_MAX_ZOOM)
        || (selectedAreaKind === "neighborhood" && map.getZoom() >= NEIGHBORHOOD_MAX_ZOOM);
      if (areaLevelEnded) {
        adapter.selectAreaFeature(null);
        worldStore.execute({ type: "deselect_entity" });
      }
      if (selectionIsOutsideMap(map)) worldStore.execute({ type: "deselect_entity" });
      void loadBuildingOutlines();
      void loadParcels();
      void loadPois();
      schedulePoiTileDecoration();
      void loadAreas();
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => void loadOpportunities(), 450);
    });
    const selectBuilding = async (event: MapLayerMouseEvent) => {
      if (worldStore.getState().editingDrawingId) return;
      const feature = event.features?.[0];
      const rawId = feature?.properties?.identificatie ?? feature?.id;
      const pdokFeatureId = feature?.properties?.pdokFeatureId;
      if (rawId === undefined || rawId === null) return;
      const currentId = worldStore.getState().selectedEntityId;
      const current = currentId ? worldStore.getState().entities[currentId] : null;
      if (String(current?.properties.identificatie ?? "") === String(rawId)) {
        detailControllerRef.current?.abort();
        adapter.selectTileFeature(null);
        worldStore.execute({ type: "deselect_entity" });
        return;
      }
      adapter.selectTileFeature(rawId);
      detailControllerRef.current?.abort();
      const detailController = new AbortController();
      detailControllerRef.current = detailController;
      try {
        const timeout = window.setTimeout(() => detailController.abort(), 4_000);
        const detailUrl = typeof pdokFeatureId === "string" && pdokFeatureId
          ? `/api/world/buildings?featureId=${encodeURIComponent(pdokFeatureId)}`
          : `/api/world/buildings?identificatie=${encodeURIComponent(String(rawId))}`;
        const response = await fetch(detailUrl, { signal: detailController.signal }).finally(() => window.clearTimeout(timeout));
        const data = await response.json() as BuildingResponse | BuildingDetailResponse;
        if (!response.ok) throw new Error(data.error ?? "BAG-detail kon niet worden geladen.");
        const selected = "entities" in data
          ? data.entities.find((candidate) => String(candidate.properties.identificatie) === String(rawId)) ?? data.entities[0]
          : data.entity;
        if (!selected) return;
        const poi = poiByBuildingId.get(String(rawId));
        const enriched = poi ? { ...selected, name: poi.name, description: poi.description, properties: { ...selected.properties, poiCategory: poi.properties.category, poiName: poi.name }, provenance: [...selected.provenance, ...poi.provenance] } : selected;
        worldStore.replaceEntitiesOfType("building", [enriched]);
        const center = enriched.geometry?.center;
        const containingParcel = center ? containingParcelEntity(center, parcelFeatures, parcelEntities) : null;
        if (containingParcel) worldStore.linkEntities(enriched.id, containingParcel.id);
        worldStore.execute({ type: "select_entity", entityId: entityId(String(enriched.id)) });
      } catch {
        // The renderer-local highlight remains responsive if enrichment is unavailable.
      }
    };
    map.on("click", FILL_ID, selectBuilding);
    map.on("click", BAG_TILE_FILL_ID, selectBuilding);
    map.on("click", PARCEL_FILL_ID, (event: MapLayerMouseEvent) => {
      if (worldStore.getState().editingDrawingId) return;
      if (map.queryRenderedFeatures(event.point, { layers: [FILL_ID, BAG_TILE_FILL_ID] }).length) return;
      const rawId = event.features?.[0]?.properties?.identificatie ?? event.features?.[0]?.id;
      if (rawId === undefined || rawId === null) return;
      const parcel = parcelEntities.get(String(rawId));
      if (!parcel) return;
      if (worldStore.getState().selectedEntityId === parcel.id) { adapter.selectParcelFeature(null); worldStore.execute({ type: "deselect_entity" }); return; }
      worldStore.execute({ type: "select_entity", entityId: parcel.id });
    });
    const selectArea = (kind: "municipality" | "district" | "neighborhood", event: MapLayerMouseEvent) => {
      if (worldStore.getState().editingDrawingId) return;
      const feature = event.features?.[0];
      if (!feature) return;
      const selected = areaEntity(feature as unknown as GeoJSON.Feature, areaProvenance);
      const bounds = geometryBounds(feature.geometry as GeoJSON.Geometry);
      if (!selected || !bounds) return;
      if (worldStore.getState().selectedEntityId === selected.id) {
        adapter.selectAreaFeature(null);
        worldStore.execute({ type: "deselect_entity" });
        return;
      }
      worldStore.replaceEntitiesOfType(selected.type, [selected]);
      worldStore.execute({ type: "select_entity", entityId: selected.id });
      const maxZoom = kind === "municipality"
        ? MUNICIPALITY_MAX_ZOOM - .25
        : kind === "district"
          ? DISTRICT_MAX_ZOOM - .25
          : NEIGHBORHOOD_MAX_ZOOM - .25;
      map.fitBounds(bounds, { padding: 72, maxZoom, duration: 650 });
    };
    map.on("click", MUNICIPALITY_FILL_ID, (event: MapLayerMouseEvent) => selectArea("municipality", event));
    map.on("click", DISTRICT_FILL_ID, (event: MapLayerMouseEvent) => selectArea("district", event));
    map.on("click", NEIGHBORHOOD_FILL_ID, (event: MapLayerMouseEvent) => selectArea("neighborhood", event));
    map.on("click", (event) => {
      if (suppressNextMapClick) { suppressNextMapClick = false; return; }
      const drawingMode = worldStore.getState().drawingMode;
      if (drawingMode) {
        draftDrawing.push([event.lngLat.lng, event.lngLat.lat]); renderDrawings();
        if (drawingMode === "point" || drawingMode === "rectangle" && draftDrawing.length === 2) finishDrawing();
        return;
      }
      if (worldStore.getState().editingDrawingId) return;
      if (map.queryRenderedFeatures(event.point, { layers: [FILL_ID, BAG_TILE_FILL_ID, PARCEL_FILL_ID, OPPORTUNITY_LAYER_ID, MUNICIPALITY_FILL_ID, DISTRICT_FILL_ID, NEIGHBORHOOD_FILL_ID] }).length) return;
      detailControllerRef.current?.abort();
      adapter.selectTileFeature(null);
      adapter.selectAreaFeature(null);
      worldStore.execute({ type: "deselect_entity" });
    });
    map.on("dblclick", (event) => { if (!worldStore.getState().drawingMode) return; event.preventDefault(); finishDrawing(); });
    let hoverFrame: number | null = null;
    let pendingHover: string | null = null;
    const hoverBuilding = (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.identificatie ?? event.features?.[0]?.id;
      pendingHover = id === undefined || id === null ? null : String(id);
      if (hoverFrame !== null) return;
      hoverFrame = window.requestAnimationFrame(() => {
        hoverFrame = null;
        adapter.hoverTileFeature(pendingHover);
      });
    };
    for (const layerId of [FILL_ID, BAG_TILE_FILL_ID]) {
      map.on("mousemove", layerId, hoverBuilding);
      map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; adapter.hoverTileFeature(null); });
    }
    map.on("mousemove", PARCEL_FILL_ID, (event: MapLayerMouseEvent) => {
      if (map.queryRenderedFeatures(event.point, { layers: [FILL_ID, BAG_TILE_FILL_ID] }).length) { adapter.hoverParcelFeature(null); return; }
      const id = event.features?.[0]?.properties?.identificatie ?? event.features?.[0]?.id;
      adapter.hoverParcelFeature(id === undefined || id === null ? null : String(id));
    });
    map.on("mouseenter", PARCEL_FILL_ID, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", PARCEL_FILL_ID, () => { map.getCanvas().style.cursor = ""; adapter.hoverParcelFeature(null); });
    const registerAreaHover = (layerId: string) => {
      map.on("mousemove", layerId, (event: MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.code ?? event.features?.[0]?.id;
        adapter.hoverAreaFeature(id === undefined || id === null ? null : String(id));
      });
      map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; adapter.hoverAreaFeature(null); });
    };
    registerAreaHover(MUNICIPALITY_FILL_ID);
    registerAreaHover(DISTRICT_FILL_ID);
    registerAreaHover(NEIGHBORHOOD_FILL_ID);
    map.on("click", OPPORTUNITY_LAYER_ID, (event: MapLayerMouseEvent) => {
      if (worldStore.getState().editingDrawingId) return;
      const id = event.features?.[0]?.properties?.lumenEntityId;
      if (!id) return;
      const nextId = entityId(String(id));
      worldStore.execute(worldStore.getState().selectedEntityId === nextId ? { type: "deselect_entity" } : { type: "select_entity", entityId: nextId });
    });
    map.on("mouseenter", OPPORTUNITY_LAYER_ID, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", OPPORTUNITY_LAYER_ID, () => { map.getCanvas().style.cursor = ""; });
    const observer = new ResizeObserver(() => adapter.resize()); observer.observe(containerRef.current);
    return () => { window.removeEventListener("mouseup", finishVertexDrag); if (draggedVertexIndex !== null) map.dragPan.enable(); unsubscribeDrawingMode(); loadBuildingsRef.current = null; loadParcelsRef.current = null; loadOpportunitiesRef.current = null; loadPoisRef.current = null; if (settleTimer) clearTimeout(settleTimer); if (outlinePreloadTimer) clearTimeout(outlinePreloadTimer); if (hoverFrame !== null) window.cancelAnimationFrame(hoverFrame); detailControllerRef.current?.abort(); areaLoaderRef.current.cancel(); outlineLoaderRef.current.cancel(); parcelLoaderRef.current.cancel(); opportunityLoaderRef.current.cancel(); poiLoaderRef.current.cancel(); observer.disconnect(); adapter.unmount(); adapterRef.current = null; };
  }, []);

  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter) return;
    if (!active) {
      adapter.map.stop();
      detailControllerRef.current?.abort();
      outlineLoaderRef.current.cancel();
      parcelLoaderRef.current.cancel();
      opportunityLoaderRef.current.cancel();
      return;
    }
    adapter.resize();
    adapter.applyCamera(worldStore.getState().camera);
    loadBuildingsRef.current?.();
    loadParcelsRef.current?.();
    loadOpportunitiesRef.current?.();
    loadPoisRef.current?.();
  }, [active]);
  useEffect(() => { if (active) adapterRef.current?.applyCamera(camera); }, [active, camera]);
  useEffect(() => { adapterRef.current?.applySelection(selectedEntityId ? entities[selectedEntityId] ?? null : null); }, [entities, selectedEntityId]);
  useEffect(() => { if (active) loadPoisRef.current?.(); }, [active, selectedEntityId]);
  useEffect(() => {
    adapterRef.current?.applyLayers(worldStore.getState().layers);
    loadBuildingsRef.current?.();
    loadParcelsRef.current?.();
    loadOpportunitiesRef.current?.();
    loadPoisRef.current?.();
  }, [amenitiesVisible, buildingsVisible, parcelsVisible, vacancyVisible]);
  useEffect(() => { adapterRef.current?.applyScenarioObjects(scenarioObjects); }, [scenarioObjects]);
  useEffect(() => { const map = adapterRef.current?.map; const source = map?.getSource(DRAWING_SOURCE_ID) as GeoJSONSource | undefined; source?.setData({ type: "FeatureCollection", features: drawingFeatures(drawings) }); }, [drawings]);
  useEffect(() => { const canvas = adapterRef.current?.map.getCanvas(); if (canvas) canvas.style.cursor = drawingMode ? "crosshair" : editingDrawingId ? "grab" : ""; }, [drawingMode, editingDrawingId]);

  return <div className="maplibreWorld" aria-label="Interactieve BAG-kaart van Nederland">
    <div ref={containerRef} className="maplibreCanvas" />
    {!rendererError && settledZoom < BAG_SELECTION_MIN_ZOOM ? <div className="buildingZoomHint">{settledZoom < MUNICIPALITY_MAX_ZOOM ? "Selecteer een gemeente" : settledZoom < DISTRICT_MAX_ZOOM ? "Selecteer een wijk" : "Selecteer een buurt"}</div> : null}
    {rendererError ? <div className="mapUnavailable" role="alert"><strong>Kaartweergave niet beschikbaar</strong><span>{rendererError}</span><button onClick={() => window.location.reload()}>Opnieuw laden</button></div> : null}
  </div>;
}
