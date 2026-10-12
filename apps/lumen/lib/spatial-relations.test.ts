import { describe, expect, it } from "vitest";
import { entityId, type WorldEntity } from "@lumen/world";
import { containingParcelEntity } from "./spatial-relations";

describe("canonical spatial relations", () => {
  const parcel: WorldEntity = { id: entityId("brk-perceel-DVN-A-1"), type: "parcel", name: "DVN A 1", properties: { identificatie: "DVN-A-1" }, provenance: [] };
  const feature: GeoJSON.Feature = { type: "Feature", properties: { identificatie: "DVN-A-1" }, geometry: { type: "Polygon", coordinates: [[[6.15, 52.25], [6.16, 52.25], [6.16, 52.26], [6.15, 52.26], [6.15, 52.25]]] } };
  const entities = new Map([["DVN-A-1", parcel]]);

  it("resolves a parcel from its real polygon instead of its bounding box", () => {
    expect(containingParcelEntity([6.155, 52.255], [feature], entities)).toBe(parcel);
    expect(containingParcelEntity([6.17, 52.255], [feature], entities)).toBeNull();
  });
});
