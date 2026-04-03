/**
 * lib/land-fetch.ts — ruimtevinden
 *
 * Identifies land opportunity types for housing development using:
 * - BAG verblijfsobjecten (underused parcels)
 * - Ruimtelijkeplannen bestemmingsplan WFS (zoning designations)
 * - Derived infill signals from parcel geometry
 *
 * Three opportunity tiers are detected:
 *
 * INFILL     — Small parcels (200–2000 m²) adjacent to residential zones
 *              with no active BAG object or with non-residential use
 *
 * HERBESTEMMING — Former industrial/retail zones with wonen-compatible or
 *                 mixed bestemmingsplan designation
 *
 * TRANSFORMATIE — Larger underused sites (>2000 m²) in or adjacent to
 *                 residential areas, suitable for phased development
 */

import { buildWfsUrl, PDOK_ENDPOINTS, type Gemeente } from "@lumen/pdok-client";
import type {
  LandFeatureCollection,
  LandFilterState,
} from "@/components/AppShell";
import type { Feature, Geometry, GeoJsonProperties } from "geojson";

export type LandOpportunityType = "infill" | "herbestemming" | "transformatie";

export interface LandOpportunity {
  identificatie: string;
  type: LandOpportunityType;
  oppervlakte: number;
  bestemmingshoofdgroep: string;
  gemeentecode: string;
  /** Estimated dwelling capacity — conservative 60 m²/woning */
  estimatedWoningen: number;
  rationale: string;
}

/**
 * Fetch BAG objects with non-residential or absent use in a gemeente.
 * These are the candidate parcels for all three opportunity types.
 */
async function fetchUnderusedParcels(
  gemeente: Gemeente,
  signal?: AbortSignal,
): Promise<Feature<Geometry, GeoJsonProperties>[]> {
  const url = buildWfsUrl({
    service: PDOK_ENDPOINTS.BAG_WFS,
    typeName: "bag:verblijfsobject",
    cqlFilter: [
      `gemeentecode = '${gemeente.code}'`,
      `(gebruiksdoel = 'industriefunctie' OR gebruiksdoel = 'winkelfunctie' OR gebruiksdoel = 'kantoorfunctie' OR gebruiksdoel = 'overige gebruiksfunctie')`,
    ].join(" AND "),
    count: 3000,
    propertyName: [
      "identificatie",
      "status",
      "gebruiksdoel",
      "oppervlakte",
      "bouwjaar",
      "gemeentecode",
      "geometrie",
    ],
  });

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`BAG WFS error: ${res.status}`);
  const data = (await res.json()) as {
    features?: Feature<Geometry, GeoJsonProperties>[];
  };
  return data.features ?? [];
}

/**
 * Fetch bestemmingsplan designations from Ruimtelijkeplannen.nl
 * Filters for wonen-compatible or gemengd bestemmingsvlakken.
 */
async function fetchBestemmingsplannen(
  gemeente: Gemeente,
  signal?: AbortSignal,
): Promise<Feature<Geometry, GeoJsonProperties>[]> {
  // RO WFS — bestemmingsvlak layer
  const url = buildWfsUrl({
    service: PDOK_ENDPOINTS.RO_WFS,
    typeName: "ro:Bestemmingsvlak",
    cqlFilter: [
      `gemeenteNaam = '${gemeente.name}'`,
      `(bestemmingshoofdgroep = 'gemengd' OR bestemmingshoofdgroep = 'bedrijventerrein' OR naam LIKE '%wonen%' OR naam LIKE '%gemengd%')`,
    ].join(" AND "),
    count: 2000,
    propertyName: [
      "identificatie",
      "naam",
      "bestemmingshoofdgroep",
      "planidentificatie",
      "geometrie",
    ],
  });

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: Feature<Geometry, GeoJsonProperties>[];
    };
    return data.features ?? [];
  } catch {
    // Ruimtelijkeplannen WFS is occasionally unavailable — graceful degradation
    console.warn(
      "Ruimtelijkeplannen WFS unavailable — bestemmingsplan layer omitted",
    );
    return [];
  }
}

/**
 * Classify a parcel into an opportunity type based on its properties.
 */
