import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/world/pois", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes OSM nodes and way centers into selectable world entities", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ elements: [
      { type: "node", id: 1, lat: 52.255, lon: 6.155, tags: { amenity: "school", name: "De School" } },
      { type: "way", id: 2, center: { lat: 52.256, lon: 6.156 }, tags: { amenity: "library", name: "Bibliotheek" } },
    ] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/world/pois?bbox=6.15,52.25,6.16,52.26"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.features).toHaveLength(2);
    expect(body.entities[0]).toMatchObject({ id: "osm-node-1", type: "infrastructure", name: "De School", properties: { amenity: "school", category: "School" } });
    expect(body.entities[1].geometry.center).toEqual([6.156, 52.256]);
    expect(body.entities[0].provenance[0].sourceId).toBe("openstreetmap");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("overpass-api.de");
  });

  it("rejects oversized viewports before contacting Overpass", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(new Request("http://localhost/api/world/pois?bbox=3,50,7,53"));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("degrades to an empty optional layer when Overpass is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 502 })));

    const response = await GET(new Request("http://localhost/api/world/pois?bbox=6.15,52.25,6.16,52.26"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ type: "FeatureCollection", features: [], entities: [], degraded: true });
    expect(body.warning).toContain("502");
  });
});
