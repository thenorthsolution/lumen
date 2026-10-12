import type { WorldEntity } from "@lumen/world";

const CELL_DEGREES = 0.001;
type PoiEntry = { feature: GeoJSON.Feature<GeoJSON.Point>; entity?: WorldEntity };

function ringContainsPoint(ring: GeoJSON.Position[], [longitude, latitude]: GeoJSON.Position) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index]!; const [previousX, previousY] = ring[previous]!;
    if ((y > latitude) !== (previousY > latitude) && longitude < ((previousX - x) * (latitude - y)) / (previousY - y) + x) inside = !inside;
  }
  return inside;
}

function containsPoint(geometry: GeoJSON.Geometry, point: GeoJSON.Position) {
  const polygonContains = (polygon: GeoJSON.Position[][]) => Boolean(polygon[0] && ringContainsPoint(polygon[0], point))
    && !polygon.slice(1).some((ring) => ringContainsPoint(ring, point));
  if (geometry.type === "Polygon") return polygonContains(geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some(polygonContains);
  return false;
}

function bounds(geometry: GeoJSON.Geometry) {
  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") return null;
  let west = Infinity; let south = Infinity; let east = -Infinity; let north = -Infinity;
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      west = Math.min(west, value[0]); east = Math.max(east, value[0]); south = Math.min(south, value[1]); north = Math.max(north, value[1]); return;
    }
    value.forEach(visit);
  };
  visit(geometry.coordinates);
  return Number.isFinite(west) ? [west, south, east, north] as const : null;
}

const cell = (coordinate: number) => Math.floor(coordinate / CELL_DEGREES);
const key = (x: number, y: number) => `${x}:${y}`;

const POI_PRIORITY: Record<string, number> = {
  station: 100, halt: 95, hospital: 90, school: 85, college: 84,
  kindergarten: 80, childcare: 80, clinic: 75, doctors: 74,
  pharmacy: 70, library: 65, community_centre: 60, social_centre: 60,
  sports_centre: 55, supermarket: 30, convenience: 20,
};

export function poiImportance(feature: GeoJSON.Feature) {
  const kind = String(feature.properties?.amenity ?? "").toLowerCase();
  return POI_PRIORITY[kind] ?? 0;
}

function representativePoint(feature: GeoJSON.Feature): GeoJSON.Position | null {
  if (feature.geometry.type === "Point") return feature.geometry.coordinates;
  const box = bounds(feature.geometry);
  return box ? [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2] : null;
}

/** Adds display-only vacancy signals by spatial containment; VBO and pand IDs differ. */
export function decorateBuildingsWithOpportunities(buildings: readonly GeoJSON.Feature[], opportunities: readonly GeoJSON.Feature[]) {
  const points = opportunities.flatMap((feature) => {
    if (feature.properties?.opportunityCandidate === false) return [];
    const point = representativePoint(feature);
    return point ? [point] : [];
  });
  if (!points.length) return buildings.slice();
  return buildings.map((building) => {
    const box = bounds(building.geometry);
    if (!box) return building;
    const match = points.some((point) => point[0]! >= box[0] && point[0]! <= box[2] && point[1]! >= box[1] && point[1]! <= box[3] && containsPoint(building.geometry, point));
    return match ? { ...building, properties: { ...building.properties, opportunityCandidate: true } } : building;
  });
}

export function decorateBuildingsWithPois(buildings: readonly GeoJSON.Feature[], pois: readonly GeoJSON.Feature[], poiEntities: readonly WorldEntity[]) {
  const entitiesById = new Map(poiEntities.map((entity) => [String(entity.id), entity]));
  const grid = new Map<string, PoiEntry[]>();
  const entries: PoiEntry[] = [];
  for (const feature of pois) {
    if (feature.geometry.type !== "Point") continue;
    const [longitude, latitude] = feature.geometry.coordinates;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    const entry = { feature: feature as GeoJSON.Feature<GeoJSON.Point>, entity: entitiesById.get(String(feature.properties?.lumenEntityId ?? "")) };
    entries.push(entry);
    const bucketKey = key(cell(longitude!), cell(latitude!));
    const bucket = grid.get(bucketKey); if (bucket) bucket.push(entry); else grid.set(bucketKey, [entry]);
  }

  let candidateChecks = 0;
  const poiByBuildingId = new Map<string, WorldEntity>();
  const features = buildings.map((building) => {
    const box = bounds(building.geometry); if (!box || !entries.length) return building;
    const minX = cell(box[0]); const maxX = cell(box[2]); const minY = cell(box[1]); const maxY = cell(box[3]);
    const bucketCount = (maxX - minX + 1) * (maxY - minY + 1);
    const candidates: PoiEntry[] = [];
    if (bucketCount > 256) candidates.push(...entries);
    else for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) candidates.push(...(grid.get(key(x, y)) ?? []));
    let poi: PoiEntry | undefined;
    let importance = -1;
    for (const candidate of candidates) {
      candidateChecks += 1;
      if (!containsPoint(building.geometry, candidate.feature.geometry.coordinates)) continue;
      const candidateImportance = poiImportance(candidate.feature);
      if (candidateImportance > importance) { poi = candidate; importance = candidateImportance; }
    }
    if (!poi) return building;
    const buildingId = String(building.properties?.identificatie ?? building.id ?? "");
    if (buildingId && poi.entity) poiByBuildingId.set(buildingId, poi.entity);
    return { ...building, properties: { ...building.properties, poiCategory: poi.feature.properties?.category, poiName: poi.feature.properties?.name } };
  });
  return { features, poiByBuildingId, candidateChecks };
}
