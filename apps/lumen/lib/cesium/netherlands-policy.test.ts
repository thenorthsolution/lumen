import { describe, expect, it } from "vitest";
import { clampCameraToNetherlands, NETHERLANDS_BOUNDS, NETHERLANDS_MIN_ZOOM } from "./netherlands-policy";

describe("open Dutch 3D policy", () => {
  it("keeps cameras throughout the Netherlands available", () => {
    const camera = { center: [4.9, 52.37] as [number, number], zoom: 13, bearing: 0, pitch: 45 };
    expect(clampCameraToNetherlands(camera)).toEqual(camera);
  });

  it("keeps the open data renderer inside Dutch coverage", () => {
    const result = clampCameraToNetherlands({ center: [2, 55], zoom: 2, bearing: 0, pitch: 45 });
    expect(result.center).toEqual([NETHERLANDS_BOUNDS[0], NETHERLANDS_BOUNDS[3]]);
    expect(result.zoom).toBe(NETHERLANDS_MIN_ZOOM);
  });
});
