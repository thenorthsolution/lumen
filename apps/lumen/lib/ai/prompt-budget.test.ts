import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { boundedConversation, compactLocalWorldContext, localActiveTools } from "./prompt-budget";

const message = (id: string, role: "user" | "assistant", text: string): UIMessage => ({ id, role, parts: [{ type: "text", text }] });

describe("local AI prompt budget", () => {
  it("keeps a recent conversation window beginning at a user turn", () => {
    const messages = Array.from({ length: 12 }, (_, index) => message(String(index), index % 2 ? "assistant" : "user", `bericht ${index}`));
    const bounded = boundedConversation(messages, 6);
    expect(bounded).toHaveLength(6);
    expect(bounded[0]?.role).toBe("user");
    expect(bounded.at(-1)?.id).toBe("11");
  });

  it("exposes scenario tools only for matching intent", () => {
    expect(localActiveTools([message("1", "user", "Hallo")])).not.toContain("estimate_world_scenario");
    expect(localActiveTools([message("2", "user", "Bereken de bouwkosten van dit scenario")])).toContain("estimate_world_scenario");
  });

  it("keeps a large viewport snapshot compact for a 4k local model", () => {
    const context = compactLocalWorldContext({
      renderer: "map-2d", camera: { longitude: 6.15, latitude: 52.25, zoom: 17 }, selectedEntityId: "building-0", activeTool: "explore", taskPreset: "living", comparisonEntityIds: [],
      entities: Array.from({ length: 8 }, (_, index) => ({ id: `building-${index}`, type: "building", name: `Gebouw ${index}`, relatedEntityIds: Array.from({ length: 20 }, (__, relation) => `parcel-${relation}`), properties: { bouwjaar: 1980, oppervlakte: 120 }, sources: [{ sourceId: "bag", sourceLabel: "BAG", limitations: ["Beperking"] }] })),
      entityCounts: { building: 2_000 }, layers: Array.from({ length: 12 }, (_, index) => ({ id: `layer-${index}`, visible: true, status: "ready" })),
      drawings: [], selectedAnalysis: { suitability: { conclusion: "needs-research", dimensions: [{ dimension: "planning", status: "needs-research", confidence: "unknown" }], blockers: [] } }, project: null, milestones: [], scenario: null,
    });
    expect(JSON.stringify(context).length).toBeLessThan(6_000);
    expect(context.entities).toHaveLength(3);
  });
});