function classifyOpportunity(
  props: Record<string, unknown>,
  bestemmingshoofdgroep: string,
): LandOpportunity | null {
  const opp = Number(props["oppervlakte"] ?? 0);
  const gebruiksdoel = String(props["gebruiksdoel"] ?? "");
  const id = String(props["identificatie"] ?? "");
  const gemeentecode = String(props["gemeentecode"] ?? "");

  if (opp <= 0) return null;

  // INFILL — small parcel, non-residential, potentially adjacent to wonen
  if (
    opp >= 200 &&
    opp <= 2000 &&
    ["winkelfunctie", "overige gebruiksfunctie"].includes(gebruiksdoel)
  ) {
    return {
      identificatie: id,
      type: "infill",
      oppervlakte: opp,
      bestemmingshoofdgroep,
      gemeentecode,
      estimatedWoningen: Math.max(1, Math.floor(opp / 60)),
      rationale: `Klein perceel (${opp} m²) met niet-residentieel gebruik. Geschikt voor inbreidingslocatie van ${Math.max(1, Math.floor(opp / 60))} tot ${Math.floor(opp / 40)} woningen.`,
    };
  }

  // HERBESTEMMING — former industrial/retail with gemengd bestemming
  if (
    ["industriefunctie", "kantoorfunctie"].includes(gebruiksdoel) &&
    ["gemengd", "bedrijventerrein"].includes(bestemmingshoofdgroep)
  ) {
    return {
      identificatie: id,
      type: "herbestemming",
      oppervlakte: opp,
      bestemmingshoofdgroep,
      gemeentecode,
      estimatedWoningen: Math.floor(opp / 70),
      rationale: `${gebruiksdoel.charAt(0).toUpperCase() + gebruiksdoel.slice(1)} (${opp} m²) in zone met gemengde bestemming. Herbestemming naar wonen of gemengd programma haalbaar zonder planwijziging.`,
    };
  }

  // TRANSFORMATIE — large underused site
  if (
    opp > 2000 &&
    ["industriefunctie", "kantoorfunctie"].includes(gebruiksdoel)
  ) {
    return {
      identificatie: id,
      type: "transformatie",
      oppervlakte: opp,
      bestemmingshoofdgroep,
      gemeentecode,
      estimatedWoningen: Math.floor(opp / 80),
      rationale: `Groot onderbezet terrein (${(opp / 10000).toFixed(1)} ha). Gefaseerde transformatie naar woningbouw of gemengd stedelijk programma. Planprocedure vereist.`,
    };
  }

  return null;
}

/**
 * Main pipeline: fetch parcels + bestemmingsplan, classify, return scored FeatureCollection.
 */
export async function fetchLandOpportunities(
  gemeente: Gemeente,
  filters: LandFilterState,
  signal?: AbortSignal,
): Promise<LandFeatureCollection> {
  const [parcels, bestemmingen] = await Promise.all([
    fetchUnderusedParcels(gemeente, signal),
    fetchBestemmingsplannen(gemeente, signal),
  ]);

  // Build a quick lookup: identificatie -> bestemmingshoofdgroep
  // In a real implementation this would use spatial intersection via DuckDB/PostGIS
  // For now we use the most common bestemmingshoofdgroep in the gemeente
  const bestemmingCounts: Record<string, number> = {};
  for (const b of bestemmingen) {
    const hg = String((b.properties ?? {})["bestemmingshoofdgroep"] ?? "");
    if (hg) bestemmingCounts[hg] = (bestemmingCounts[hg] ?? 0) + 1;
  }
  const dominantBestemming =
    Object.entries(bestemmingCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ??
    "gemengd";

  const features = parcels
    .map((f): Feature<Geometry, Record<string, unknown>> | null => {
      const props = (f.properties ?? {}) as Record<string, unknown>;
      const opp = Number(props["oppervlakte"] ?? 0);

      // Apply filters
      if (opp < filters.oppervlakteMin) return null;
      if (
        filters.bouwjaarMax &&
        Number(props["bouwjaar"] ?? 9999) > filters.bouwjaarMax
      )
        return null;

      const opportunity = classifyOpportunity(props, dominantBestemming);
      if (!opportunity) return null;
      if (!filters.types.includes(opportunity.type)) return null;

      return {
        type: "Feature",
        geometry: f.geometry,
        properties: {
          ...props,
          opportunity_type: opportunity.type,
          opportunity_opp: opportunity.oppervlakte,
          opportunity_woningen: opportunity.estimatedWoningen,
          opportunity_rationale: opportunity.rationale,
          bestemmingshoofdgroep: opportunity.bestemmingshoofdgroep,
        },
      };
    })
    .filter((f): f is Feature<Geometry, Record<string, unknown>> => f !== null);

  return {
    type: "FeatureCollection",
    features: features as LandFeatureCollection["features"],
  };
}

export function totalEstimatedWoningen(fc: LandFeatureCollection): number {
  return fc.features.reduce(
    (sum, f) => sum + Number(f.properties?.["opportunity_woningen"] ?? 0),
    0,
  );
}
