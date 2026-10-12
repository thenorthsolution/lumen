import { NextResponse } from "next/server";
import { bagPandByIdentificationOgcUrl, bagPandOgcFeatureUrl, bagPandenOgcUrl } from "@lumen/pdok-client";
import { entityId, type Bounds, type Position, type WorldEntity } from "@lumen/world";

type PolygonGeometry = { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
type BagFeature = { type: "Feature"; id?: string | number; geometry: PolygonGeometry; properties?: Record<string, unknown> };
type BagCollection = { features?: BagFeature[]; links?: Array<{ rel?: string; href?: string }> };
type BagResult = { features: BagFeature[]; truncated: boolean };

const DEFAULT_BOUNDS: Bounds = [6.145, 52.247, 6.165, 52.263];
const MAX_SPAN = 0.08;
const PAGE_SIZE = 1000;
const MAX_PAGES = 5;
const PARTITION_LONGITUDE_SPAN = 0.025;
const PARTITION_LATITUDE_SPAN = 0.018;
const BAG_MEMORY_TTL_MS = 300_000;
const BAG_MEMORY_MAX_ENTRIES = 32;
const bagRequests = new Map<string, { expiresAt: number; promise: Promise<BagResult[]> }>();
const PDOK_FEATURE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BAG_IDENTIFICATION = /^\d{16}$/;

function splitBounds([west, south, east, north]: Bounds): Bounds[] {
  const middleLongitude = (west + east) / 2;
  const middleLatitude = (south + north) / 2;
  return [
    [west, south, middleLongitude, middleLatitude],
    [middleLongitude, south, east, middleLatitude],
    [west, middleLatitude, middleLongitude, north],
    [middleLongitude, middleLatitude, east, north],
  ];
}

function shouldPartitionBounds([west, south, east, north]: Bounds) {
  return east - west > PARTITION_LONGITUDE_SPAN || north - south > PARTITION_LATITUDE_SPAN;
}

function nextPdokPage(collection: BagCollection) {
  const href = collection.links?.find((link) => link.rel === "next")?.href;
  if (!href) return null;
  try {
    const url = new URL(href);
    return url.protocol === "https:" && url.hostname === "api.pdok.nl" ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseBounds(value: string | null): Bounds | null {
  if (!value) return DEFAULT_BOUNDS;
  const parts = value.split(",").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const west = parts[0]!; const south = parts[1]!; const east = parts[2]!; const north = parts[3]!;
  if (west >= east || south >= north || east - west > MAX_SPAN || north - south > MAX_SPAN) return null;
  if (west < 3 || east > 8 || south < 50 || north > 54) return null;
  return [west, south, east, north];
}

function coordinatePairs(value: unknown, result: Position[] = []): Position[] {
  if (!Array.isArray(value)) return result;
  if (typeof value[0] === "number" && typeof value[1] === "number") result.push([value[0], value[1]]);
  else value.forEach((child) => coordinatePairs(child, result));
  return result;
}

function normalize(feature: BagFeature, retrievedAt: string): WorldEntity | null {
  if (!feature.geometry || !["Polygon", "MultiPolygon"].includes(feature.geometry.type)) return null;
  const points = coordinatePairs(feature.geometry.coordinates);
  if (!points.length) return null;
  const xs = points.map(([x]) => x); const ys = points.map(([, y]) => y);
  const bounds: Bounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const properties = feature.properties ?? {};
  const rawId = String(properties.identificatie ?? feature.id ?? "");
  if (!rawId) return null;
  const center: Position = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
  const status = String(properties.status ?? "Status onbekend");
  const usage = Array.isArray(properties.gebruiksdoel)
    ? properties.gebruiksdoel.map(String).filter(Boolean).join(", ")
    : String(properties.gebruiksdoel ?? "").trim();
  return {
    id: entityId(`bag-pand-${rawId}`), type: "building", name: `BAG-pand ${rawId.slice(-6)}`,
    description: `Geregistreerd BAG-pand (${status.toLowerCase()}).`,
    geometry: { kind: feature.geometry.type === "Polygon" ? "polygon" : "multipolygon", center, bounds, coordinateSystem: "WGS84" },
    provenance: [{ sourceId: "pdok-bag-pand", sourceLabel: "BAG via PDOK", sourceUrl: "https://www.pdok.nl/introductie/-/article/basisregistratie-adressen-en-gebouwen-ba-1", retrievedAt, confidence: "verified", methodVersion: "bag-ogc-wfs-v2" }],
    properties: { identificatie: rawId, status, bouwjaar: Number(properties.bouwjaar) || null, gebruiksdoel: usage || null, documentdatum: String(properties.documentdatum ?? "Onbekend") },
  };
}

async function fetchBagBounds(queryBounds: Bounds, signal: AbortSignal): Promise<BagResult> {
  const features: BagFeature[] = [];
  let nextUrl: string | null = bagPandenOgcUrl([...queryBounds], PAGE_SIZE);
  let pages = 0;
  while (nextUrl && pages < MAX_PAGES) {
    const response = await fetch(nextUrl, { signal, headers: { Accept: "application/geo+json, application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error(`PDOK antwoordde met ${response.status}`);
    const collection = await response.json() as BagCollection;
    features.push(...(collection.features ?? []).filter((feature) => feature.geometry));
    nextUrl = nextPdokPage(collection);
    pages += 1;
  }
  return { features, truncated: nextUrl !== null };
}

async function fetchBagFeature(featureId: string, signal: AbortSignal): Promise<BagFeature> {
  const response = await fetch(bagPandOgcFeatureUrl(featureId), { signal, headers: { Accept: "application/geo+json, application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`PDOK antwoordde met ${response.status}`);
  return response.json() as Promise<BagFeature>;
}

async function fetchBagIdentification(identification: string, signal: AbortSignal): Promise<BagFeature | null> {
  const response = await fetch(bagPandByIdentificationOgcUrl(identification), { signal, headers: { Accept: "application/geo+json, application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`PDOK antwoordde met ${response.status}`);
  const collection = await response.json() as BagCollection;
  return collection.features?.find((feature) => String(feature.properties?.identificatie ?? "") === identification) ?? null;
}

function loadBagResults(bounds: Bounds) {
  const key = bounds.join(",");
  const now = Date.now();
  const cached = bagRequests.get(key);
  if (cached && cached.expiresAt > now) return cached.promise;
  if (cached) bagRequests.delete(key);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const promise = (async () => {
    const shouldPartition = shouldPartitionBounds(bounds);
    let results = await Promise.all((shouldPartition ? splitBounds(bounds) : [bounds]).map((part) => fetchBagBounds(part, controller.signal)));
    // Dense compact viewports can still exceed the pagination ceiling. Retry those
    // in quadrants so reducing the common request count never drops BAG outlines.
    if (!shouldPartition && results[0]?.truncated) {
      results = await Promise.all(splitBounds(bounds).map((part) => fetchBagBounds(part, controller.signal)));
    }
    return results;
  })().finally(() => {
    clearTimeout(timeout);
    if (process.env.NODE_ENV === "test" && bagRequests.get(key)?.promise === promise) bagRequests.delete(key);
  });

  if (bagRequests.size >= BAG_MEMORY_MAX_ENTRIES) bagRequests.delete(bagRequests.keys().next().value!);
  bagRequests.set(key, { expiresAt: now + BAG_MEMORY_TTL_MS, promise });
  void promise.catch(() => {
    if (bagRequests.get(key)?.promise === promise) bagRequests.delete(key);
  });
  return promise;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const featureId = requestUrl.searchParams.get("featureId");
  const identification = requestUrl.searchParams.get("identificatie");
  if (featureId || identification) {
    if (featureId && !PDOK_FEATURE_ID.test(featureId)) return NextResponse.json({ error: "Ongeldig PDOK BAG-feature-ID." }, { status: 400 });
    if (identification && !BAG_IDENTIFICATION.test(identification)) return NextResponse.json({ error: "Ongeldige BAG-pandidentificatie." }, { status: 400 });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    try {
      const feature = featureId
        ? await fetchBagFeature(featureId, controller.signal)
        : await fetchBagIdentification(identification!, controller.signal);
      if (!feature) return NextResponse.json({ error: "BAG-pand niet gevonden." }, { status: 404 });
      const retrievedAt = new Date().toISOString();
      const entity = normalize(feature, retrievedAt);
      if (!entity) return NextResponse.json({ error: "PDOK leverde geen bruikbaar BAG-pand." }, { status: 502 });
      return NextResponse.json({ feature: { ...feature, properties: { ...feature.properties, lumenEntityId: entity.id } }, entity, provenance: { source: "BAG via PDOK", retrievedAt } }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400", "Vary": "Accept-Encoding" } });
    } catch (error) {
      const message = error instanceof Error && error.name === "AbortError" ? "PDOK reageerde niet binnen 4 seconden." : error instanceof Error ? error.message : "PDOK is niet bereikbaar.";
      return NextResponse.json({ error: message }, { status: 502 });
    } finally {
      clearTimeout(timeout);
    }
  }
  const bounds = parseBounds(requestUrl.searchParams.get("bbox"));
  const geometryOnly = requestUrl.searchParams.get("geometry") === "1";
  if (!bounds) return NextResponse.json({ error: "Ongeldige of te grote viewport." }, { status: 400 });
  try {
    const results = await loadBagResults(bounds);
    const uniqueFeatures = new Map<string, BagFeature>();
    for (const feature of results.flatMap((result) => result.features)) {
      const key = String(feature.properties?.identificatie ?? feature.id ?? "");
      if (key) uniqueFeatures.set(key, feature);
    }
    const features = Array.from(uniqueFeatures.values());
    const truncated = results.some((result) => result.truncated);
    const retrievedAt = new Date().toISOString();
    if (geometryOnly) {
      const outlines = features.flatMap((feature) => {
        const identificatie = String(feature.properties?.identificatie ?? feature.id ?? "");
        if (!identificatie) return [];
        const stableFeatureId = feature.id === undefined ? "" : String(feature.id);
        return [{ type: "Feature" as const, id: identificatie, geometry: feature.geometry, properties: {
          identificatie,
          status: String(feature.properties?.status ?? "Status onbekend"),
          gebruiksdoel: Array.isArray(feature.properties?.gebruiksdoel) ? feature.properties.gebruiksdoel.join(",") : String(feature.properties?.gebruiksdoel ?? ""),
          ...(PDOK_FEATURE_ID.test(stableFeatureId) ? { pdokFeatureId: stableFeatureId } : {}),
        } }];
      });
      return NextResponse.json(
        { type: "FeatureCollection", features: outlines, truncated },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400", "Vary": "Accept-Encoding" } },
      );
    }
    const pairs = features.map((feature) => ({ feature, entity: normalize(feature, retrievedAt) })).filter((pair): pair is { feature: BagFeature; entity: WorldEntity } => pair.entity !== null);
    const entities = pairs.map(({ entity }) => entity);
    const normalizedFeatures = pairs.map(({ feature, entity }) => ({ ...feature, properties: { ...feature.properties, lumenEntityId: entity.id } }));
    return NextResponse.json({ type: "FeatureCollection", features: normalizedFeatures, entities, provenance: { source: "BAG via PDOK", retrievedAt }, truncated }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400", "Vary": "Accept-Encoding" } });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "PDOK reageerde niet binnen 8 seconden." : error instanceof Error ? error.message : "PDOK is niet bereikbaar.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
