import type { Position, WorldEntity } from "@lumen/world";

function ringContainsPoint(ring: GeoJSON.Position[], longitude: number, latitude: number) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index]!; const [previousX, previousY] = ring[previous]!;
    if ((y > latitude) !== (previousY > latitude) && longitude < ((previousX - x) * (latitude - y)) / (previousY - y) + x) inside = !inside;
  }
  return inside;
}

function contains(geometry: GeoJSON.Geometry, [longitude, latitude]: Position) {
  const polygonContains = (polygon: GeoJSON.Position[][]) => Boolean(polygon[0] && ringContainsPoint(polygon[0], longitude, latitude))
    && !polygon.slice(1).some((ring) => ringContainsPoint(ring, longitude, latitude));
  if (geometry.type === "Polygon") return polygonContains(geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some(polygonContains);
  return false;
}

/** Resolve a BRK relation only from an actual polygon intersection. */
export function containingParcelEntity(point: Position, features: readonly GeoJSON.Feature[], entities: ReadonlyMap<string, WorldEntity>) {
  const feature = features.find((candidate) => contains(candidate.geometry, point));
  const registrationId = feature?.properties?.identificatie ?? feature?.id;
  return registrationId === undefined || registrationId === null ? null : entities.get(String(registrationId)) ?? null;
}
