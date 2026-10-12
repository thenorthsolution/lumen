import { NextResponse } from "next/server";
import { kadasterPercelenOgcUrl } from "@lumen/pdok-client";
import { entityId, type Bounds, type Position, type WorldEntity } from "@lumen/world";

type ParcelGeometry = { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
type ParcelFeature = { type: "Feature"; id?: string | number; geometry: ParcelGeometry; properties?: Record<string, unknown> };
type ParcelCollection = { features?: ParcelFeature[]; links?: Array<{ rel?: string; href?: string }> };

const DEFAULT_BOUNDS: Bounds = [6.145, 52.247, 6.165, 52.263];
const MAX_SPAN = 0.08;
const PAGE_SIZE = 1000;
const MAX_PAGES = 5;
const REQUEST_TTL_MS = 30_000;
const requests = new Map<string, { expiresAt: number; promise: Promise<{ features: ParcelFeature[]; truncated: boolean }> }>();

function parseBounds(value: string | null): Bounds | null {
  if (!value) return DEFAULT_BOUNDS;
  const parts = value.split(",").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const [west, south, east, north] = parts as unknown as Bounds;
  if (west >= east || south >= north || east - west > MAX_SPAN || north - south > MAX_SPAN) return null;
  if (west < 3 || east > 8 || south < 50 || north > 54) return null;
  return [west, south, east, north];
}

function trustedNextPage(collection: ParcelCollection) {
  const href = collection.links?.find((link) => link.rel === "next")?.href;
  if (!href) return null;
  try {
    const url = new URL(href);
    return url.protocol === "https:" && url.hostname === "api.pdok.nl" ? url.toString() : null;
  } catch { return null; }
}

function coordinatePairs(value: unknown, result: Position[] = []): Position[] {
  if (!Array.isArray(value)) return result;
  if (typeof value[0] === "number" && typeof value[1] === "number") result.push([value[0], value[1]]);
  else value.forEach((child) => coordinatePairs(child, result));
  return result;
}

function parcelId(feature: ParcelFeature) {
  const properties = feature.properties ?? {};
  return String(properties.identificatie_lokaal_id ?? feature.id ?? "");
}

function normalize(feature: ParcelFeature, retrievedAt: string): WorldEntity | null {
  if (!feature.geometry || !["Polygon", "MultiPolygon"].includes(feature.geometry.type)) return null;
  const rawId = parcelId(feature);
  const points = coordinatePairs(feature.geometry.coordinates);
  if (!rawId || !points.length) return null;
  const xs = points.map(([x]) => x); const ys = points.map(([, y]) => y);
  const bounds: Bounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const properties = feature.properties ?? {};
  const cadastralMunicipality = String(properties.kadastrale_gemeente_waarde ?? "Onbekende kadastrale gemeente");
  const section = String(properties.sectie ?? "");
  const parcelNumber = String(properties.perceelnummer ?? "");
  const registeredArea = Number(properties.kadastrale_grootte_waarde);
  return {
    id: entityId(`brk-perceel-${rawId}`),
    type: "parcel",
    name: [cadastralMunicipality, section, parcelNumber].filter(Boolean).join(" "),
    description: "Perceel uit de openbare Kadastrale Kaart.",
    geometry: { kind: feature.geometry.type === "Polygon" ? "polygon" : "multipolygon", center: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2], bounds, coordinateSystem: "WGS84" },
    properties: {
      identificatie: rawId,
      kadastraleGemeente: cadastralMunicipality,
      sectie: section || null,
      perceelnummer: parcelNumber || null,
      kadastraleOppervlakteM2: Number.isFinite(registeredArea) ? registeredArea : null,
      status: String(properties.status_historie_waarde ?? "Status onbekend"),
    },
    provenance: [{
      sourceId: "pdok-brk-perceel", sourceLabel: "Kadastrale Kaart via PDOK",
      sourceUrl: "https://www.pdok.nl/ogc-apis/-/article/kadastrale-kaart", retrievedAt,
      confidence: "verified", methodVersion: "brk-kadastrale-kaart-ogc-v1",
      limitations: ["De Kadastrale Kaart geeft een indicatie van de ligging; er kunnen geen maten aan worden ontleend.", "Eigendom en zakelijke rechten zijn niet opgenomen in deze openbare kaartlaag."],
    }],
  };
}

async function fetchParcels(bounds: Bounds, signal: AbortSignal) {
  const features: ParcelFeature[] = [];
  let nextUrl: string | null = kadasterPercelenOgcUrl([...bounds], PAGE_SIZE);
  let pages = 0;
  while (nextUrl && pages < MAX_PAGES) {
    const response = await fetch(nextUrl, { signal, headers: { Accept: "application/geo+json, application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error(`PDOK antwoordde met ${response.status}`);
    const collection = await response.json() as ParcelCollection;
    features.push(...(collection.features ?? []).filter((feature) => feature.geometry));
    nextUrl = trustedNextPage(collection);
    pages += 1;
  }
  return { features, truncated: nextUrl !== null };
}

function loadParcels(bounds: Bounds) {
  const key = bounds.join(","); const now = Date.now(); const cached = requests.get(key);
  if (cached && cached.expiresAt > now) return cached.promise;
  if (cached) requests.delete(key);
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8_000);
  const promise = fetchParcels(bounds, controller.signal).finally(() => clearTimeout(timeout));
  requests.set(key, { expiresAt: now + REQUEST_TTL_MS, promise });
  void promise.catch(() => { if (requests.get(key)?.promise === promise) requests.delete(key); });
  return promise;
}

export async function GET(request: Request) {
  const bounds = parseBounds(new URL(request.url).searchParams.get("bbox"));
  if (!bounds) return NextResponse.json({ error: "Ongeldige of te grote viewport." }, { status: 400 });
  try {
    const result = await loadParcels(bounds);
    const unique = new Map<string, ParcelFeature>();
    for (const feature of result.features) {
      const id = parcelId(feature);
      if (id) unique.set(id, feature);
    }
    const retrievedAt = new Date().toISOString();
    const pairs = Array.from(unique.values()).map((feature) => ({ feature, entity: normalize(feature, retrievedAt) })).filter((pair): pair is { feature: ParcelFeature; entity: WorldEntity } => pair.entity !== null);
    return NextResponse.json({
      type: "FeatureCollection",
      features: pairs.map(({ feature, entity }) => ({ ...feature, id: String(entity.properties.identificatie), properties: { identificatie: entity.properties.identificatie, lumenEntityId: entity.id } })),
      entities: pairs.map(({ entity }) => entity),
      provenance: { source: "Kadastrale Kaart via PDOK", retrievedAt },
      truncated: result.truncated,
    }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400", "Vary": "Accept-Encoding" } });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "PDOK reageerde niet binnen 8 seconden." : error instanceof Error ? error.message : "PDOK is niet bereikbaar.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
