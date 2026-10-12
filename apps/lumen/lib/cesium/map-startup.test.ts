import { describe, expect, it } from "vitest";
import { OPEN_TILESET_OPTIONS } from "./map-startup";

describe("open Cesium startup", () => {
  it("uses a bounded, demand-driven loading profile for the PDOK 3D tiles", () => {
    expect(OPEN_TILESET_OPTIONS).toMatchObject({
      maximumScreenSpaceError: 8,
      preloadWhenHidden: false,
      preloadFlightDestinations: false,
      cullRequestsWhileMoving: true,
      loadSiblings: false,
    });
  });
});
