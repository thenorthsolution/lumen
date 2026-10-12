import { describe, expect, it } from "vitest";
import { entityId, type WorldEntity } from "@lumen/world";
import { worldStore } from "@/lib/world-store";
import { buildWorldAIContext } from "./world-context";

describe("controlled AI world context", () => {
  it("exposes allowlisted facts and provenance, never arbitrary source payloads", () => {
    worldStore.reset();
    const entity: WorldEntity = { id: entityId("bag-pand-1"), type: "building", name: "Pand", description: "Test", properties: { bouwjaar: 1980, secretPayload: "must-not-leak" }, provenance: [{ sourceId: "bag", sourceLabel: "BAG", retrievedAt: "2026-09-11T00:00:00.000Z", confidence: "verified", methodVersion: "bag-v2", assumptions: ["Geen verblijfsobjectdetail geladen"], limitations: ["Geen actuele gebruiksmeting"] }] };
    worldStore.replaceEntities([entity]);
    worldStore.execute({ type: "select_entity", entityId: entity.id });
    const context = buildWorldAIContext(worldStore.getState());
    expect(context.activeTool).toBe("explore");
    expect(context.entities[0]).toMatchObject({ id: entity.id, properties: { bouwjaar: 1980 }, sources: [{ sourceId: "bag", confidence: "verified", methodVersion: "bag-v2", limitations: ["Geen actuele gebruiksmeting", "Geen verblijfsobjectdetail geladen"] }] });
    expect(context.entities[0]?.facets.find((facet) => facet.id === "overview")).toMatchObject({ availability: "partial", values: { bouwjaar: 1980 } });
    expect(context.entities[0]?.properties).not.toHaveProperty("secretPayload");
  });

  it("prioritizes selected, project and compared entities and exposes reproducible scenario context", () => {
    worldStore.reset();
    const entities: WorldEntity[] = Array.from({ length: 35 }, (_, index) => ({ id: entityId(`building-${index}`), type: "building", name: `Gebouw ${String(index).padStart(2, "0")}`, properties: {}, provenance: [] }));
    worldStore.replaceEntities(entities);
    worldStore.execute({ type: "create_project", siteId: entities[34]!.id, name: "Pilot" });
    worldStore.execute({ type: "create_scenario", name: "Voorkeur" });
    worldStore.execute({ type: "estimate_scenario", inputs: { siteAreaM2: 1000, coverageRatio: .5, floors: 2, grossToNetRatio: .8, averageHomeAreaM2: 80, constructionCostPerGfaM2: 2000, preparationMonths: 12, constructionMonthsPer10kGfa: 30 } });
    worldStore.execute({ type: "toggle_comparison_entity", entityId: entities[33]!.id });
    worldStore.execute({ type: "select_entity", entityId: entities[32]!.id });

    const context = buildWorldAIContext(worldStore.getState());

    expect(context.entities.slice(0, 3).map((entity) => entity.id)).toEqual([entities[32]!.id, entities[34]!.id, entities[33]!.id]);
    expect(context.entities).toHaveLength(8);
    expect(context.project).toMatchObject({ name: "Pilot", siteId: entities[34]!.id, saved: false });
    expect(context.scenario).toMatchObject({ name: "Voorkeur", calculation: { methodVersion: "indicative-scenario-1.0.0", inputs: { floors: 2 }, grossFloorAreaM2: 1000 } });
  });

  it("preserves the CBS district level and exposes its allowlisted area facts", () => {
    worldStore.reset();
    const district: WorldEntity = { id: entityId("cbs-district-WK015005"), type: "district", name: "Keizerslanden", properties: { code: "WK015005", areaKind: "district", municipality: "Deventer", municipalityCode: "GM0150", parentCode: "GM0150", parentName: "Deventer", residents: 12000, year: 2025 }, relatedEntityIds: [entityId("cbs-municipality-GM0150")], provenance: [{ sourceId: "cbs", sourceLabel: "CBS", retrievedAt: "2026-09-11T00:00:00.000Z", confidence: "verified" }] };
    worldStore.replaceEntities([district]);

    const context = buildWorldAIContext(worldStore.getState());

    expect(context.entities[0]).toMatchObject({ type: "district", properties: { code: "WK015005", areaKind: "district", municipality: "Deventer", municipalityCode: "GM0150", parentCode: "GM0150", residents: 12000, year: 2025 }, relatedEntityIds: ["cbs-municipality-GM0150"] });
    expect(context.entities[0]?.facets.map((facet) => facet.id)).toContain("population");
  });

  it("exposes the same source-aware suitability and accessibility analysis to AI", () => {
    worldStore.reset();
    const source = { sourceId: "brk", sourceLabel: "Kadastrale Kaart", sourceUrl: "https://www.pdok.nl", retrievedAt: "2026-09-11T00:00:00.000Z", confidence: "verified" as const, methodVersion: "brk-ogc-v1" };
    const parcel: WorldEntity = { id: entityId("parcel-analysis"), type: "parcel", name: "Perceel", properties: { areaM2: 1250, permittedUse: false }, provenance: [source], geometry: { kind: "point", center: [6.155, 52.255], coordinateSystem: "WGS84" } };
    const school: WorldEntity = { id: entityId("school-analysis"), type: "infrastructure", name: "School", properties: { amenity: "school" }, provenance: [{ ...source, sourceId: "openstreetmap", sourceLabel: "© OpenStreetMap contributors", methodVersion: "osm-overpass-poi-1.0.0" }], geometry: { kind: "point", center: [6.155, 52.258], coordinateSystem: "WGS84" } };
    worldStore.replaceEntities([parcel, school]);
    worldStore.execute({ type: "select_entity", entityId: parcel.id });

    const context = buildWorldAIContext(worldStore.getState());

    expect(context.selectedAnalysis?.suitability).toMatchObject({ conclusion: "blocked", methodVersion: "known-input-suitability-1.0.0", blockers: [{ code: "USE_NOT_PERMITTED", severity: "hard", source: { sourceId: "brk" } }] });
    expect(context.selectedAnalysis?.suitability.dimensions).toEqual(expect.arrayContaining([{ dimension: "physical", status: "suitable", score: null, confidence: "verified", metrics: [expect.objectContaining({ key: "area-m2", value: 1250, source: expect.objectContaining({ sourceId: "brk" }) })] }]));
    expect(context.selectedAnalysis?.accessibility?.themes.education).toEqual({ score: null, confidence: "unknown" });
    expect(context.selectedAnalysis?.accessibility?.measures[0]).toMatchObject({ destinationType: "school", mode: "walk", status: "estimated", distanceMeters: expect.any(Number), source: { sourceId: "lumen-proximity:openstreetmap", methodVersion: "straight-line-proximity-1.0.0" } });
  });

  it("does not turn unproven object properties into AI suitability facts", () => {
    worldStore.reset();
    const parcel: WorldEntity = { id: entityId("parcel-unproven"), type: "parcel", name: "Bronloos perceel", properties: { areaM2: 5000, permittedUse: true }, provenance: [] };
    worldStore.replaceEntities([parcel]);
    worldStore.execute({ type: "select_entity", entityId: parcel.id });

    const context = buildWorldAIContext(worldStore.getState());

    expect(context.selectedAnalysis?.suitability.conclusion).toBe("needs-research");
    expect(context.selectedAnalysis?.suitability.dimensions.every((dimension) => dimension.status === "needs-research")).toBe(true);
  });

  it("exposes controlled layer capability and source metadata", () => {
    worldStore.reset();

    const context = buildWorldAIContext(worldStore.getState());

    expect(context.layers.find((layer) => layer.id === "buildings")).toMatchObject({
      label: "Gebouwen", coverage: "national", minZoom: 14.5,
      supportedRenderers: ["map-2d", "world-3d"],
      sources: [{ sourceId: "bag", authority: "Kadaster", availability: "available", access: "public", freshness: "daily" }],
    });
    expect(context.layers.find((layer) => layer.id === "constraints")).toMatchObject({
      sources: [{ sourceId: "dso", availability: "planned" }],
    });
  });
});
