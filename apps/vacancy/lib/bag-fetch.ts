/**
 * lib/bag-fetch.ts
 *
 * Fetches BAG verblijfsobjecten for a given gemeente, runs the
 * viability scoring model, and returns a scored GeoJSON FeatureCollection.
 *
 * This runs entirely client-side using public PDOK endpoints.
 * No API key, no backend, no auth.
 */

import { type Gemeente } from "@lumen/pdok-client";

import {
  ALL_PAND_STATUSES,
  ALL_VBO_STATUSES,
  scoreViability,
  CONVERSION_ELIGIBLE_DOELEN,
  type VboInput,
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

export const SHORTLIST_COUNT_FILTERS = {
  bouwjaarMin: 0,
  oppervlakteMin: 0,
  gebruiksdoelen: [...CONVERSION_ELIGIBLE_DOELEN],
  vboStatuses: [...ALL_VBO_STATUSES],
  pandStatuses: [...ALL_PAND_STATUSES],
} as const;

interface OgcFeatureCollection<
  TProps = GeoJsonProperties,
> extends FeatureCollection<Geometry, TProps> {
  links?: Array<{
    rel?: string;
    href?: string;
  }>;
}

/**
 * Main fetch + score pipeline.
 */
export async function fetchAndScoreGemeente(
  gemeente: Gemeente,
  filters: FilterState,
  signal?: AbortSignal,
): Promise<VboFeatureCollection> {
  const [raw, pands] = await Promise.all([
    fetchOgcCollectionAllPages(
      "verblijfsobject",
      gemeente.bbox,
      signal,
      OGC_PAGE_LIMIT,
    ),
    fetchOgcCollectionAllPages("pand", gemeente.bbox, signal, OGC_PAGE_LIMIT),
  ]);

  if (!raw.features || raw.features.length === 0) {
    console.warn("BAG OGC returned no features for gemeente", gemeente.code);
    return emptyCollection();
  }

  const pandStatusByHref = new Map<string, string>();
  for (const pand of pands.features ?? []) {
    const featureId = String(pand.id ?? "");
    const status = String((pand.properties ?? {})["status"] ?? "");
    if (!featureId || !status) continue;
    pandStatusByHref.set(
      `${BAG_OGC_BASE}/collections/pand/items/${featureId}`,
      status,
    );
  }

  const scored = (raw.features as Feature<Geometry, GeoJsonProperties>[])
    .map((f): Feature<Geometry, VboFeatureProperties> | null => {
      const props = (f.properties ?? {}) as Record<string, unknown>;

      const status = String(props["status"] ?? props["STATUS"] ?? "");
      const gebruiksdoel = String(
        props["gebruiksdoel"] ?? props["gebruiksdoelverblijfsobject"] ?? "",
      ).toLowerCase();
      const bouwjaar = Number(props["bouwjaar"] ?? props["BOUWJAAR"] ?? 0);
      const oppervlakte = Number(
        props["oppervlakte"] ?? props["oppervlakteverblijfsobject"] ?? 0,
      );
      const pandStatus = resolvePandStatus(props, pandStatusByHref);

      const isEligible = isEligibleGebruiksdoel(gebruiksdoel);
      const meetsYear = bouwjaar >= filters.bouwjaarMin;
      const meetsSize = oppervlakte >= filters.oppervlakteMin;
      const matchesSelectedGebruik =
        filters.gebruiksdoelen.length === 0 ||
        filters.gebruiksdoelen
          .map((g) => g.toLowerCase())
          .includes(gebruiksdoel);
      const matchesVboStatus =
        filters.vboStatuses.length === 0 || filters.vboStatuses.includes(status);
      const matchesPandStatus =
        filters.pandStatuses.length === 0 ||
        !pandStatus ||
        filters.pandStatuses.includes(pandStatus);

      if (
        !isEligible ||
        !meetsYear ||
        !meetsSize ||
        !matchesSelectedGebruik ||
        !matchesVboStatus ||
        !matchesPandStatus
      ) {
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
        geometry: f.geometry,
        properties: {
          status,
          pandStatus,
          pandIdentificatie: resolvePandIdentificatie(props),
          bagUri: String(props["rdf_seealso"] ?? ""),
          gebruiksdoel,
          oppervlakte,
          bouwjaar,
          identificatie: String(props["identificatie"] ?? ""),
          woonplaatsnaam: String(
            props["woonplaats_naam"] ??
              props["woonplaatsnaam"] ??
              props["WOONPLAATSNAAM"] ??
              "",
          ),
          score,
        },
      };
    })
    .filter((f): f is Feature<Geometry, VboFeatureProperties> => f !== null);

  return {
    type: "FeatureCollection",
    features: scored,
  };
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
  const shortlistUses = SHORTLIST_COUNT_FILTERS.gebruiksdoelen.map((d) =>
    d.toLowerCase(),
  );
  let count = 0;
  let nextUrl: URL | null = buildCollectionUrl(
    "verblijfsobject",
    gemeente.bbox,
    OGC_COUNT_PAGE_LIMIT,
  );

  while (nextUrl) {
    const data = await fetchCollectionPage(nextUrl, signal);
    for (const feature of data.features ?? []) {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const gebruiksdoel = String(
        props["gebruiksdoel"] ?? props["gebruiksdoelverblijfsobject"] ?? "",
      ).toLowerCase();
      const bouwjaar = Number(props["bouwjaar"] ?? props["BOUWJAAR"] ?? 0);
      const oppervlakte = Number(
        props["oppervlakte"] ?? props["oppervlakteverblijfsobject"] ?? 0,
      );
      if (
        shortlistUses.includes(gebruiksdoel) &&
        bouwjaar >= SHORTLIST_COUNT_FILTERS.bouwjaarMin &&
        oppervlakte >= SHORTLIST_COUNT_FILTERS.oppervlakteMin
      ) {
        count += 1;
      }
    }
    const href = data.links?.find((link) => link?.rel === "next")?.href;
    nextUrl = href ? new URL(href) : null;
  }

  return count;
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
  return CONVERSION_ELIGIBLE_DOELEN.map((d) => d.toLowerCase()).includes(
    gebruiksdoel,
  );
}

function resolvePandStatus(
  props: Record<string, unknown>,
  pandStatusByHref: Map<string, string>,
): string {
  const rawHref = props["pand.href"];
  if (Array.isArray(rawHref)) {
    for (const value of rawHref) {
      const href = String(value ?? "");
      const status = pandStatusByHref.get(href);
      if (status) return status;
    }
  }
  if (typeof rawHref === "string") {
    return pandStatusByHref.get(rawHref) ?? "";
  }
  return "";
}

function resolvePandIdentificatie(props: Record<string, unknown>): string {
  const rawHref = props["pand.href"];
  const href = Array.isArray(rawHref)
    ? String(rawHref[0] ?? "")
    : typeof rawHref === "string"
      ? rawHref
      : "";

  if (!href) return "";
  return href.split("/").pop() ?? "";
}

function emptyCollection(): VboFeatureCollection {
  return { type: "FeatureCollection", features: [] };
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
