import { describe, expect, it } from "vitest";
import { parseWorldEntity } from "./world-entity-schema";

const provenance = [{
  sourceId: "official-publications",
  sourceLabel: "Officiële bekendmakingen",
  retrievedAt: "2026-09-11T00:00:00.000Z",
  confidence: "verified" as const,
  methodVersion: "publication-sync-1",
}];

describe("canonical delivery entity schema", () => {
  it.each(["permit", "tender", "realization"] as const)("accepts a source-bound %s object", (type) => {
    expect(parseWorldEntity({ id: `${type}-1`, type, name: `${type} 1`, provenance, properties: {} })).toMatchObject({ type });
  });

  it("still rejects unknown delivery object types", () => {
    expect(parseWorldEntity({ id: "mock-1", type: "mock-result", name: "Mock", provenance, properties: {} })).toBeNull();
  });
});
