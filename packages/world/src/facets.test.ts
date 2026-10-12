import { describe, expect, it } from "vitest";
import { buildEntityFacet } from "./facets";
import { entityId, type WorldEntity } from "./index";

const entity: WorldEntity = { id: entityId("building"), type: "building", name: "Pand", properties: { bouwjaar: 1982, arbitraryRawField: "hidden" }, provenance: [{ sourceId: "bag", sourceLabel: "BAG", retrievedAt: "2026-09-11T00:00:00.000Z", confidence: "verified" }] };

describe("entity facets", () => {
  it("projects only registered fields with their source", () => {
    const facet = buildEntityFacet(entity, "overview");
    expect(facet.availability).toBe("partial");
    expect(facet.values[0]).toMatchObject({ key: "bouwjaar", value: 1982, provenance: [{ sourceId: "bag" }] });
    expect(facet.values.some((value) => value.key === "arbitraryRawField")).toBe(false);
    expect(facet.missing.some((value) => value.key === "status")).toBe(true);
  });

  it("returns an explicit missing facet instead of invented content", () => {
    expect(buildEntityFacet(entity, "market")).toMatchObject({ availability: "missing", values: [] });
  });

  it("keeps the official BAG mutation date separate from retrieval provenance", () => {
    const facet = buildEntityFacet({ ...entity, properties: { ...entity.properties, documentdatum: "2023-12-11" } }, "overview");
    expect(facet.values).toContainEqual(expect.objectContaining({ key: "documentdatum", label: "BAG-mutatie", value: "2023-12-11" }));
    expect(facet.values.find((value) => value.key === "documentdatum")?.provenance[0]?.retrievedAt).toBe("2026-09-11T00:00:00.000Z");
  });
});
