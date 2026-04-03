/**
 * @lumen/pdok-client — gemeente registry
 *
 * CBS gemeente codes, human-readable names, and bounding boxes (WGS84)
 * for use as default map viewport and API query scope.
 *
 * Source: CBS gemeentegrenzen 2024, EPSG:4326
 */

import GEMEENTEN_DATA from "./gemeenten.generated.json";

export interface Gemeente {
  /** CBS gemeentecode, zero-padded to 4 digits */
  code: string;
  name: string;
  province: string;
  /** WGS84 bounding box [west, south, east, north] */
  bbox: [number, number, number, number];
  /** Approximate centroid [lng, lat] */
  centroid: [number, number];
  /** Default zoom level for MapLibre */
  zoom: number;
}

export const GEMEENTEN =
  GEMEENTEN_DATA as unknown as Record<string, Gemeente>;

/** Default gemeente shown on first load — Deventer as KvK anchor */
export const DEFAULT_GEMEENTE_CODE = "0150";

export function getGemeente(code: string): Gemeente | undefined {
  return GEMEENTEN[code];
}

export function getDefaultGemeente(): Gemeente {
  const g = GEMEENTEN[DEFAULT_GEMEENTE_CODE];
  if (!g)
    throw new Error("Default gemeente not found — this should never happen");
  return g;
}

/** Search gemeenten by (partial) name, case-insensitive */
export function searchGemeenten(query: string): Gemeente[] {
  const q = query.toLowerCase().trim();
  if (!q) return Object.values(GEMEENTEN);
  return Object.values(GEMEENTEN).filter(
    (g) =>
      g.name.toLowerCase().includes(q) ||
      g.province.toLowerCase().includes(q) ||
      g.code.includes(q),
  );
}
