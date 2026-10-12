import { describe, expect, it } from "vitest";
import { entityId, type WorldEntity } from "@lumen/world";
import { decorateBuildingsWithOpportunities, decorateBuildingsWithPois } from "./building-poi-index";

const square = (id: number, longitude: number, latitude: number): GeoJSON.Feature => ({
  type: "Feature", id, properties: { identificatie: String(id) },
  geometry: { type: "Polygon", coordinates: [[[longitude, latitude], [longitude + .0002, latitude], [longitude + .0002, latitude + .0002], [longitude, latitude + .0002], [longitude, latitude]]] },
});

describe("building POI spatial index", () => {
  it("decorates only the containing building and keeps its canonical POI lookup", () => {
    const buildings = [square(1, 6.15, 52.25), square(2, 6.16, 52.26)];
    const poi: GeoJSON.Feature = { type: "Feature", properties: { lumenEntityId: "osm-school-1", category: "School", name: "Basisschool" }, geometry: { type: "Point", coordinates: [6.1501, 52.2501] } };
    const entity: WorldEntity = { id: entityId("osm-school-1"), type: "infrastructure", name: "Basisschool", properties: {}, provenance: [] };
    const result = decorateBuildingsWithPois(buildings, [poi], [entity]);
    expect(result.features[0]?.properties).toMatchObject({ poiCategory: "School", poiName: "Basisschool" });
    expect(result.features[1]).toBe(buildings[1]);
    expect(result.poiByBuildingId.get("1")).toBe(entity);
  });

  it("avoids a building-by-POI scan for a spread-out viewport", () => {
    const buildings = Array.from({ length: 1_000 }, (_, index) => square(index, 6 + (index % 50) * .002, 52 + Math.floor(index / 50) * .002));
    const pois = Array.from({ length: 500 }, (_, index): GeoJSON.Feature => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [7 + (index % 20) * .002, 53 + Math.floor(index / 20) * .002] } }));
    const result = decorateBuildingsWithPois(buildings, pois, []);
    expect(result.candidateChecks).toBeLessThan(2_000);
    expect(result.features).toHaveLength(1_000);
  });

  it("uses a station as the primary building function when it contains a shop", () => {
    const building = square(1, 6.15, 52.25);
    const shop: GeoJSON.Feature = { type: "Feature", properties: { lumenEntityId: "shop", amenity: "supermarket", category: "Supermarkt", name: "Appie to go" }, geometry: { type: "Point", coordinates: [6.15005, 52.25005] } };
    const station: GeoJSON.Feature = { type: "Feature", properties: { lumenEntityId: "station", amenity: "station", category: "Station", name: "Station Deventer" }, geometry: { type: "Point", coordinates: [6.1501, 52.2501] } };
    const entities: WorldEntity[] = [
      { id: entityId("shop"), type: "infrastructure", name: "Appie to go", properties: {}, provenance: [] },
      { id: entityId("station"), type: "infrastructure", name: "Station Deventer", properties: {}, provenance: [] },
    ];
    const result = decorateBuildingsWithPois([building], [shop, station], entities);
    expect(result.features[0]?.properties).toMatchObject({ poiCategory: "Station", poiName: "Station Deventer" });
    expect(result.poiByBuildingId.get("1")?.id).toBe("station");
  });

  it("spatially marks a pand containing a candidate VBO", () => {
    const opportunity: GeoJSON.Feature = { type: "Feature", properties: { opportunityCandidate: true }, geometry: { type: "Point", coordinates: [6.1501, 52.2501] } };
    const decorated = decorateBuildingsWithOpportunities([square(1, 6.15, 52.25), square(2, 6.16, 52.26)], [opportunity]);
    expect(decorated[0]?.properties).toMatchObject({ opportunityCandidate: true });
    expect(decorated[1]?.properties).not.toHaveProperty("opportunityCandidate");
  });
});
