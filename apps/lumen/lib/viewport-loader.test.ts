import { describe, expect, it, vi } from "vitest";
import { centeredViewportBounds, coverViewportBounds, expandViewportBounds, expandViewportBoundsWithin, quantizedViewportKey, viewportContains, ViewportLoader } from "./viewport-loader";

describe("ViewportLoader", () => {
  it("reuses a warm viewport without another request", async () => {
    const loader = new ViewportLoader<string>(); const request = vi.fn().mockResolvedValue("data");
    await loader.load("tile", request); const warm = await loader.load("tile", request);
    expect(warm.value).toBe("data"); expect(request).toHaveBeenCalledTimes(1);
  });

  it("marks a superseded request as stale", async () => {
    const loader = new ViewportLoader<string>(); let finish!: (value: string) => void;
    const first = loader.load("a", () => new Promise((resolve) => { finish = resolve; }));
    const second = loader.load("b", async () => "new"); finish("old");
    expect((await first).current).toBe(false); expect((await second).current).toBe(true);
  });

  it("deduplicates concurrent requests for the same viewport", async () => {
    const loader = new ViewportLoader<string>(); let finish!: (value: string) => void;
    const request = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
    const first = loader.load("same", request); const second = loader.load("same", request);
    finish("shared");
    expect(await first).toEqual({ value: "shared", current: true });
    expect(await second).toEqual({ value: "shared", current: true });
    expect(request).toHaveBeenCalledOnce();
  });

  it("reuses an overscanned coverage area while the viewport remains inside", () => {
    const viewport = [6.15, 52.25, 6.16, 52.26] as const;
    const coverage = expandViewportBounds(viewport, .35);
    expect(viewportContains(coverage, [6.152, 52.252, 6.162, 52.262])).toBe(true);
    expect(viewportContains(coverage, [6.14, 52.24, 6.15, 52.25])).toBe(false);
  });

  it("quantizes nearby viewports to the same cache key", () => {
    expect(quantizedViewportKey([6.15441, 52.25341, 6.15841, 52.25741])).toBe("6.154,52.253,6.158,52.257");
  });

  it("aligns requests to a stable grid without losing viewport coverage", () => {
    const viewport = [6.15441, 52.25341, 6.15841, 52.25741] as const;
    const covered = coverViewportBounds(viewport, 4);
    expect(covered).toEqual([6.1544, 52.2534, 6.1585, 52.2575]);
    expect(viewportContains(covered, viewport)).toBe(true);
    expect(quantizedViewportKey(covered, 4)).toBe("6.1544,52.2534,6.1585,52.2575");
  });

  it("caps overscan at the upstream viewport limit", () => {
    const viewport = [6.1, 52.2, 6.16, 52.24] as const;
    const expanded = expandViewportBoundsWithin(viewport, .35, .079);
    expect(expanded[2] - expanded[0]).toBeLessThanOrEqual(.0790000001);
    expect(expanded[3] - expanded[1]).toBeLessThanOrEqual(.0790000001);
    expect(viewportContains(expanded, viewport)).toBe(true);
  });

  it("does not enlarge a viewport that already exceeds the service limit", () => {
    const viewport = [6.1, 52.2, 6.19, 52.24] as const;
    expect(expandViewportBoundsWithin(viewport, .35, .079)).toEqual(viewport);
  });

  it("caps a city extent without moving its center", () => {
    const bounded = centeredViewportBounds([6, 52, 6.2, 52.1], .07);
    expect((bounded[0] + bounded[2]) / 2).toBeCloseTo(6.1);
    expect((bounded[1] + bounded[3]) / 2).toBeCloseTo(52.05);
    expect(bounded[2] - bounded[0]).toBeCloseTo(.07);
    expect(bounded[3] - bounded[1]).toBeCloseTo(.07);
  });
});
