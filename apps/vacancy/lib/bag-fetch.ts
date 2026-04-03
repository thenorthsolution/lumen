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
    fetchOgcCollection(
      "verblijfsobject",
      gemeente.bbox,
      signal,
      OGC_PAGE_LIMIT,
    ),
    fetchOgcCollection("pand", gemeente.bbox, signal, OGC_PAGE_LIMIT),
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

      const isEligible = CONVERSION_ELIGIBLE_DOELEN.map((d) =>
        d.toLowerCase(),
      ).includes(gebruiksdoel);
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
  return fetchOgcCollection("pand", bbox, signal, OGC_PAGE_LIMIT);
}

async function fetchOgcCollection(
  collection: "pand" | "verblijfsobject",
  bbox: Gemeente["bbox"],
  signal?: AbortSignal,
  limit = OGC_PAGE_LIMIT,
): Promise<OgcFeatureCollection> {
  const url = new URL(`${BAG_OGC_BASE}/collections/${collection}/items`);
  url.searchParams.set("f", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("bbox", bbox.join(","));

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
