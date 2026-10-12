/** Adapted from God's Eye View scenePick.js. See THIRD_PARTY_NOTICES.md. */
const MIN_WORLD_MAGNITUDE_M = 6_000_000;
const MAX_WORLD_MAGNITUDE_M = 1_000_000_000;

export function isPickedWorldPosition(
  position: { x: number; y: number; z: number } | null | undefined,
): position is { x: number; y: number; z: number } {
  if (!position) return false;
  if (![position.x, position.y, position.z].every(Number.isFinite)) return false;
  const magnitude = Math.hypot(position.x, position.y, position.z);
  return magnitude >= MIN_WORLD_MAGNITUDE_M && magnitude <= MAX_WORLD_MAGNITUDE_M;
}
