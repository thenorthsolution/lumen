/**
 * lib/bag-fetch.ts
 *
 * Fetches BAG verblijfsobjecten for a given gemeente, runs the
 * viability scoring model, and returns a scored GeoJSON FeatureCollection.
 *
 * This runs entirely client-side using public PDOK endpoints.
 * No API key, no backend, no auth.
 */

import { bagVerblijfsobjectenUrl, type Gemeente } from "@lumen/pdok-client";

import {
  scoreViability,
  VACANCY_INDICATOR_STATUSES,
  CONVERSION_ELIGIBLE_DOELEN,
  type VboInput,
} from "@lumen/bag-utils";

import type {
  VboFeatureCollection,
  VboFeatureProperties,
  FilterState,
} from "@/components/AppShell";
import type { Feature, Geometry, GeoJsonProperties } from "geojson";

/**
 * Main fetch + score pipeline.
 */
export async function fetchAndScoreGemeente(
  gemeente: Gemeente,
  filters: FilterState,
  signal?: AbortSignal,
): Promise<VboFeatureCollection> {
  const url = bagVerblijfsobjectenUrl(gemeente.code, {
    status: VACANCY_INDICATOR_STATUSES,
    gebruiksdoel: CONVERSION_ELIGIBLE_DOELEN,
    maxFeatures: 5000,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new Error(
      `Netwerk fout bij ophalen BAG data: ${(err as Error).message}`,
    );
  }

  if (!response.ok) {
    // Log the full URL to help debug future issues
    console.error(
      "BAG WFS request failed:",
      response.status,
      response.statusText,
      url,
    );
    throw new Error(`PDOK WFS fout: ${response.status} ${response.statusText}`);
  }

  const raw = (await response.json()) as { features?: unknown[] };

  if (!raw.features || raw.features.length === 0) {
    console.warn("BAG WFS returned no features for gemeente", gemeente.code);
    return emptyCollection();
  }

  // Apply client-side filters and scoring
  const scored = (raw.features as Feature<Geometry, GeoJsonProperties>[])
    .filter((f) => {
      const props = (f.properties ?? {}) as Record<string, unknown>;
      // Field names in PDOK response may use camelCase or lowercase
      const bouwjaar = Number(props["bouwjaar"] ?? props["BOUWJAAR"] ?? 0);
      const opp = Number(
        props["oppervlakte"] ??
          props["oppervlakteverblijfsobject"] ??
          props["OPPERVLAKTE"] ??
          0,
      );
      const gebruiksdoel = String(
        props["gebruiksdoel"] ?? props["gebruiksdoelverblijfsobject"] ?? "",
      );

      return (
        bouwjaar >= filters.bouwjaarMin &&
        opp >= filters.oppervlakteMin &&
        (filters.gebruiksdoelen.length === 0 ||
          filters.gebruiksdoelen.includes(gebruiksdoel))
      );
    })
    .map((f): Feature<Geometry, VboFeatureProperties> => {
      const props = (f.properties ?? {}) as Record<string, unknown>;

      // Normalise field names — PDOK may return different casings
      const identificatie = String(
        props["identificatie"] ?? props["IDENTIFICATIE"] ?? "",
      );
      const bouwjaar = Number(props["bouwjaar"] ?? props["BOUWJAAR"] ?? 0);
      const oppervlakte = Number(
        props["oppervlakte"] ??
          props["oppervlakteverblijfsobject"] ??
          props["OPPERVLAKTE"] ??
          0,
      );
      const gebruiksdoel = String(
        props["gebruiksdoel"] ?? props["gebruiksdoelverblijfsobject"] ?? "",
      );
      const status = String(props["status"] ?? props["STATUS"] ?? "");
      const woonplaatsnaam = String(
        props["woonplaatsnaam"] ?? props["WOONPLAATSNAAM"] ?? "",
      );

      const input: VboInput = {
        identificatie,
        bouwjaar,
        oppervlakte,
        gebruiksdoel,
      };

      const score = scoreViability(input);

      return {
        type: "Feature",
        geometry: f.geometry,
        properties: {
          identificatie,
          status,
          gebruiksdoel,
          oppervlakte,
          bouwjaar,
          woonplaatsnaam,
          score,
        },
      };
    });

  return {
    type: "FeatureCollection",
    features: scored,
  };
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
