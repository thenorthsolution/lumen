import { beforeEach, describe, expect, it, vi } from "vitest";
import { drawingId, entityId } from "@lumen/world";
import { worldStore } from "@/lib/world-store";
import { executeCloudWorldCommand } from "./world-command";

describe("cloud world command", () => {
  beforeEach(() => { worldStore.reset(); vi.unstubAllGlobals(); });

  it("persists the active project and scenario through bounded APIs", async () => {
    const siteId = entityId("site-1");
    worldStore.replaceEntities([{ id: siteId, type: "site", name: "Locatie", properties: {}, provenance: [] }]);
    worldStore.execute({ type: "create_project", siteId, name: "Project" });
    worldStore.execute({ type: "create_scenario", name: "Basis" });
    const sessionProjectId = worldStore.getState().activeProject!.id;
    worldStore.execute({ type: "add_drawing", drawing: { id: drawingId("33333333-3333-4333-8333-333333333333"), projectId: sessionProjectId, kind: "point", name: "Punt", coordinates: [[6.15, 52.25]], color: "#315df0", version: 1, createdAt: "2026-09-11T00:00:00.000Z", updatedAt: "2026-09-11T00:00:00.000Z" } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ project: { id: "11111111-1111-4111-8111-111111111111" } }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeCloudWorldCommand({ type: "save_workspace" });

    expect(result).toMatchObject({ status: "success", message: "Project privé opgeslagen; tekeningen en scenario worden gesynchroniseerd." });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ siteId: "site-1", siteSnapshot: { id: "site-1", type: "site", name: "Locatie" } });
    expect(worldStore.getState().activeProject?.persistence).toBe("saved");
    expect(worldStore.getState().activeScenario?.projectId).toBe("11111111-1111-4111-8111-111111111111");
    expect(worldStore.getState().drawings[0]?.projectId).toBe("11111111-1111-4111-8111-111111111111");
  });
});
