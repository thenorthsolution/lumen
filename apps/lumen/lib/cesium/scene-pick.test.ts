import { describe, expect, it } from "vitest";
import { isPickedWorldPosition } from "./scene-pick";

describe("Cesium scene picking", () => {
  it("accepts surface-scale Cartesian positions", () => expect(isPickedWorldPosition({ x: 6_378_000, y: 0, z: 0 })).toBe(true));
  it("rejects non-finite, core-interior and implausibly distant positions", () => {
    expect(isPickedWorldPosition({ x: Number.NaN, y: 0, z: 0 })).toBe(false);
    expect(isPickedWorldPosition({ x: 500, y: 0, z: 0 })).toBe(false);
    expect(isPickedWorldPosition({ x: 2_000_000_000, y: 0, z: 0 })).toBe(false);
  });
});
