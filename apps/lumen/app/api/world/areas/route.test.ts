import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/world/areas", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("combines municipalities and districts into one cached navigation layer", async () => {
    const fetchMock = vi.fn().mockImplementation((input: URL | RequestInfo) => {
      const url = String(input);
      const municipality = url.includes("/gemeenten/");
      const neighborhood = url.includes("/buurten/");
      return Promise.resolve(new Response(JSON.stringify({
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          id: municipality ? "GM0150" : neighborhood ? "BU01500501" : "WK015005",
          geometry: { type: "Polygon", coordinates: [[[6.1, 52.2], [6.2, 52.2], [6.2, 52.3], [6.1, 52.2]]] },
          properties: municipality
            ? { gemeentecode: "GM0150", gemeentenaam: "Deventer", aantal_inwoners: 104_000 }
            : neighborhood
              ? { buurtcode: "BU01500501", buurtnaam: "Landsherenkwartier", wijkcode: "WK015005", wijknaam: "Keizerslanden", gemeentecode: "GM0150", gemeentenaam: "Deventer", aantal_inwoners: 2_100 }
              : { wijkcode: "WK015005", wijknaam: "Keizerslanden", gemeentecode: "GM0150", gemeentenaam: "Deventer", aantal_inwoners: 11_200 },
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/world/areas?detail=neighborhood&bbox=6.03,52.18,6.28,52.42"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body.provenance).toMatchObject({
      sourceId: "cbs-wijken-buurten-2025",
      confidence: "verified",
      methodVersion: "cbs-area-navigation-1.0.0",
    });
    expect(Date.parse(body.provenance.retrievedAt)).not.toBeNaN();
    expect(body.provenance.limitations).toHaveLength(1);
    expect(body.features).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "WK015005", properties: expect.objectContaining({ areaKind: "district", name: "Keizerslanden", parentCode: "GM0150", parentName: "Deventer" }) }),
      expect.objectContaining({ id: "BU01500501", properties: expect.objectContaining({ areaKind: "neighborhood", name: "Landsherenkwartier", parentCode: "WK015005", parentName: "Keizerslanden" }) }),
    ]));
  });

  it("returns an empty typed collection when CBS is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const response = await GET(new Request("http://localhost/api/world/areas?detail=municipality&bbox=3.2,50.7,7.3,53.7"));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({ error: "offline", type: "FeatureCollection", features: [] });
  });

  it("rejects a missing viewport instead of silently loading Deventer", async () => {
    const response = await GET(new Request("http://localhost/api/world/areas"));
    expect(response.status).toBe(400);
  });
});
