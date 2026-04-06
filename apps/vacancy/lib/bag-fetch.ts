/**
 * lib/bag-fetch.ts
 *
 * Fetches BAG verblijfsobjecten for a given gemeente, runs the
 * viability scoring model, and returns a scored GeoJSON FeatureCollection.
 *
 * This runs entirely client-side using public PDOK endpoints.
 * No API key, no backend, no auth.
 */

import {
  buildWfsUrl,
  PDOK_ENDPOINTS,
  type Gemeente,
} from "@lumen/pdok-client";

import {
  ALL_PAND_STATUSES,
  scoreViability,
  CONVERSION_ELIGIBLE_DOELEN,
  DEFAULT_SHORTLIST_PAND_STATUSES,
  DEFAULT_SHORTLIST_VBO_STATUSES,
} from "@lumen/bag-utils";

import type {
  VboFeatureCollection,
  VboFeatureProperties,
  FilterState,
} from "@/components/AppShell";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  GeoJsonProperties,
} from "geojson";

const BAG_OGC_BASE = "https://api.pdok.nl/kadaster/bag/ogc/v2";
const OGC_PAGE_LIMIT = 10000;
const OGC_COUNT_PAGE_LIMIT = 1000;
const WFS_PAGE_LIMIT = 1000;
const RD_BBOX_PADDING_METERS = 250;
const BAG_VERBLIJFSOBJECT_WFS_PROPERTIES = [
  "identificatie",
  "rdf_seealso",
  "oppervlakte",
  "status",
  "gebruiksdoel",
  "openbare_ruimte",
  "huisnummer",
  "huisletter",
  "toevoeging",
  "postcode",
  "woonplaats",
  "bouwjaar",
  "pandidentificatie",
  "pandstatus",
  "geom",
] as const;

export const SHORTLIST_COUNT_FILTERS = {
  bouwjaarMin: 0,
  oppervlakteMin: 0,
  gebruiksdoelen: [...CONVERSION_ELIGIBLE_DOELEN],
  vboStatuses: [...DEFAULT_SHORTLIST_VBO_STATUSES],
  pandStatuses: [...DEFAULT_SHORTLIST_PAND_STATUSES],
} as const;

interface OgcFeatureCollection<
  TProps = GeoJsonProperties,
> extends FeatureCollection<Geometry, TProps> {
  links?: Array<{
    rel?: string;
    href?: string;
  }>;
}

interface WfsFeatureCollection<
  TProps = GeoJsonProperties,
> extends FeatureCollection<Geometry, TProps> {
  totalFeatures?: number | string;
  numberMatched?: number;
  numberReturned?: number;
}

const gemeenteBaseCache = new Map<string, VboFeatureCollection>();
const gemeenteBasePromiseCache = new Map<string, Promise<VboFeatureCollection>>();

type PandMeta = {
  bouwjaar: number;
  identificatie: string;
  status: string;
};

/**
 * Main fetch + score pipeline.
 */
export async function fetchAndScoreGemeente(
  gemeente: Gemeente,
  filters: FilterState,
  signal?: AbortSignal,
): Promise<VboFeatureCollection> {
  throwIfAborted(signal);
  const startedAt = Date.now();
  const base = await getCachedGemeenteBase(gemeente);
  throwIfAborted(signal);

  logFilterDiagnostics(gemeente, base, filters);
  const filtered = applyFiltersToScoredCollection(base, filters);
  console.info("BAG shortlist ready", {
    gemeenteCode: gemeente.code,
    baseCount: base.features.length,
    filteredCount: filtered.features.length,
    durationMs: Date.now() - startedAt,
  });
  return filtered;
}

export async function fetchFeatureDetail(
  gemeente: Gemeente,
  identificatie: string,
): Promise<Feature<Geometry, VboFeatureProperties> | null> {
  const base = await getCachedGemeenteBase(gemeente);
  return (
    base.features.find(
      (feature) => feature.properties.identificatie === identificatie,
    ) ?? null
  );
}

