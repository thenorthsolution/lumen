/** Adapted from God's Eye View mapStartup.js. See THIRD_PARTY_NOTICES.md. */
import type { Cesium3DTileset } from "cesium";

export const OPEN_TILESET_OPTIONS = {
  maximumScreenSpaceError: 8,
  cacheBytes: 192 * 1024 * 1024,
  maximumCacheOverflowBytes: 64 * 1024 * 1024,
  cullWithChildrenBounds: true,
  cullRequestsWhileMoving: true,
  cullRequestsWhileMovingMultiplier: 80,
  preloadWhenHidden: false,
  preloadFlightDestinations: false,
  dynamicScreenSpaceError: true,
  dynamicScreenSpaceErrorFactor: 20,
  progressiveResolutionHeightFraction: 0.5,
  foveatedScreenSpaceError: true,
  foveatedConeSize: 0.2,
  foveatedMinimumScreenSpaceErrorRelaxation: 6,
  foveatedTimeDelay: 0.35,
  skipLevelOfDetail: true,
  skipScreenSpaceErrorFactor: 8,
  skipLevels: 1,
  loadSiblings: false,
} satisfies Cesium3DTileset.ConstructorOptions;
