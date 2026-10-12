import type { CameraState } from "@lumen/world";

/** Coverage envelope for the Dutch PDOK/BAG product. */
export const NETHERLANDS_BOUNDS = [3.2, 50.7, 7.3, 53.7] as const;
export const NETHERLANDS_MAX_CAMERA_HEIGHT_M = 750_000;
export const NETHERLANDS_MIN_ZOOM = Math.log2(40_000_000 / NETHERLANDS_MAX_CAMERA_HEIGHT_M);

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export function clampCameraToNetherlands(camera: CameraState): CameraState {
  return {
    ...camera,
    center: [
      clamp(camera.center[0], NETHERLANDS_BOUNDS[0], NETHERLANDS_BOUNDS[2]),
      clamp(camera.center[1], NETHERLANDS_BOUNDS[1], NETHERLANDS_BOUNDS[3]),
    ],
    zoom: Math.max(camera.zoom, NETHERLANDS_MIN_ZOOM),
  };
}
