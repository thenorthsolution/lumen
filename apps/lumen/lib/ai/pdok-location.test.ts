import { describe, expect, it, vi } from "vitest";
import { findPdokLocations } from "./pdok-location";

describe("PDOK location search", () => {
  it("normalizes official point results without inventing coordinates", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({
      features: [{ id: "woonplaats.123", collection: "woonplaats", geometry: { type: "Point", coordinates: [4.9041, 52.3676] }, properties: { display_name: "Amsterdam" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;

    const result = await findPdokLocations("Amsterdam", request);
    expect(result).toMatchObject({ status: "success", locations: [{ externalId: "woonplaats.123", name: "Amsterdam", longitude: 4.9041, latitude: 52.3676, recommendedZoom: 13, provenance: { sourceLabel: "PDOK Location API", confidence: "verified", methodVersion: "pdok-location-search-1.0.0" } }] });
    const calledUrl = new URL(String(vi.mocked(request).mock.calls[0]?.[0]));
    expect(calledUrl.searchParams.get("q")).toBe("Amsterdam");
    expect(calledUrl.searchParams.get("limit")).toBe("5");
    expect(calledUrl.searchParams.get("woonplaats[version]")).toBe("1");
  });

  it("uses geometry bounds as a stable center for area results", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({
      features: [{ collection: "gemeentegebied", geometry: { type: "Polygon", coordinates: [[[6.1, 52.2], [6.2, 52.2], [6.2, 52.3], [6.1, 52.3], [6.1, 52.2]]] }, properties: { display_name: "Deventer" } }],
    }), { status: 200 })) as unknown as typeof fetch;
    const result = await findPdokLocations("Deventer", request);
    expect(result.locations[0]).toMatchObject({ entityType: "municipality", longitude: 6.15, latitude: 52.25, recommendedZoom: 11 });
  });

  it("classifies official address results as canonical address entities", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({
      features: [{ id: "adres.0150200000000001", collection: "adres", geometry: { type: "Point", coordinates: [6.155, 52.255] }, properties: { display_name: "Brink 1, Deventer" } }],
    }), { status: 200 })) as unknown as typeof fetch;

    const result = await findPdokLocations("Brink 1", request);

    expect(result.locations[0]).toMatchObject({ externalId: "adres.0150200000000001", entityType: "address", kind: "adres" });
  });

  it("fails closed when PDOK is unavailable or has no valid feature", async () => {
    const unavailable = vi.fn(async () => new Response(null, { status: 502 })) as unknown as typeof fetch;
    expect(await findPdokLocations("Olst", unavailable)).toEqual({ status: "unavailable", message: "PDOK locatiezoeken is tijdelijk niet beschikbaar.", locations: [] });
    const empty = vi.fn(async () => new Response(JSON.stringify({ features: [] }), { status: 200 })) as unknown as typeof fetch;
    expect((await findPdokLocations("Bestaat niet", empty)).status).toBe("not_found");
  });
});
