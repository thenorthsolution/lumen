import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/world/opportunities", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes a BAG proxy signal into an evidence-bearing opportunity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "Point", coordinates: [6.155, 52.255] }, properties: { identificatie: "0150010000000001", status: "Verblijfsobject buiten gebruik", gebruiksdoel: "kantoorfunctie", oppervlakte: 1800, bouwjaar: 1984 } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));

    const response = await GET(new Request("http://localhost/api/world/opportunities?bbox=6.15,52.25,6.16,52.26"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.entities[0]).toMatchObject({ id: "vacancy-0150010000000001", type: "opportunity", properties: { kind: "redevelopment", candidate: true, evidenceCount: 2, pipelineEvidence: false } });
    expect(body.entities[0].provenance[0]).toMatchObject({ confidence: "medium", methodVersion: "bag-viability-1.0.0" });
    expect(body.entities[0].provenance[0].assumptions[0]).toContain("proxy");
  });

  it("rejects an oversized viewport", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const response = await GET(new Request("http://localhost/api/world/opportunities?bbox=3,50,7,53"));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
