import { describe, expect, it } from "vitest";
import { assessKnownSuitability, assessSuitability, buildNearbyAmenities, buildProximityBaseline, distanceMeters, measureDrawing } from "./analysis";
import { entityId, type WorldEntity } from "./index";

const provenance = { sourceId: "dso", sourceLabel: "DSO", retrievedAt: "2026-09-11T00:00:00Z", confidence: "verified" as const };

describe("site suitability", () => {
  it("never averages away a hard blocker", () => {
    const result = assessSuitability({ assessedAt: provenance.retrievedAt, methodVersion: "1", dimensions: [{ dimension: "planning", status: "suitable", score: 100, metrics: [], confidence: "verified" }], blockers: [{ code: "NO_BUILD", label: "Niet bouwbaar", severity: "hard", explanation: "Bindende regel", provenance }] });
    expect(result.conclusion).toBe("blocked");
  });

  it("reports missing research instead of a negative score", () => {
    const result = assessSuitability({ assessedAt: provenance.retrievedAt, methodVersion: "1", dimensions: [{ dimension: "physical", status: "needs-research", score: null, metrics: [], confidence: "unknown" }] });
    expect(result.conclusion).toBe("needs-research");
  });

  it("keeps missing dimensions unknown and elevates explicit blockers", () => {
    const unknown = assessKnownSuitability({ areaM2: 1_200 }, provenance, provenance.retrievedAt);
    expect(unknown.conclusion).toBe("needs-research");
    expect(unknown.dimensions.find((item) => item.dimension === "physical")?.status).toBe("suitable");
    const blocked = assessKnownSuitability({ permittedUse: false }, provenance, provenance.retrievedAt);
    expect(blocked.conclusion).toBe("blocked");
    expect(blocked.blockers[0]?.code).toBe("USE_NOT_PERMITTED");
  });
});

describe("drawing measurements", () => {
  it("measures a rectangle and states the limitation", () => {
    const result = measureDrawing({ id: "drawing", kind: "rectangle", name: "Locatie", coordinates: [[6.15, 52.25], [6.151, 52.251]], color: "#fff", version: 1, createdAt: provenance.retrievedAt, updatedAt: provenance.retrievedAt });
    expect(result.areaSquareMeters).toBeGreaterThan(7_000);
    expect(result.lengthMeters).toBeGreaterThan(300);
    expect(result.limitations[0]).toContain("indicatief");
  });
});

describe("accessibility baseline", () => {
  it("calculates stable distances and counts without claiming routed travel time", () => {
    expect(Math.round(distanceMeters([6.155, 52.255], [6.155, 52.264]))).toBeGreaterThan(990);
    const subject: WorldEntity = { id: entityId("building"), type: "building", name: "Pand", properties: {}, provenance: [], geometry: { kind: "point", center: [6.155, 52.255], coordinateSystem: "WGS84" } };
    const school: WorldEntity = { id: entityId("school"), type: "infrastructure", name: "School", properties: { amenity: "school" }, provenance: [{ sourceId: "openstreetmap", sourceLabel: "© OpenStreetMap contributors", sourceUrl: "https://www.openstreetmap.org/copyright", retrievedAt: "2026-09-10T12:00:00Z", confidence: "medium", methodVersion: "osm-overpass-poi-1.0.0" }], geometry: { kind: "point", center: [6.155, 52.258], coordinateSystem: "WGS84" } };
    const profile = buildProximityBaseline(subject, [school], "2026-09-11T00:00:00Z");
    expect(profile?.measures[0]).toMatchObject({ destinationType: "school", mode: "walk", count5: 1 });
    expect(profile?.measures[0]?.provenance).toMatchObject({ sourceId: "lumen-proximity:openstreetmap", sourceLabel: "Lumen-berekening op © OpenStreetMap contributors", sourceUrl: "https://www.openstreetmap.org/copyright", retrievedAt: "2026-09-10T12:00:00Z", confidence: "low", methodVersion: "straight-line-proximity-1.0.0", limitations: ["Hemelsbrede afstand; geen route over wegennet of dienstregeling."] });
  });

  it("marks proximity output unusable when a POI has no source record", () => {
    const subject: WorldEntity = { id: entityId("building-no-source"), type: "building", name: "Pand", properties: {}, provenance: [], geometry: { kind: "point", center: [6.155, 52.255], coordinateSystem: "WGS84" } };
    const school: WorldEntity = { id: entityId("school-no-source"), type: "infrastructure", name: "School", properties: { amenity: "school" }, provenance: [], geometry: { kind: "point", center: [6.155, 52.258], coordinateSystem: "WGS84" } };

    const profile = buildProximityBaseline(subject, [school], "2026-09-11T00:00:00Z");

    expect(profile?.measures[0]?.provenance).toMatchObject({ sourceId: "missing-poi-source", retrievedAt: "", confidence: "unknown" });
    expect(profile?.measures[0]?.provenance.limitations?.[0]).toContain("geen herleidbare bron");
  });

  it("returns source-backed nearby OSM amenities ordered by distance", () => {
    const subject: WorldEntity = { id: entityId("building-nearby"), type: "building", name: "Pand", properties: {}, provenance: [], geometry: { kind: "point", center: [6.155, 52.255], coordinateSystem: "WGS84" } };
    const source = { sourceId: "openstreetmap", sourceLabel: "© OpenStreetMap contributors", retrievedAt: "2026-09-10T12:00:00Z", confidence: "medium" as const };
    const station: WorldEntity = { id: entityId("station"), type: "infrastructure", name: "Station Deventer", properties: { amenity: "station", category: "Station" }, provenance: [source], geometry: { kind: "point", center: [6.156, 52.255], coordinateSystem: "WGS84" } };
    const school: WorldEntity = { id: entityId("school-nearby"), type: "infrastructure", name: "Basisschool", properties: { amenity: "school", category: "School" }, provenance: [source], geometry: { kind: "point", center: [6.155, 52.258], coordinateSystem: "WGS84" } };

    const nearby = buildNearbyAmenities(subject, [school, station]);

    expect(nearby.map((item) => item.name)).toEqual(["Station Deventer", "Basisschool"]);
    expect(nearby[0]).toMatchObject({ category: "Station", amenity: "station", provenance: { sourceId: "openstreetmap" } });
    expect(buildProximityBaseline(subject, [station])?.measures[0]?.destinationType).toBe("station");
  });
});
