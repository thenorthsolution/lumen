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
 *
 * Fetches BAG data for the gemeente, applies the viability scoring model,
 * and returns a GeoJSON FeatureCollection with score data attached to each feature.
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

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`PDOK WFS fout: ${response.status} ${response.statusText}`);
  }

  const raw = (await response.json()) as { features?: unknown[] };

  if (!raw.features) {
    return emptyCollection();
  }

  // Apply client-side filters and scoring
  const scored = (raw.features as Feature<Geometry, GeoJsonProperties>[])
    .filter((f) => {
      const props = f.properties ?? {};
      const bouwjaar = Number(props["bouwjaar"] ?? 0);
      const opp = Number(props["oppervlakte"] ?? 0);
      const gebruiksdoel = String(props["gebruiksdoel"] ?? "");

      return (
        bouwjaar >= filters.bouwjaarMin &&
        opp >= filters.oppervlakteMin &&
        (filters.gebruiksdoelen.length === 0 ||
          filters.gebruiksdoelen.includes(gebruiksdoel))
      );
    })
    .map((f): Feature<Geometry, VboFeatureProperties> => {
      const props = f.properties ?? {};

      const input: VboInput = {
        identificatie: String(props["identificatie"] ?? ""),
        bouwjaar: Number(props["bouwjaar"] ?? 0),
        oppervlakte: Number(props["oppervlakte"] ?? 0),
        gebruiksdoel: String(props["gebruiksdoel"] ?? ""),
        // WOZ data requires a separate lookup — flagged in warnings by scorer
        wozWaarde: undefined,
        gemeenteMediaanWozPerM2: undefined,
      };

      const score = scoreViability(input);

      return {
        type: "Feature",
        geometry: f.geometry,
        properties: {
          identificatie: input.identificatie,
          status: String(props["status"] ?? ""),
          gebruiksdoel: input.gebruiksdoel,
          oppervlakte: input.oppervlakte,
          bouwjaar: input.bouwjaar,
          woonplaatsnaam: String(props["woonplaatsnaam"] ?? ""),
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
 * Uses a conservative 55 m² average unit size.
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