async function fetchGemeenteVerblijfsobjectenWfs(
  gemeente: Gemeente,
  signal?: AbortSignal,
): Promise<WfsFeatureCollection> {
  const features: Feature<Geometry, GeoJsonProperties>[] = [];
  const seenIdentificaties = new Set<string>();
  let startIndex = 0;

  while (true) {
    const page = await fetchVerblijfsobjectWfsPage(gemeente, startIndex, signal);
    const pageFeatures = (page.features ?? []) as Feature<
      Geometry,
      GeoJsonProperties
    >[];
    if (pageFeatures.length === 0) {
      break;
    }
    let addedOnPage = 0;
    for (const feature of pageFeatures) {
      const identificatie = String(
        (feature.properties as Record<string, unknown> | null)?.[
          "identificatie"
        ] ?? "",
      );
      if (identificatie && seenIdentificaties.has(identificatie)) {
        continue;
      }
      if (identificatie) {
        seenIdentificaties.add(identificatie);
      }
      features.push(feature);
      addedOnPage += 1;
    }

    if (addedOnPage === 0) {
      console.warn(
        "BAG WFS pagination stalled; stopping to avoid duplicate loop",
        gemeente.code,
        { startIndex, pageSize: pageFeatures.length },
      );
      break;
    }
    startIndex += pageFeatures.length;
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

async function getCachedGemeenteBase(
  gemeente: Gemeente,
): Promise<VboFeatureCollection> {
  const key = gemeente.code;
  const cached = gemeenteBaseCache.get(key);
  if (cached) {
    return cached;
  }

  const inFlight = gemeenteBasePromiseCache.get(key);
  if (inFlight) {
    return inFlight;
  }

  const promise = buildGemeenteBase(gemeente)
    .then((result) => {
      gemeenteBaseCache.set(key, result);
      gemeenteBasePromiseCache.delete(key);
      return result;
    })
    .catch((error) => {
      gemeenteBasePromiseCache.delete(key);
      throw error;
    });

  gemeenteBasePromiseCache.set(key, promise);
  return promise;
}

async function buildGemeenteBase(
  gemeente: Gemeente,
): Promise<VboFeatureCollection> {
  const startedAt = Date.now();
  let raw: WfsFeatureCollection | OgcFeatureCollection | null = null;
  let pandMetaByKey = new Map<string, PandMeta>();
  let strategy: "wfs-rd" | "ogc-fallback" = "wfs-rd";

  try {
    raw = await fetchGemeenteVerblijfsobjectenWfs(gemeente);
  } catch (error) {
    console.warn(
      "BAG WFS shortlist failed; falling back to OGC base fetch for gemeente",
      gemeente.code,
      error,
    );
    strategy = "ogc-fallback";
  }

  if (!raw?.features || raw.features.length === 0) {
    console.warn(
      "BAG WFS shortlist returned no features; falling back to OGC base fetch for gemeente",
      gemeente.code,
    );
    strategy = "ogc-fallback";
  }

  if (strategy === "ogc-fallback") {
    const [ogcRaw, nextPandMetaByKey] = await Promise.all([
      fetchOgcCollectionAllPages(
        "verblijfsobject",
        gemeente.bbox,
        undefined,
        OGC_PAGE_LIMIT,
      ),
      fetchPandMetaIndex(gemeente.bbox),
    ]);
    raw = ogcRaw;
    pandMetaByKey = nextPandMetaByKey;
  }

  if (!raw || !raw.features || raw.features.length === 0) {
    console.warn("BAG shortlist returned no features for gemeente", gemeente.code);
    return emptyCollection();
  }

  const scored = (raw.features as Feature<Geometry, GeoJsonProperties>[])
    .map((feature) => mapRawFeatureToScoredFeature(feature, pandMetaByKey))
    .filter((feature): feature is Feature<Geometry, VboFeatureProperties> => feature !== null);

  console.info("BAG gemeente base built", {
    gemeenteCode: gemeente.code,
    strategy,
    rawCount: raw.features.length,
    featureCount: scored.length,
    durationMs: Date.now() - startedAt,
  });

  return {
    type: "FeatureCollection",
    features: scored,
  };
}

function mapRawFeatureToScoredFeature(
  feature: Feature<Geometry, GeoJsonProperties>,
  pandMetaByKey: Map<string, PandMeta>,
): Feature<Geometry, VboFeatureProperties> | null {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const pandMeta = resolvePandMeta(props, pandMetaByKey);
  const rawGebruiksdoel = String(
    props["gebruiksdoel"] ?? props["gebruiksdoelverblijfsobject"] ?? "",
  ).toLowerCase();

  const status = String(props["status"] ?? props["STATUS"] ?? "");
  const gebruiksdoel = pickPrimaryEligibleGebruiksdoel(rawGebruiksdoel);
  const bouwjaar = numberValue(
    props["bouwjaar"] ??
      props["BOUWJAAR"] ??
      props["oorspronkelijkbouwjaar"] ??
      props["oorspronkelijk_bouwjaar"] ??
      pandMeta?.bouwjaar,
  );
  const oppervlakte = Number(
    props["oppervlakte"] ?? props["oppervlakteverblijfsobject"] ?? 0,
  );
  const pandStatus = resolvePandStatus(props, pandMetaByKey);

  if (!isEligibleGebruiksdoel(rawGebruiksdoel)) {
    return null;
  }

  const score = scoreViability({
    identificatie: String(props["identificatie"] ?? ""),
    bouwjaar,
    oppervlakte,
    gebruiksdoel,
    vboStatus: status,
    pandStatus,
  });

  return {
    type: "Feature",
    geometry: feature.geometry,
    properties: {
      status,
      pandStatus: pandStatus || "onbekend",
      pandIdentificatie: resolvePandIdentificatie(props) || pandMeta?.identificatie || "",
      bagUri: String(props["rdf_seealso"] ?? ""),
      openbareruimtenaam: String(
        props["openbareruimtenaam"] ??
          props["openbare_ruimte"] ??
          props["openbare_ruimte_naam"] ??
          props["naam_openbare_ruimte"] ??
          "",
      ),
      huisnummer: String(props["huisnummer"] ?? ""),
      huisletter: String(props["huisletter"] ?? ""),
      huisnummertoevoeging: String(
        props["huisnummertoevoeging"] ??
          props["toevoeging"] ??
          props["huisnummer_toevoeging"] ??
          "",
      ),
      postcode: String(props["postcode"] ?? ""),
      gebruiksdoel,
      oppervlakte,
      bouwjaar,
      identificatie: String(props["identificatie"] ?? ""),
      woonplaatsnaam: String(
        props["woonplaats_naam"] ??
          props["woonplaats"] ??
          props["woonplaatsnaam"] ??
          props["WOONPLAATSNAAM"] ??
          "",
      ),
      score,
    },
  };
}

function applyFiltersToScoredCollection(
  collection: VboFeatureCollection,
  filters: FilterState,
): VboFeatureCollection {
  const selectedGebruiksdoelen =
    filters.gebruiksdoelen.length > 0
      ? new Set(filters.gebruiksdoelen.map((value) => value.toLowerCase()))
      : null;
  const selectedVboStatuses =
    filters.vboStatuses.length > 0 ? new Set(filters.vboStatuses) : null;
  const selectedPandStatuses =
    filters.pandStatuses.length > 0 &&
    filters.pandStatuses.length < ALL_PAND_STATUSES.length
      ? new Set(filters.pandStatuses)
      : null;

  return {
    type: "FeatureCollection",
    features: collection.features.filter((feature) => {
      const props = feature.properties;
      const gebruiksdoel = props.gebruiksdoel?.toLowerCase() ?? "";
      const vboStatus = props.status ?? "";
      const pandStatus = props.pandStatus ?? "";
      const bouwjaar = props.bouwjaar ?? 0;
      const oppervlakte = props.oppervlakte ?? 0;

      if (selectedGebruiksdoelen && !selectedGebruiksdoelen.has(gebruiksdoel)) {
        return false;
      }
      if (selectedVboStatuses && !selectedVboStatuses.has(vboStatus)) {
        return false;
      }
      if (selectedPandStatuses && !selectedPandStatuses.has(pandStatus)) {
        return false;
      }
      if (bouwjaar < filters.bouwjaarMin) {
        return false;
      }
      if (oppervlakte < filters.oppervlakteMin) {
        return false;
      }
      return true;
    }),
  };
}

function logFilterDiagnostics(
  gemeente: Gemeente,
  collection: VboFeatureCollection,
  filters: FilterState,
) {
  const selectedGebruiksdoelen =
    filters.gebruiksdoelen.length > 0
      ? new Set(filters.gebruiksdoelen.map((value) => value.toLowerCase()))
      : null;
  const selectedVboStatuses =
    filters.vboStatuses.length > 0 ? new Set(filters.vboStatuses) : null;
  const selectedPandStatuses =
    filters.pandStatuses.length > 0 &&
    filters.pandStatuses.length < ALL_PAND_STATUSES.length
      ? new Set(filters.pandStatuses)
      : null;

  const afterGebruiksdoel = collection.features.filter((feature) => {
    const gebruiksdoel = feature.properties.gebruiksdoel?.toLowerCase() ?? "";
    return !selectedGebruiksdoelen || selectedGebruiksdoelen.has(gebruiksdoel);
  });
  const afterVboStatus = afterGebruiksdoel.filter((feature) => {
    const vboStatus = feature.properties.status ?? "";
    return !selectedVboStatuses || selectedVboStatuses.has(vboStatus);
  });
  const afterPandStatus = afterVboStatus.filter((feature) => {
    const pandStatus = feature.properties.pandStatus ?? "";
    return !selectedPandStatuses || selectedPandStatuses.has(pandStatus);
  });
  const afterBouwjaar = afterPandStatus.filter((feature) => {
    const bouwjaar = feature.properties.bouwjaar ?? 0;
    return bouwjaar >= filters.bouwjaarMin;
  });
  const afterOppervlakte = afterBouwjaar.filter((feature) => {
    const oppervlakte = feature.properties.oppervlakte ?? 0;
    return oppervlakte >= filters.oppervlakteMin;
  });

  console.info("BAG shortlist filter diagnostics", {
    gemeenteCode: gemeente.code,
    totalBase: collection.features.length,
    afterGebruiksdoel: afterGebruiksdoel.length,
    removedByGebruiksdoel: collection.features.length - afterGebruiksdoel.length,
    afterVboStatus: afterVboStatus.length,
    removedByVboStatus: afterGebruiksdoel.length - afterVboStatus.length,
    afterPandStatus: afterPandStatus.length,
    removedByPandStatus: afterVboStatus.length - afterPandStatus.length,
    afterBouwjaar: afterBouwjaar.length,
    removedByBouwjaar: afterPandStatus.length - afterBouwjaar.length,
    afterOppervlakte: afterOppervlakte.length,
    removedByOppervlakte: afterBouwjaar.length - afterOppervlakte.length,
    filters: {
      bouwjaarMin: filters.bouwjaarMin,
      oppervlakteMin: filters.oppervlakteMin,
      gebruiksdoelen: filters.gebruiksdoelen,
      vboStatuses: filters.vboStatuses,
      pandStatuses: filters.pandStatuses,
    },
  });
}

async function fetchVerblijfsobjectWfsPage(
  gemeente: Gemeente,
  startIndex: number,
  signal?: AbortSignal,
): Promise<WfsFeatureCollection> {
  const baseUrl = buildWfsUrl({
    service: PDOK_ENDPOINTS.BAG_WFS,
    typeName: "bag:verblijfsobject",
    bbox: wgs84BboxToRd(gemeente.bbox),
    count: WFS_PAGE_LIMIT,
    srsName: "EPSG:4326",
    propertyName: [...BAG_VERBLIJFSOBJECT_WFS_PROPERTIES],
  });
  const url = new URL(baseUrl);
  url.searchParams.set("startIndex", String(startIndex));

  return fetchWfsPage(url, signal, "verblijfsobject");
}

async function fetchPandMetaIndex(
  bbox: Gemeente["bbox"],
  signal?: AbortSignal,
): Promise<Map<string, PandMeta>> {
  const pands = await fetchOgcCollectionAllPages("pand", bbox, signal, OGC_PAGE_LIMIT);
  const pandMetaByKey = new Map<string, PandMeta>();

  for (const pand of pands.features ?? []) {
    const featureId = String(pand.id ?? "");
    const props = (pand.properties ?? {}) as Record<string, unknown>;
    const status = String(props["status"] ?? "");
    const bouwjaar = numberValue(props["bouwjaar"] ?? props["BOUWJAAR"]);
    const identificatie = String(props["identificatie"] ?? "");
    if (!featureId || (!status && !bouwjaar && !identificatie)) continue;

    const meta: PandMeta = {
      bouwjaar,
      identificatie,
      status,
    };
    const keys = [
      featureId,
      identificatie,
      `${BAG_OGC_BASE}/collections/pand/items/${featureId}`,
    ].filter(Boolean);

    for (const key of keys) {
      pandMetaByKey.set(key, meta);
    }
  }

  return pandMetaByKey;
}

export async function fetchPandGeometries(
  bbox: Gemeente["bbox"],
  signal?: AbortSignal,
): Promise<FeatureCollection<Geometry, GeoJsonProperties>> {
  return fetchOgcCollectionAllPages("pand", bbox, signal, OGC_PAGE_LIMIT);
}

export async function fetchEligibleCountForGemeente(
  gemeente: Gemeente,
  signal?: AbortSignal,
): Promise<number> {
  const base = await getCachedGemeenteBase(gemeente);
  throwIfAborted(signal);
  return applyFiltersToScoredCollection(base, {
    bouwjaarMin: SHORTLIST_COUNT_FILTERS.bouwjaarMin,
    oppervlakteMin: SHORTLIST_COUNT_FILTERS.oppervlakteMin,
    gebruiksdoelen: [...SHORTLIST_COUNT_FILTERS.gebruiksdoelen],
    vboStatuses: [...SHORTLIST_COUNT_FILTERS.vboStatuses],
    pandStatuses: [...SHORTLIST_COUNT_FILTERS.pandStatuses],
  }).features.length;
}

async function fetchOgcCollection(
  collection: "pand" | "verblijfsobject",
  bbox: Gemeente["bbox"],
  signal?: AbortSignal,
  limit = OGC_PAGE_LIMIT,
): Promise<OgcFeatureCollection> {
  const url = buildCollectionUrl(collection, bbox, limit);
  return fetchCollectionPage(url, signal, collection);
}

async function fetchOgcCollectionAllPages(
  collection: "pand" | "verblijfsobject",
  bbox: Gemeente["bbox"],
  signal?: AbortSignal,
  limit = OGC_PAGE_LIMIT,
): Promise<OgcFeatureCollection> {
  let nextUrl: URL | null = buildCollectionUrl(collection, bbox, limit);
  const features: Feature<Geometry, GeoJsonProperties>[] = [];
  let lastLinks: OgcFeatureCollection["links"] = [];

  while (nextUrl) {
    const page = await fetchCollectionPage(nextUrl, signal, collection);
    features.push(...((page.features ?? []) as Feature<
      Geometry,
      GeoJsonProperties
    >[]));
    lastLinks = page.links ?? [];
    const href = page.links?.find((link) => link?.rel === "next")?.href;
    nextUrl = href ? new URL(href) : null;
  }

  return {
    type: "FeatureCollection",
    features,
    links: lastLinks,
  };
}

async function fetchCollectionPage(
  url: URL,
  signal?: AbortSignal,
  collection = "verblijfsobject",
): Promise<OgcFeatureCollection> {
  let response: Response;
  try {
    response = await fetch(url.toString(), signal ? { signal } : {});
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new Error(
      `Netwerk fout bij ophalen BAG ${collection}: ${(err as Error).message}`,
    );
  }

  if (!response.ok) {
    console.error(
      "BAG OGC request failed:",
      collection,
      response.status,
      response.statusText,
      url.toString(),
    );
    throw new Error(
      `PDOK BAG OGC fout (${collection}): ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as OgcFeatureCollection;
}

async function fetchWfsPage(
  url: URL,
  signal?: AbortSignal,
  collection = "verblijfsobject",
): Promise<WfsFeatureCollection> {
  let response: Response;
  try {
    response = await fetch(url.toString(), signal ? { signal } : {});
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new Error(
      `Netwerk fout bij ophalen BAG WFS ${collection}: ${(err as Error).message}`,
    );
  }

  if (!response.ok) {
    console.error(
      "BAG WFS request failed:",
      collection,
      response.status,
      response.statusText,
      url.toString(),
    );
    throw new Error(
      `PDOK BAG WFS fout (${collection}): ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as WfsFeatureCollection;
}

function buildCollectionUrl(
  collection: "pand" | "verblijfsobject",
  bbox: Gemeente["bbox"],
  limit: number,
): URL {
  const url = new URL(`${BAG_OGC_BASE}/collections/${collection}/items`);
  url.searchParams.set("f", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("bbox", bbox.join(","));
  return url;
}

function isEligibleGebruiksdoel(gebruiksdoel: string): boolean {
  const eligible = new Set(
    CONVERSION_ELIGIBLE_DOELEN.map((value) => value.toLowerCase()),
  );
  return splitGebruiksdoelen(gebruiksdoel).some((value) => eligible.has(value));
}

function pickPrimaryEligibleGebruiksdoel(gebruiksdoel: string): string {
  const doelen = splitGebruiksdoelen(gebruiksdoel);
  const eligible = new Set(
    CONVERSION_ELIGIBLE_DOELEN.map((value) => value.toLowerCase()),
  );
  return doelen.find((value) => eligible.has(value)) ?? doelen[0] ?? "";
}

function splitGebruiksdoelen(gebruiksdoel: string): string[] {
  return gebruiksdoel
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function resolvePandStatus(
  props: Record<string, unknown>,
  pandMetaByKey: Map<string, PandMeta>,
): string {
  const directStatus = String(props["pandstatus"] ?? props["pandStatus"] ?? "");
  if (directStatus) {
    return directStatus;
  }

  return resolvePandMeta(props, pandMetaByKey)?.status ?? "";
}

function resolvePandIdentificatie(props: Record<string, unknown>): string {
  const rawPandIdentificatie =
    props["pandidentificatie"] ??
    props["pand_identificatie"] ??
    props["pandId"] ??
    props["pand.id"] ??
    "";
  if (rawPandIdentificatie && !Array.isArray(rawPandIdentificatie)) {
    return String(rawPandIdentificatie);
  }
  if (Array.isArray(rawPandIdentificatie)) {
    return String(rawPandIdentificatie[0] ?? "");
  }

  return "";
}

function resolvePandMeta(
  props: Record<string, unknown>,
  pandMetaByKey: Map<string, PandMeta>,
): PandMeta | null {
  for (const key of resolvePandLookupKeys(props)) {
    const match = pandMetaByKey.get(key);
    if (match) {
      return match;
    }
  }

  return null;
}

function resolvePandLookupKeys(props: Record<string, unknown>): string[] {
  const keys: string[] = [];
  const directCandidates = [
    props["pandidentificatie"],
    props["pand_identificatie"],
    props["pandId"],
    props["pand.id"],
  ];

  for (const candidate of directCandidates) {
    if (!candidate) continue;
    if (Array.isArray(candidate)) {
      keys.push(...candidate.map((value) => String(value ?? "")));
    } else {
      keys.push(String(candidate));
    }
  }

  const rawHref = props["pand.href"];
  if (Array.isArray(rawHref)) {
    for (const value of rawHref) {
      const href = String(value ?? "");
      if (!href) continue;
      keys.push(href, href.split("/").pop() ?? "");
    }
  } else if (typeof rawHref === "string" && rawHref) {
    keys.push(rawHref, rawHref.split("/").pop() ?? "");
  }

  return Array.from(new Set(keys.filter(Boolean)));
}

function escapeCqlValue(value: string): string {
  return value.replace(/'/g, "''");
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw new DOMException("The operation was aborted.", "AbortError");
}

function emptyCollection(): VboFeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

function wgs84BboxToRd([west, south, east, north]: Gemeente["bbox"]): Gemeente["bbox"] {
  const corners = [
    wgs84ToRd(south, west),
    wgs84ToRd(south, east),
    wgs84ToRd(north, west),
    wgs84ToRd(north, east),
  ];
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);

  return [
    Math.min(...xs) - RD_BBOX_PADDING_METERS,
    Math.min(...ys) - RD_BBOX_PADDING_METERS,
    Math.max(...xs) + RD_BBOX_PADDING_METERS,
    Math.max(...ys) + RD_BBOX_PADDING_METERS,
  ];
}

function wgs84ToRd(lat: number, lon: number): [number, number] {
  const dLat = 0.36 * (lat - 52.1551744);
  const dLon = 0.36 * (lon - 5.38720621);

  const x =
    155000 +
    190094.945 * dLon +
    -11832.228 * dLat * dLon +
    -114.221 * dLat * dLon ** 2 +
    -32.391 * dLon ** 3 +
    -0.705 * dLat +
    -2.34 * dLat ** 3 * dLon +
    -0.608 * dLat * dLon ** 3 +
    -0.008 * dLat ** 2 * dLon ** 2;
  const y =
    463000 +
    309056.544 * dLat +
    3638.893 * dLon ** 2 +
    73.077 * dLat ** 2 +
    -157.984 * dLat * dLon ** 2 +
    59.788 * dLat ** 3 +
    0.433 * dLon ** 4 +
    -6.439 * dLat ** 2 * dLon ** 2 +
    -0.032 * dLat ** 4 +
    0.092 * dLon ** 2 * dLat ** 3 +
    -0.054 * dLat * dLon ** 4;

  return [Math.round(x), Math.round(y)];
}

/**
 * Estimate number of housing units from total floor area.
 */
export function estimateWoningen(totalOppervlakte: number): {
  min: number;
  max: number;
} {
  return {
    min: Math.floor(totalOppervlakte / 80),
    max: Math.floor(totalOppervlakte / 40),
  };
}
