import { NextResponse } from "next/server";
import { entityId, type Bounds, type WorldEntity } from "@lumen/world";

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const MAX_SPAN = .08;
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const AMENITIES = "school|college|kindergarten|childcare|hospital|clinic|doctors|pharmacy|library|community_centre|social_centre|sports_centre";
const SHOPS = "supermarket|convenience";

const CATEGORY_LABELS: Record<string, string> = {
  school: "School", college: "Onderwijs", kindergarten: "Kinderopvang", childcare: "Kinderopvang",
  hospital: "Ziekenhuis", clinic: "Kliniek", doctors: "Huisarts", pharmacy: "Apotheek",
  library: "Bibliotheek", community_centre: "Buurtcentrum", social_centre: "Sociaal centrum", sports_centre: "Sportvoorziening",
  supermarket: "Supermarkt", convenience: "Dagelijkse winkel", station: "Station", halt: "OV-halte", platform: "OV-halte",
};

function parseBounds(value: string | null): Bounds | null {
  if (!value) return null;
  const values = value.split(",").map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return null;
  const [west, south, east, north] = values as [number, number, number, number];
  if (west >= east || south >= north || east - west > MAX_SPAN || north - south > MAX_SPAN) return null;
  if (west < 3 || east > 8 || south < 50 || north > 54) return null;
  return [west, south, east, north];
}

export async function GET(request: Request) {
  const bounds = parseBounds(new URL(request.url).searchParams.get("bbox"));
  if (!bounds) return NextResponse.json({ error: "Ongeldige of te grote viewport." }, { status: 400 });
  const [west, south, east, north] = bounds;
  const query = `[out:json][timeout:8];(nwr["amenity"~"^(${AMENITIES})$"](${south},${west},${north},${east});nwr["shop"~"^(${SHOPS})$"](${south},${west},${north},${east});nwr["public_transport"~"^(platform|station)$"](${south},${west},${north},${east});nwr["railway"~"^(station|halt)$"](${south},${west},${north},${east}););out center 500;`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9_000);
  try {
    const response = await fetch(`${OVERPASS_URL}?data=${encodeURIComponent(query)}`, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "Lumen-World/0.1 (open spatial viewer)" },
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error(`OpenStreetMap antwoordde met ${response.status}`);
    const payload = await response.json() as { elements?: OsmElement[] };
    const retrievedAt = new Date().toISOString();
    const entries = (payload.elements ?? []).flatMap((element) => {
      const longitude = element.lon ?? element.center?.lon;
      const latitude = element.lat ?? element.center?.lat;
      const amenity = element.tags?.amenity ?? element.tags?.shop ?? element.tags?.railway ?? element.tags?.public_transport;
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || !amenity) return [];
      const id = entityId(`osm-${element.type}-${element.id}`);
      const category = CATEGORY_LABELS[amenity] ?? "Voorziening";
      const name = element.tags?.name || category;
      const entity: WorldEntity = {
        id,
        type: "infrastructure",
        name,
        description: `${category} uit OpenStreetMap.`,
        geometry: { kind: "point", center: [longitude!, latitude!], bounds: [longitude!, latitude!, longitude!, latitude!], coordinateSystem: "WGS84" },
        properties: { osmType: element.type, osmId: element.id, amenity, category, website: element.tags?.website ?? null },
        provenance: [{ sourceId: "openstreetmap", sourceLabel: "© OpenStreetMap contributors", sourceUrl: "https://www.openstreetmap.org/copyright", retrievedAt, confidence: "medium", methodVersion: "osm-overpass-poi-1.0.0" }],
      };
      return [{
        feature: { type: "Feature" as const, id: String(id), geometry: { type: "Point" as const, coordinates: [longitude!, latitude!] }, properties: { lumenEntityId: id, amenity, category, name } },
        entity,
      }];
    });
    return NextResponse.json(
      { type: "FeatureCollection", features: entries.map(({ feature }) => feature), entities: entries.map(({ entity }) => entity) },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400", "Vary": "Accept-Encoding" } },
    );
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "OpenStreetMap reageerde niet op tijd." : error instanceof Error ? error.message : "OpenStreetMap is niet bereikbaar.";
    // POIs are optional context. An overloaded public Overpass instance must
    // not turn ordinary map navigation into a failed application request.
    return NextResponse.json(
      { type: "FeatureCollection", features: [], entities: [], degraded: true, warning: message },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=3600", "Vary": "Accept-Encoding" } },
    );
  } finally {
    clearTimeout(timeout);
  }
}
