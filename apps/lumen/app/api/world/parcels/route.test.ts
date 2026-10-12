import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/world/parcels", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes public cadastral parcels with explicit provenance and limitations", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: "FeatureCollection", features: [{
      type: "Feature", id: "perceel.1", geometry: { type: "Polygon", coordinates: [[[6.155, 52.255], [6.156, 52.255], [6.156, 52.256], [6.155, 52.255]]] },
      properties: { identificatie_lokaal_id: "DVN00-A-123", kadastrale_gemeente_waarde: "Deventer", sectie: "A", perceelnummer: 123, kadastrale_grootte_waarde: 640, status_historie_waarde: "Geldig" },
    }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    const response = await GET(new Request("http://localhost/api/world/parcels?bbox=6.17,52.25,6.18,52.26"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.entities[0]).toMatchObject({ id: "brk-perceel-DVN00-A-123", type: "parcel", name: "Deventer A 123", properties: { kadastraleOppervlakteM2: 640 }, provenance: [{ sourceId: "pdok-brk-perceel", confidence: "verified" }] });
    expect(body.entities[0].provenance[0].limitations).toHaveLength(2);
    expect(body.features[0].properties).toEqual({ identificatie: "DVN00-A-123", lumenEntityId: "brk-perceel-DVN00-A-123" });
  });

  it("rejects invalid or oversized bounds without contacting PDOK", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const response = await GET(new Request("http://localhost/api/world/parcels?bbox=3,50,7,53"));
    expect(response.status).toBe(400); expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not follow pagination links outside api.pdok.nl", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: "FeatureCollection", features: [], links: [{ rel: "next", href: "https://example.com/private" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(new Request("http://localhost/api/world/parcels?bbox=6.15,52.25,6.16,52.26"));
    expect(response.status).toBe(200); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
