import { beforeEach, describe, expect, it, vi } from "vitest";
import { worldStore } from "@/lib/world-store";
import { openSavedProject, type SavedProjectSummary } from "./project-portfolio";

describe("project portfolio", () => {
  beforeEach(() => { worldStore.reset(); vi.unstubAllGlobals(); });

  it("hydrates drawings and the newest scenario atomically", async () => {
    const project: SavedProjectSummary = { id: "11111111-1111-4111-8111-111111111111", name: "Binnenstad", status: "active", site_entity_id: "brk-perceel-1", site_snapshot: { id: "brk-perceel-1", type: "parcel", name: "Deventer A 1", geometry: { kind: "polygon", center: [6.16, 52.26], bounds: [6.159, 52.259, 6.161, 52.261], coordinateSystem: "WGS84" }, properties: { identificatie: "1" }, provenance: [{ sourceId: "brk", sourceLabel: "BRK", retrievedAt: "2026-09-11T12:00:00.000Z", confidence: "verified" }] }, organization_id: null, updated_at: "2026-09-11T12:00:00.000Z" };
    const calculation = { methodVersion: "indicative-scenario-1.0.0", grossFloorAreaM2: 1000, netFloorAreaM2: 800, homes: { low: 8, expected: 10, high: 12 }, constructionCostEur: { low: 1800000, expected: 2000000, high: 2200000 }, durationMonths: { low: 12, expected: 15, high: 18 }, riskFlags: [], assumptions: ["Indicatief"], inputs: { siteAreaM2: 1000, coverageRatio: 0.5, floors: 2, grossToNetRatio: 0.8, averageHomeAreaM2: 80, constructionCostPerGfaM2: 2000, preparationMonths: 12, constructionMonthsPer10kGfa: 30 } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ drawings: [{ id: "22222222-2222-4222-8222-222222222222", project_id: project.id, name: "Bouwvlak", kind: "rectangle", geometry: { type: "Polygon", coordinates: [[[6.1,52.2],[6.2,52.2],[6.2,52.3],[6.1,52.3],[6.1,52.2]]] }, color: "#315df0", note: null, version: 3, created_at: project.updated_at, updated_at: project.updated_at }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ scenarios: [{ id: "33333333-3333-4333-8333-333333333333", project_id: project.id, name: "Voorkeur", status: "calculated", objects: [{ id: "volume-1", kind: "massing", label: "Volume", geometry: { kind: "polygon", coordinateSystem: "WGS84", bounds: [6.1,52.2,6.2,52.3] }, parameters: {}, provenance: [{ sourceId: "lumen-scenario-engine", sourceLabel: "Lumen scenario-engine", retrievedAt: project.updated_at, confidence: "low", methodVersion: "indicative-massing-1.0.0" }] }], calculation, updated_at: project.updated_at }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ milestones: [{ id: "44444444-4444-4444-8444-444444444444", project_id: project.id, label: "Omgevingsdialoog", status: "active", planned_at: "2026-10-01T00:00:00.000Z", completed_at: null }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await openSavedProject(project);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(worldStore.getState()).toMatchObject({ activeProject: { id: project.id, name: "Binnenstad", persistence: "saved", siteId: "brk-perceel-1" }, activeScenario: { name: "Voorkeur", projectId: project.id } });
    expect(worldStore.getState().entities["brk-perceel-1"]?.name).toBe("Deventer A 1");
    expect(worldStore.getState().camera.center).toEqual([6.16, 52.26]);
    expect(worldStore.getState().drawings[0]).toMatchObject({ name: "Bouwvlak", kind: "rectangle", version: 3, coordinates: [[6.1,52.2],[6.2,52.3]] });
    expect(worldStore.getState().scenarioObjects[0]?.id).toBe("volume-1");
    expect(worldStore.getState().scenarioEstimate).toMatchObject({ grossFloorAreaM2: 1000, inputs: { floors: 2 } });
    expect(worldStore.getState().projectMilestones[0]).toMatchObject({ label: "Omgevingsdialoog", status: "active" });
  });

  it("passes one cancellation signal to both project detail requests", async () => {
    const project: SavedProjectSummary = { id: "11111111-1111-4111-8111-111111111111", name: "Binnenstad", status: "active", site_entity_id: null, organization_id: null, updated_at: "2026-09-11T12:00:00.000Z" };
    const controller = new AbortController();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ drawings: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ scenarios: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ milestones: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await openSavedProject(project, undefined, controller.signal);

    expect(fetchMock).toHaveBeenNthCalledWith(1, expect.stringContaining("/drawings"), { signal: controller.signal });
    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining("/scenarios"), { signal: controller.signal });
    expect(fetchMock).toHaveBeenNthCalledWith(3, expect.stringContaining("/milestones"), { signal: controller.signal });
  });
});
