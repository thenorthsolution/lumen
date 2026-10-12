import { beforeEach, describe, expect, it, vi } from "vitest";

const findPdokLocations = vi.fn();
vi.mock("@/lib/ai/pdok-location", () => ({ findPdokLocations }));

describe("world location search route", () => {
  beforeEach(() => findPdokLocations.mockReset());

  it("rejects empty searches without calling PDOK", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://lumen.test/api/world/search?q=a"));
    expect(response.status).toBe(400);
    expect(findPdokLocations).not.toHaveBeenCalled();
  });

  it("returns validated PDOK results with cache headers", async () => {
    findPdokLocations.mockResolvedValue({ status: "success", message: "1 locatie gevonden.", locations: [{ name: "Olst", longitude: 6.11, latitude: 52.34, recommendedZoom: 13 }] });
    const { GET } = await import("./route");
    const response = await GET(new Request("http://lumen.test/api/world/search?q=Olst"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
    expect(findPdokLocations).toHaveBeenCalledWith("Olst");
  });
});
