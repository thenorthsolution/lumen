import { NextResponse } from "next/server";
import type { Provenance } from "@lumen/world";

const CBS_AREAS_URL = "https://api.pdok.nl/cbs/wijken-en-buurten-2025/ogc/v1/collections";
const NETHERLANDS_BOUNDS = [3.2, 50.7, 7.3, 53.7] as const;
const AREA_LIMIT = 500;

type AreaKind = "municipality" | "district" | "neighborhood";
type AreaDetail = AreaKind;
type AreaFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>>;
type AreaCollection = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>>;
type AreaApiResponse = AreaCollection & { provenance: Provenance };

const AREA_POINT_DISTANCE = 0.00008;
const AREA_CACHE_MS = 86_400_000;
const AREA_SCHEMA_VERSION = 3;
const memoryCache = new Map<string, { value: AreaApiResponse; expiresAt: number }>();

function simplifyRing(ring: GeoJSON.Position[]) {
  if (ring.length <= 5) return ring;
  const simplified = [ring[0]!];
  let previous = ring[0]!;
  for (let index = 1; index < ring.length - 1; index += 1) {
    const point = ring[index]!;
    if (Math.abs(point[0]! - previous[0]!) < AREA_POINT_DISTANCE && Math.abs(point[1]! - previous[1]!) < AREA_POINT_DISTANCE) continue;
    simplified.push(point);
    previous = point;
  }
  simplified.push(ring.at(-1)!);
  return simplified.length >= 4 ? simplified : ring;
}

function simplifyGeometry(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon) {
  if (geometry.type === "Polygon") return { ...geometry, coordinates: geometry.coordinates.map(simplifyRing) };
  return { ...geometry, coordinates: geometry.coordinates.map((polygon) => polygon.map(simplifyRing)) };
}

function readAreaRequest(request: Request) {
  const url = new URL(request.url);
  const detail = url.searchParams.get("detail") as AreaDetail | null;
  if (detail !== "municipality" && detail !== "district" && detail !== "neighborhood") return null;
  const values = url.searchParams.get("bbox")?.split(",").map(Number);
  if (!values || values.length !== 4 || values.some((value) => !Number.isFinite(value))) return null;
  const [rawWest, rawSouth, rawEast, rawNorth] = values as [number, number, number, number];
  const west = Math.max(NETHERLANDS_BOUNDS[0], rawWest);
  const south = Math.max(NETHERLANDS_BOUNDS[1], rawSouth);
  const east = Math.min(NETHERLANDS_BOUNDS[2], rawEast);
  const north = Math.min(NETHERLANDS_BOUNDS[3], rawNorth);
  if (west >= east || south >= north) return { detail, empty: true as const, bbox: "" };
  const maximumSpan = detail === "municipality" ? 6 : detail === "district" ? 2.5 : 1.5;
  if (east - west > maximumSpan || north - south > maximumSpan) return null;
  return { detail, empty: false as const, bbox: [west, south, east, north].map((value) => value.toFixed(4)).join(",") };
}

async function fetchAreas(collection: "gemeenten" | "wijken" | "buurten", kind: AreaKind, bbox: string, signal: AbortSignal) {
  const url = new URL(`${CBS_AREAS_URL}/${collection}/items`);
  url.searchParams.set("bbox", bbox);
  url.searchParams.set("limit", String(AREA_LIMIT));
  url.searchParams.set("f", "json");
  const response = await fetch(url, { signal, headers: { Accept: "application/geo+json, application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`CBS ${collection} antwoordde met ${response.status}`);
  const data = await response.json() as AreaCollection;
  return (data.features ?? []).map((feature): AreaFeature => {
    const properties = feature.properties ?? {};
    const code = String(kind === "municipality" ? properties.gemeentecode ?? "" : kind === "district" ? properties.wijkcode ?? "" : properties.buurtcode ?? "");
    const name = String(kind === "municipality" ? properties.gemeentenaam ?? "Onbekende gemeente" : kind === "district" ? properties.wijknaam ?? "Onbekende wijk" : properties.buurtnaam ?? "Onbekende buurt");
    const municipalityCode = String(properties.gemeentecode ?? "");
    const districtCode = String(properties.wijkcode ?? "");
    const parentCode = kind === "district" ? municipalityCode : kind === "neighborhood" ? districtCode : "";
    const parentName = kind === "district" ? String(properties.gemeentenaam ?? "") : kind === "neighborhood" ? String(properties.wijknaam ?? "") : "";
    return {
      type: "Feature",
      id: code || feature.id,
      geometry: simplifyGeometry(feature.geometry),
      properties: {
        areaKind: kind,
        code,
        name,
        municipality: String(properties.gemeentenaam ?? name),
        municipalityCode: municipalityCode || null,
        districtCode: districtCode || null,
        parentCode: parentCode || null,
        parentName: parentName || null,
        residents: Number(properties.aantal_inwoners) >= 0 ? Number(properties.aantal_inwoners) : null,
        year: 2025,
      },
    };
  });
}

const levelsFor = (detail: AreaDetail): Array<["gemeenten" | "wijken" | "buurten", AreaKind]> => detail === "municipality"
  ? [["gemeenten", "municipality"]]
  : detail === "district"
    ? [["gemeenten", "municipality"], ["wijken", "district"]]
    : [["wijken", "district"], ["buurten", "neighborhood"]];

export async function GET(request: Request) {
  const query = readAreaRequest(request);
  if (!query) return NextResponse.json({ error: "Ongeldige Nederlandse gebiedenviewport.", type: "FeatureCollection", features: [] }, { status: 400 });
  if (query.empty) return NextResponse.json({ type: "FeatureCollection", features: [] });

  const cacheKey = `${AREA_SCHEMA_VERSION}:${query.detail}:${query.bbox}`;
  const cached = memoryCache.get(cacheKey);
  if (process.env.NODE_ENV !== "test" && cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.value, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800", "X-Lumen-Area-Cache": "memory" } });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const groups = await Promise.all(levelsFor(query.detail).map(([collection, kind]) => fetchAreas(collection, kind, query.bbox, controller.signal)));
    const retrievedAt = new Date().toISOString();
    const value: AreaApiResponse = {
      type: "FeatureCollection",
      features: groups.flat(),
      provenance: {
        sourceId: "cbs-wijken-buurten-2025",
        sourceLabel: "CBS Wijken en Buurten 2025 via PDOK",
        sourceUrl: "https://www.pdok.nl/ogc-apis/-/article/cbs-wijken-en-buurten",
        retrievedAt,
        confidence: "verified",
        methodVersion: "cbs-area-navigation-1.0.0",
        limitations: ["Jaarlijkse gebiedsindeling; waarden beschrijven verslagjaar 2025 en zijn geen realtime waarneming."],
      },
    };
    if (process.env.NODE_ENV !== "test") {
      if (memoryCache.size >= 24) memoryCache.delete(memoryCache.keys().next().value!);
      memoryCache.set(cacheKey, { value, expiresAt: Date.now() + AREA_CACHE_MS });
    }
    return NextResponse.json(value, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch (cause) {
    const message = cause instanceof Error && cause.name === "AbortError"
      ? "CBS-gebieden reageerden niet binnen 6 seconden."
      : cause instanceof Error ? cause.message : "CBS-gebieden zijn niet bereikbaar.";
    return NextResponse.json({ error: message, type: "FeatureCollection", features: [] }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
