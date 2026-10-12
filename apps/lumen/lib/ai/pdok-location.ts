import { lumenConfig } from "@/config/lumen";
import type { findWorldLocationOutputSchema } from "./world-tools";
import type { z } from "zod";

type LocationOutput = z.infer<typeof findWorldLocationOutputSchema>;
type PdokFeature = {
  id?: unknown;
  collection?: unknown;
  geometry?: { type?: unknown; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
};
type PdokResponse = { features?: unknown };

function geometryCenter(geometry: PdokFeature["geometry"]): [number, number] | null {
  if (!geometry) return null;
  if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
    const [longitude, latitude] = geometry.coordinates;
    return typeof longitude === "number" && Number.isFinite(longitude) && typeof latitude === "number" && Number.isFinite(latitude)
      ? [longitude, latitude]
      : null;
  }
  const points: Array<[number, number]> = [];
  const collect = (coordinates: unknown) => {
    if (!Array.isArray(coordinates)) return;
    if (coordinates.length >= 2 && typeof coordinates[0] === "number" && Number.isFinite(coordinates[0]) && typeof coordinates[1] === "number" && Number.isFinite(coordinates[1])) {
      points.push([coordinates[0], coordinates[1]]);
      return;
    }
    coordinates.forEach(collect);
  };
  collect(geometry.coordinates);
  if (!points.length) return null;
  const longitudes = points.map(([longitude]) => longitude);
  const latitudes = points.map(([, latitude]) => latitude);
  return [(Math.min(...longitudes) + Math.max(...longitudes)) / 2, (Math.min(...latitudes) + Math.max(...latitudes)) / 2];
}

function recommendedZoom(kind: string) {
  if (/adres|gebouw/i.test(kind)) return 17;
  if (/woonplaats|plaats/i.test(kind)) return 13;
  if (/gemeente/i.test(kind)) return 11;
  return 14;
}

function canonicalEntityType(kind: string) {
  if (/adres/i.test(kind)) return "address" as const;
  if (/gemeente/i.test(kind)) return "municipality" as const;
  return undefined;
}

export async function findPdokLocations(query: string, request: typeof fetch = fetch): Promise<LocationOutput> {
  const policy = lumenConfig.world.locationSearch;
  const retrievedAt = new Date().toISOString();
  const url = new URL(policy.endpoint);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("f", "json");
  url.searchParams.set("limit", String(policy.maxResults));
  url.searchParams.set("adres[version]", "1");
  url.searchParams.set("woonplaats[version]", "1");
  url.searchParams.set("gemeentegebied[version]", "1");
  try {
    const response = await request(url, {
      headers: { Accept: "application/geo+json, application/json" },
      signal: AbortSignal.timeout(policy.timeoutMs),
      next: { revalidate: policy.cacheSeconds },
    });
    if (!response.ok) return { status: "unavailable", message: "PDOK locatiezoeken is tijdelijk niet beschikbaar.", locations: [] };
    const payload = await response.json() as PdokResponse;
    const features = Array.isArray(payload.features) ? payload.features as PdokFeature[] : [];
    const locations = features.flatMap((feature) => {
      const center = geometryCenter(feature.geometry);
      if (!center || center[0] < -180 || center[0] > 180 || center[1] < -90 || center[1] > 90) return [];
      const properties = feature.properties ?? {};
      const name = String(properties.display_name ?? properties.name ?? "").trim();
      if (!name) return [];
      const kind = String(feature.collection ?? properties.collection ?? properties.type ?? "locatie");
      const externalId = String(properties.identificatie ?? properties.id ?? feature.id ?? `${kind}-${center[0].toFixed(7)}-${center[1].toFixed(7)}`);
      return [{
        externalId, name, kind, ...(canonicalEntityType(kind) ? { entityType: canonicalEntityType(kind) } : {}), longitude: center[0], latitude: center[1], recommendedZoom: recommendedZoom(kind),
        provenance: { sourceId: "pdok-location-api" as const, sourceLabel: "PDOK Location API" as const, sourceUrl: policy.endpoint, retrievedAt, confidence: "verified" as const, methodVersion: "pdok-location-search-1.0.0" as const },
      }];
    }).slice(0, policy.maxResults);
    if (!locations.length) return { status: "not_found", message: `Geen Nederlandse locatie gevonden voor “${query.trim()}”.`, locations: [] };
    return { status: "success", message: `${locations.length} gevalideerde locatie${locations.length === 1 ? "" : "s"} gevonden via PDOK.`, locations };
  } catch {
    return { status: "unavailable", message: "PDOK locatiezoeken is tijdelijk niet beschikbaar.", locations: [] };
  }
}
