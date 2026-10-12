import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { drawingFeatures, drawingVertexFeatures } from "@/lib/drawing-geometry";

describe("MapLibre drawing geometry", () => {
  const drawing = { id: "drawing-1", kind: "rectangle" as const, name: "Bouwvlak", coordinates: [[6.1, 52.2], [6.2, 52.3]] as const, color: "#315df0", version: 1, createdAt: "2026-09-11T00:00:00.000Z", updatedAt: "2026-09-11T00:00:00.000Z" };

  it("renders edited coordinates without mutating the stored drawing", () => {
    const edited = [[6.15, 52.25], [6.25, 52.35]] as const;
    const feature = drawingFeatures([drawing], [], { id: drawing.id, coordinates: edited })[0];
    expect(feature?.geometry).toMatchObject({ type: "Polygon", coordinates: [[[6.15, 52.25], [6.25, 52.25], [6.25, 52.35], [6.15, 52.35], [6.15, 52.25]]] });
    expect(drawing.coordinates[0]).toEqual([6.1, 52.2]);
  });

  it("exposes one draggable handle per canonical vertex", () => {
    const handles = drawingVertexFeatures(drawing.id, drawing.coordinates);
    expect(handles.features).toHaveLength(2);
    expect(handles.features[1]).toMatchObject({ properties: { drawingId: drawing.id, vertexIndex: 1 }, geometry: { type: "Point", coordinates: [6.2, 52.3] } });
  });

  it("does not feed layer loading status back into viewport loaders", () => {
    const source = readFileSync(resolve(process.cwd(), "components/MapLibreWorld.tsx"), "utf8");
    expect(source).not.toContain("useWorldSelector((state) => state.layers)");
    expect(source).not.toContain("}, [layers]);");
    expect(source).toContain("[amenitiesVisible, buildingsVisible, parcelsVisible, vacancyVisible]");
  });

  it("reuses buffered coverage for every high-frequency viewport layer", () => {
    const source = readFileSync(resolve(process.cwd(), "components/MapLibreWorld.tsx"), "utf8");
    expect(source).toContain("viewportContains(buildingCoverage, viewport)");
    expect(source).toContain("viewportContains(parcelCoverage, viewport)");
    expect(source).toContain("viewportContains(opportunityCoverage, viewport)");
    expect(source).toContain("viewportContains(poiCoverage, viewport)");
    expect(source).toContain("viewportContains(areaCoverage, viewport)");
    expect(source).toContain("viewportContains(pendingOpportunityCoverage, viewport)");
    expect(source).toContain("viewportContains(pendingPoiCoverage, viewport)");
    expect(source).toContain("viewportContains(pendingAreaCoverage, viewport)");
  });

  it("uses the server retrieval provenance for selected CBS areas", () => {
    const source = readFileSync(resolve(process.cwd(), "components/MapLibreWorld.tsx"), "utf8");
    expect(source).toContain("areaProvenance = loaded.value.response.provenance ?? null");
    expect(source).toContain("areaEntity(feature as unknown as GeoJSON.Feature, areaProvenance)");
    expect(source).not.toContain("areaEntity(feature as unknown as GeoJSON.Feature, new Date().toISOString())");
    expect(source).toContain("population: typeof properties.residents === \"number\" ? properties.residents : null");
  });

  it("switches close-up building interaction to official BAG vector tiles", () => {
    const source = readFileSync(resolve(process.cwd(), "components/MapLibreWorld.tsx"), "utf8");
    expect(source).toContain("https://api.pdok.nl/kadaster/bag/ogc/v2/tiles/WebMercatorQuad/{z}/{y}/{x}?f=mvt");
    expect(source).toContain('source-layer": BAG_TILE_SOURCE_LAYER');
    expect(source).toContain('map.on("click", BAG_TILE_FILL_ID, selectBuilding)');
    expect(source).toContain('/api/world/buildings?identificatie=${encodeURIComponent(String(rawId))}');
    expect(source).toContain("if (map.getZoom() >= 17)");
  });

  it("warms selected-area POIs and decorates visible BAG tile buildings", () => {
    const source = readFileSync(resolve(process.cwd(), "components/MapLibreWorld.tsx"), "utf8");
    expect(source).toContain("selectedArea");
    expect(source).toContain("centeredViewportBounds(viewport, .07)");
    expect(source).toContain("schedulePoiTileDecoration");
    expect(source).toContain('["feature-state", "poi"]');
    expect(source).toContain("if (data.degraded) throw new Error");
  });

  it("renders demolished and vacancy-candidate buildings as sourced states", () => {
    const source = readFileSync(resolve(process.cwd(), "components/MapLibreWorld.tsx"), "utf8");
    expect(source).toContain('"Pand gesloopt"], "#d98b8b"');
    expect(source).toContain('"fill-sort-key": ["case", ["==", ["get", "status"], "Pand gesloopt"], 0, 1]');
    expect(source).toContain('"line-sort-key": ["case", ["==", ["get", "status"], "Pand gesloopt"], 0, 1]');
    expect(source).toContain('["feature-state", "vacancy"]');
    expect(source).toContain('"#c6addd"');
    expect(source).toContain("decorateBuildingsWithOpportunities");
  });

  it("uses exclusive zoom bands for municipality, district, and neighborhood boundaries", () => {
    const source = readFileSync(resolve(process.cwd(), "components/MapLibreWorld.tsx"), "utf8");
    expect(source).toContain("const DISTRICT_MIN_ZOOM = MUNICIPALITY_MAX_ZOOM;");
    expect(source).toContain("const NEIGHBORHOOD_MIN_ZOOM = DISTRICT_MAX_ZOOM;");
    expect(source).not.toContain("const DISTRICT_MIN_ZOOM = 9;");
    expect(source).not.toContain("const NEIGHBORHOOD_MIN_ZOOM = 12;");
  });
});
