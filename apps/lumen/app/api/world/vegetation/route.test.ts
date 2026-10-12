import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/world/vegetation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects viewports outside the Netherlands", async () => {
    const response = await GET(new Request("http://localhost/api/world/vegetation?bbox=2.89,52.36,2.90,52.37"));
    expect(response.status).toBe(400);
  });

  it("returns only current BGT tree points", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ features: [
      { id: "tree-1", properties: { plus_type: "boom", status: "bestaand", termination_date: null }, geometry: { type: "Point", coordinates: [6.15, 52.255] } },
      { id: "hedge-1", properties: { plus_type: "haag", status: "bestaand", termination_date: null }, geometry: { type: "Point", coordinates: [6.151, 52.255] } },
    ] }), { status: 200 })));
    const response = await GET(new Request("http://localhost/api/world/vegetation?bbox=6.145,52.250,6.155,52.260"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.trees).toEqual([{ id: "tree-1", position: [6.15, 52.255] }]);
    expect(body.provenance.methodVersion).toBe("bgt-tree-points-1.0.0");
  });
});
