import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /api/world/buildings", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes BAG GeoJSON to provenance-bearing world entities", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      type: "FeatureCollection",
      features: [{ type: "Feature", id: "123e4567-e89b-12d3-a456-426614174000", geometry: { type: "Polygon", coordinates: [[[6.155, 52.255], [6.156, 52.255], [6.156, 52.256], [6.155, 52.255]]] }, properties: { identificatie: "0150100000000001", status: "Pand in gebruik", bouwjaar: 1932, gebruiksdoel: ["onderwijsfunctie"] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }))));

    const response = await GET(new Request("http://localhost/api/world/buildings?bbox=6.15,52.25,6.16,52.26"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("stale-while-revalidate");
    expect(body.entities[0]).toMatchObject({ id: "bag-pand-0150100000000001", type: "building", properties: { bouwjaar: 1932, gebruiksdoel: "onderwijsfunctie" }, provenance: [{ sourceId: "pdok-bag-pand", confidence: "verified" }] });
    expect(body.features[0].properties.lumenEntityId).toBe("bag-pand-0150100000000001");
  });

  it("rejects oversized viewport requests before contacting PDOK", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const response = await GET(new Request("http://localhost/api/world/buildings?bbox=3,50,7,53"));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns geometry and identification only for the viewport outline mode", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      type: "FeatureCollection",
      features: [{ type: "Feature", id: "123e4567-e89b-12d3-a456-426614174000", geometry: { type: "Polygon", coordinates: [[[6.155, 52.255], [6.156, 52.255], [6.156, 52.256], [6.155, 52.255]]] }, properties: { identificatie: "0150100000000001", status: "Pand in gebruik", bouwjaar: 1932 } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/world/buildings?geometry=1&bbox=6.1502,52.2502,6.1602,52.2602"));
    const body = await response.json();

    expect(body.features[0]).toMatchObject({ id: "0150100000000001", properties: { identificatie: "0150100000000001", status: "Pand in gebruik" } });
    expect(body.features[0].properties.pdokFeatureId).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(body.features[0].properties).not.toHaveProperty("bouwjaar");
    expect(body).not.toHaveProperty("entities");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("loads one exact BAG feature for a selected outline", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      type: "Feature", id: "123e4567-e89b-12d3-a456-426614174000",
      geometry: { type: "Polygon", coordinates: [[[6.155, 52.255], [6.156, 52.255], [6.156, 52.256], [6.155, 52.255]]] },
      properties: { identificatie: "0150100000000001", status: "Pand in gebruik", bouwjaar: 1932 },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/world/buildings?featureId=123e4567-e89b-12d3-a456-426614174000"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entity).toMatchObject({ id: "bag-pand-0150100000000001", properties: { bouwjaar: 1932 } });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/collections/pand/items/123e4567-e89b-12d3-a456-426614174000?f=json");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("loads one exact BAG feature by its public identification", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      type: "FeatureCollection",
      features: [{
        type: "Feature", id: "839860c8-cc8e-5fff-914d-557e02483bc2",
        geometry: { type: "Polygon", coordinates: [[[6.1636, 52.2554], [6.1644, 52.2554], [6.1644, 52.2559], [6.1636, 52.2554]]] },
        properties: { identificatie: "0150100010111149", status: "Pand in gebruik", bouwjaar: 2026, documentdatum: "2026-08-17" },
      }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/world/buildings?identificatie=0150100010111149"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entity).toMatchObject({ id: "bag-pand-0150100010111149", properties: { status: "Pand in gebruik", bouwjaar: 2026, documentdatum: "2026-08-17" } });
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).searchParams.get("identificatie")).toBe("0150100010111149");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects malformed BAG identifications without contacting PDOK", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(new Request("http://localhost/api/world/buildings?identificatie=not-a-building"));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("partitions wide outline viewports to keep dense responses complete", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      type: "FeatureCollection",
      features: [],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/world/buildings?geometry=1&bbox=6.12,52.23,6.17,52.27"));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("retries a truncated compact outline viewport in quadrants", async () => {
    let requestCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      requestCount += 1;
      const isInitialPagination = requestCount <= 5;
      return Promise.resolve(new Response(JSON.stringify({
        type: "FeatureCollection",
        features: [],
        links: isInitialPagination ? [{ rel: "next", href: `https://api.pdok.nl/bag/panden/items?cursor=${requestCount}` }] : [],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/world/buildings?geometry=1&bbox=6.15,52.25,6.16,52.26"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.truncated).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(9);
  });

  it("shares simultaneous identical outline work", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchMock = vi.fn().mockImplementation(async () => {
      await gate;
      return new Response(JSON.stringify({ type: "FeatureCollection", features: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const url = "http://localhost/api/world/buildings?geometry=1&bbox=6.151,52.251,6.161,52.261";
    const first = GET(new Request(url));
    const second = GET(new Request(url));
    release();
    const responses = await Promise.all([first, second]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares BAG work between outline and full responses for the same viewport", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchMock = vi.fn().mockImplementation(async () => {
      await gate;
      return new Response(JSON.stringify({
        type: "FeatureCollection",
        features: [{ type: "Feature", id: "pand.shared", geometry: { type: "Polygon", coordinates: [[[6.17, 52.25], [6.171, 52.25], [6.171, 52.251], [6.17, 52.25]]] }, properties: { identificatie: "0150100000000099", status: "Pand in gebruik" } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const bbox = "6.17,52.25,6.18,52.26";

    const outlineRequest = GET(new Request(`http://localhost/api/world/buildings?geometry=1&bbox=${bbox}`));
    const fullRequest = GET(new Request(`http://localhost/api/world/buildings?bbox=${bbox}`));
    release();
    const [outline, full] = await Promise.all([outlineRequest, fullRequest]);
    const fullBody = await full.json();

    expect(outline.status).toBe(200);
    expect(fullBody.entities[0].id).toBe("bag-pand-0150100000000099");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
