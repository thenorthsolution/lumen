import { beforeEach, describe, expect, it } from "vitest";
import { entityId, layerId, type WorldEntity } from "@lumen/world";
import { worldStore } from "./world-store";

const building: WorldEntity = { id: entityId("bag-pand-test"), type: "building", name: "Testpand", provenance: [], properties: {} };

describe("world command execution", () => {
  beforeEach(() => worldStore.reset());

  it("selects known entities and rejects unknown entities", () => {
    worldStore.replaceEntities([building]);
    expect(worldStore.execute({ type: "select_entity", entityId: building.id }).status).toBe("success");
    expect(worldStore.getState().selectedEntityId).toBe(building.id);
    expect(worldStore.execute({ type: "select_entity", entityId: entityId("missing") }).status).toBe("rejected");
  });

  it("registers viewport entities and reports layer loading errors", () => {
    worldStore.replaceEntities([building]);
    worldStore.setLayerStatus("buildings", "error", "PDOK niet bereikbaar");
    expect(worldStore.getState().entities[building.id]).toEqual(building);
    expect(worldStore.getState().layers.buildings).toMatchObject({ status: "error", error: "PDOK niet bereikbaar" });
  });

  it("replaces one entity type without discarding other world entities", () => {
    const opportunity: WorldEntity = { id: entityId("vacancy-test"), type: "opportunity", name: "Testkans", provenance: [], properties: {} };
    worldStore.replaceEntities([building]);
    worldStore.replaceEntitiesOfType("opportunity", [opportunity]);
    expect(Object.keys(worldStore.getState().entities)).toEqual([building.id, opportunity.id]);
  });

  it("links two known canonical entities bidirectionally and idempotently", () => {
    const parcel: WorldEntity = { id: entityId("brk-perceel-test"), type: "parcel", name: "Perceel test", provenance: [], properties: {} };
    worldStore.replaceEntities([building, parcel]);

    expect(worldStore.linkEntities(building.id, parcel.id)).toBe(true);
    expect(worldStore.linkEntities(building.id, parcel.id)).toBe(true);
    expect(worldStore.getState().entities[building.id]?.relatedEntityIds).toEqual([parcel.id]);
    expect(worldStore.getState().entities[parcel.id]?.relatedEntityIds).toEqual([building.id]);
    expect(worldStore.linkEntities(building.id, entityId("missing"))).toBe(false);
  });

  it("updates registered layer visibility", () => {
    const result = worldStore.execute({ type: "set_layer_visibility", layerId: layerId("vacancy"), visible: false });
    expect(result.affected).toContain("layers");
    expect(worldStore.getState().layers.vacancy?.visible).toBe(false);
  });

  it("rejects unavailable and renderer-incompatible layers", () => {
    expect(worldStore.execute({ type: "set_layer_visibility", layerId: layerId("constraints"), visible: true })).toMatchObject({ status: "rejected" });
    expect(worldStore.execute({ type: "set_layer_visibility", layerId: layerId("vegetation"), visible: true })).toMatchObject({ status: "rejected" });
    expect(worldStore.getState().layers.constraints?.visible).toBe(false);
  });

  it("applies task presets without changing renderer or camera", () => {
    const camera = worldStore.getState().camera;
    const result = worldStore.execute({ type: "set_task_preset", preset: "development" });
    expect(worldStore.getState()).toMatchObject({ taskPreset: "development", camera, renderer: "map-2d" });
    expect(worldStore.getState().layers.parcels?.visible).toBe(true);
    expect(worldStore.getState().layers.amenities?.visible).toBe(false);
    expect(worldStore.getState().layers.constraints?.visible).toBe(false);
    expect(result.message).toContain("Niet geactiveerd: Randvoorwaarden");
  });

  it("stores and removes versioned project drawings", () => {
    const now = "2026-09-11T12:00:00.000Z";
    const drawing = { id: "drawing-1", kind: "polygon" as const, name: "Bouwvlak", coordinates: [[6.1, 52.2], [6.2, 52.2], [6.2, 52.3]] as const, color: "#315df0", version: 1, createdAt: now, updatedAt: now };
    expect(worldStore.execute({ type: "add_drawing", drawing }).status).toBe("success");
    expect(worldStore.getState().drawings).toEqual([drawing]);
    worldStore.execute({ type: "delete_drawing", drawingId: drawing.id });
    expect(worldStore.getState().drawings).toEqual([]);
  });

  it("undoes and redoes completed drawing changes", () => {
    const now = "2026-09-11T12:00:00.000Z";
    const drawing = { id: "history", kind: "point" as const, name: "Punt", coordinates: [[6.1, 52.2]] as const, color: "#315df0", version: 1, createdAt: now, updatedAt: now };
    worldStore.execute({ type: "add_drawing", drawing });
    expect(worldStore.execute({ type: "undo_drawing_change" }).status).toBe("success");
    expect(worldStore.getState().drawings).toEqual([]);
    expect(worldStore.execute({ type: "redo_drawing_change" }).status).toBe("success");
    expect(worldStore.getState().drawings).toEqual([drawing]);
  });

  it("edits drawing geometry in 2D as one versioned undoable change", () => {
    const now = "2026-09-11T12:00:00.000Z";
    const drawing = { id: "editable", kind: "line" as const, name: "Route", coordinates: [[6.1, 52.2], [6.2, 52.3]] as const, color: "#315df0", version: 1, createdAt: now, updatedAt: now };
    worldStore.execute({ type: "add_drawing", drawing });
    expect(worldStore.execute({ type: "set_editing_drawing", drawingId: drawing.id }).status).toBe("success");
    expect(worldStore.getState()).toMatchObject({ editingDrawingId: drawing.id, drawingMode: null, activeTool: "draw" });
    worldStore.execute({ type: "update_drawing", drawingId: drawing.id, changes: { coordinates: [[6.15, 52.25], [6.2, 52.3]] } });
    expect(worldStore.getState().drawings[0]).toMatchObject({ coordinates: [[6.15, 52.25], [6.2, 52.3]], version: 2 });
    worldStore.execute({ type: "undo_drawing_change" });
    expect(worldStore.getState().drawings[0]).toMatchObject({ coordinates: drawing.coordinates, version: 1 });
  });

  it("rejects geometry editing in 3D", () => {
    const drawing = { id: "editable", kind: "point" as const, name: "Punt", coordinates: [[6.1, 52.2]] as const, color: "#315df0", version: 1, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() };
    worldStore.execute({ type: "add_drawing", drawing });
    worldStore.execute({ type: "set_renderer", renderer: "world-3d" });
    expect(worldStore.execute({ type: "set_editing_drawing", drawingId: drawing.id }).status).toBe("rejected");
  });

  it("builds an indicative site from a drawn area", () => {
    const drawing = { id: "area", kind: "rectangle" as const, name: "Kavel", coordinates: [[6.15, 52.25], [6.151, 52.251]] as const, color: "#fff", version: 1, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() };
    worldStore.execute({ type: "add_drawing", drawing });
    expect(worldStore.execute({ type: "analyze_drawing", drawingId: drawing.id }).status).toBe("success");
    const selected = worldStore.getState().entities[worldStore.getState().selectedEntityId!];
    expect(selected).toMatchObject({ type: "site", properties: { drawingId: "area" } });
    expect(Number(selected?.properties.areaM2)).toBeGreaterThan(7_000);
  });

  it("toggles a bounded comparison of known entities", () => {
    const entities = Array.from({ length: 5 }, (_, index) => ({ ...building, id: entityId(`building-${index}`), name: `Pand ${index}` }));
    worldStore.replaceEntities(entities);
    for (const entity of entities.slice(0, 4)) expect(worldStore.execute({ type: "toggle_comparison_entity", entityId: entity.id }).status).toBe("success");
    expect(worldStore.execute({ type: "toggle_comparison_entity", entityId: entities[4]!.id }).status).toBe("rejected");
    worldStore.execute({ type: "toggle_comparison_entity", entityId: entities[0]!.id });
    expect(worldStore.getState().comparisonEntityIds).toHaveLength(3);
    expect(worldStore.execute({ type: "toggle_comparison_entity", entityId: entityId("missing") }).status).toBe("rejected");
  });

  it("pins compared entities while viewport entities are replaced", () => {
    const pinned: WorldEntity = { ...building, id: entityId("building-pinned"), name: "Vastgehouden pand" };
    const incoming: WorldEntity = { ...building, id: entityId("building-incoming"), name: "Nieuw viewportpand" };
    worldStore.replaceEntities([pinned]);
    worldStore.execute({ type: "toggle_comparison_entity", entityId: pinned.id });
    worldStore.replaceEntitiesOfType("building", [incoming]);
    expect(worldStore.getState().entities).toMatchObject({ [pinned.id]: pinned, [incoming.id]: incoming });
    worldStore.execute({ type: "toggle_comparison_entity", entityId: pinned.id });
    worldStore.replaceEntitiesOfType("building", [incoming]);
    expect(worldStore.getState().entities[pinned.id]).toBeUndefined();
  });

  it("uses an oblique camera in 3D and restores the analytical top-down view in 2D", () => {
    const threeDimensional = worldStore.execute({ type: "set_renderer", renderer: "world-3d" });
    expect(threeDimensional.affected).toEqual(["renderer", "camera"]);
    expect(worldStore.getState().camera).toMatchObject({ pitch: 55, bearing: -22 });
    expect(worldStore.getState().camera.zoom).toBeGreaterThanOrEqual(16.1);
    worldStore.execute({ type: "set_renderer", renderer: "map-2d" });
    expect(worldStore.getState().camera.pitch).toBe(0);
  });

  it("orbits around the unchanged center and clamps unsafe camera angles", () => {
    expect(worldStore.execute({ type: "orbit_camera", bearingDelta: 20 }).status).toBe("rejected");
    worldStore.execute({ type: "set_renderer", renderer: "world-3d" });
    const center = worldStore.getState().camera.center;
    const result = worldStore.execute({ type: "orbit_camera", bearingDelta: 70, pitchDelta: 100, zoomDelta: 20 });
    expect(result.status).toBe("success");
    expect(worldStore.getState().camera).toMatchObject({ center, bearing: 48, pitch: 82, zoom: 20 });
  });

  it("finds a matching loaded entity deterministically and selects it", () => {
    const older: WorldEntity = { ...building, id: entityId("bag-old"), name: "Schoolgebouw West", properties: { bouwjaar: 1975, oppervlakte: 900 } };
    const newer: WorldEntity = { ...building, id: entityId("bag-new"), name: "Schoolgebouw Oost", properties: { bouwjaar: 2012, oppervlakte: 1250 } };
    worldStore.replaceEntities([older, newer]);
    const result = worldStore.execute({ type: "find_and_select_entity", entityType: "building", query: "school", minimumBuildYear: 2000, minimumAreaM2: 1000 });
    expect(result.status).toBe("success");
    expect(worldStore.getState().selectedEntityId).toBe(newer.id);
    expect(worldStore.execute({ type: "find_and_select_entity", query: "niet aanwezig" }).status).toBe("rejected");
  });

  it("selects the highest scoring loaded opportunity", () => {
    const low: WorldEntity = { id: entityId("opportunity-low"), type: "opportunity", name: "Lage kans", provenance: [], properties: { score: 35, candidate: true } };
    const high: WorldEntity = { id: entityId("opportunity-high"), type: "opportunity", name: "Hoge kans", provenance: [], properties: { score: 82, candidate: true } };
    worldStore.replaceEntities([low, high]);
    const result = worldStore.execute({ type: "rank_opportunities", limit: 2 });
    expect(result.status).toBe("success");
    expect(worldStore.getState().selectedEntityId).toBe(high.id);
  });

  it("creates a session project without pretending it was persisted", () => {
    worldStore.replaceEntities([building]);
    const result = worldStore.execute({ type: "create_project", name: "Test", siteId: building.id });
    expect(result.status).toBe("success");
    expect(worldStore.getState().activeProject).toMatchObject({ name: "Test", siteId: building.id, persistence: "session" });
    expect(worldStore.execute({ type: "save_workspace" }).status).toBe("unavailable");
  });

  it("requires a project before creating a session scenario", () => {
    expect(worldStore.execute({ type: "create_scenario", name: "Basis" }).status).toBe("rejected");
    worldStore.execute({ type: "create_project", name: "Test" });
    expect(worldStore.execute({ type: "create_scenario", name: "Basis" }).status).toBe("success");
    expect(worldStore.getState().activeScenario).toMatchObject({ name: "Basis" });
  });

  it("keeps project milestones scoped to the active project", () => {
    expect(worldStore.execute({ type: "add_project_milestone", milestone: { id: "milestone-1", projectId: "missing" as never, label: "Vergunning", status: "planned" } }).status).toBe("rejected");
    worldStore.execute({ type: "create_project", name: "Test" });
    const activeProject = worldStore.getState().activeProject!;
    expect(worldStore.execute({ type: "add_project_milestone", milestone: { id: "milestone-1", projectId: activeProject.id, label: "Vergunning", status: "planned" } }).status).toBe("success");
    worldStore.execute({ type: "update_project_milestone", milestoneId: "milestone-1", changes: { status: "active" } });
    expect(worldStore.getState().projectMilestones[0]).toMatchObject({ label: "Vergunning", status: "active" });
    worldStore.execute({ type: "delete_project_milestone", milestoneId: "milestone-1" });
    expect(worldStore.getState().projectMilestones).toEqual([]);
  });

  it("calculates and stores an estimate only for an active scenario", () => {
    const inputs = { siteAreaM2: 10_000, coverageRatio: .4, floors: 5, grossToNetRatio: .78, averageHomeAreaM2: 75, constructionCostPerGfaM2: 2_500, preparationMonths: 24, constructionMonthsPer10kGfa: 14 };
    expect(worldStore.execute({ type: "estimate_scenario", inputs }).status).toBe("rejected");
    worldStore.execute({ type: "create_project", name: "Test" });
    worldStore.execute({ type: "create_scenario", name: "Basis" });
    expect(worldStore.execute({ type: "estimate_scenario", inputs }).status).toBe("success");
    expect(worldStore.getState().scenarioEstimate).toMatchObject({ grossFloorAreaM2: 20_000, homes: { expected: 208 } });
  });

  it("generates structured massing only after calculation", () => {
    const site: WorldEntity = { ...building, geometry: { kind: "polygon", bounds: [6.15, 52.25, 6.16, 52.26], coordinateSystem: "WGS84" } };
    const inputs = { siteAreaM2: 10_000, coverageRatio: .4, floors: 5, grossToNetRatio: .78, averageHomeAreaM2: 75, constructionCostPerGfaM2: 2_500, preparationMonths: 24, constructionMonthsPer10kGfa: 14 };
    worldStore.replaceEntities([site]);
    worldStore.execute({ type: "create_project", name: "Test", siteId: site.id });
    worldStore.execute({ type: "create_scenario", name: "Basis" });
    expect(worldStore.execute({ type: "generate_scenario_geometry" }).status).toBe("rejected");
    worldStore.execute({ type: "estimate_scenario", inputs });
    expect(worldStore.execute({ type: "generate_scenario_geometry" }).status).toBe("success");
    expect(worldStore.getState().scenarioObjects[0]).toMatchObject({ kind: "massing", parameters: { heightM: 16 }, provenance: [{ methodVersion: "indicative-massing-1.0.0" }] });
  });
});
