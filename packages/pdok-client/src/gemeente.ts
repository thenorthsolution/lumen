/**
 * @lumen/pdok-client — gemeente registry
 *
 * CBS gemeente codes, human-readable names, and bounding boxes (WGS84)
 * for use as default map viewport and API query scope.
 *
 * Source: CBS gemeentegrenzen 2024, EPSG:4326
 */

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

/**
 * Registry of all Dutch gemeenten.
 * Seeded with key municipalities; community PRs welcome for full coverage.
 * See CONTRIBUTING.md for the data format and validation rules.
 */
export const GEMEENTEN: Record<string, Gemeente> = {
  "0150": {
    code: "0150",
    name: "Deventer",
    province: "Overijssel",
    bbox: [6.08, 52.18, 6.32, 52.34],
    centroid: [6.1552, 52.2512],
    zoom: 12,
  },
  "0363": {
    code: "0363",
    name: "Amsterdam",
    province: "Noord-Holland",
    bbox: [4.728, 52.278, 5.079, 52.431],
    centroid: [4.9041, 52.3676],
    zoom: 12,
  },
  "0599": {
    code: "0599",
    name: "Rotterdam",
    province: "Zuid-Holland",
    bbox: [4.348, 51.864, 4.601, 51.999],
    centroid: [4.4777, 51.9244],
    zoom: 12,
  },
  "0518": {
    code: "0518",
    name: "Den Haag",
    province: "Zuid-Holland",
    bbox: [4.222, 52.018, 4.4, 52.132],
    centroid: [4.3007, 52.0705],
    zoom: 12,
  },
  "0344": {
    code: "0344",
    name: "Utrecht",
    province: "Utrecht",
    bbox: [4.999, 52.048, 5.2, 52.15],
    centroid: [5.1214, 52.0907],
    zoom: 13,
  },
  "0200": {
    code: "0200",
    name: "Apeldoorn",
    province: "Gelderland",
    bbox: [5.849, 52.13, 6.082, 52.3],
    centroid: [5.9699, 52.2112],
    zoom: 12,
  },
  "0153": {
    code: "0153",
    name: "Zwolle",
    province: "Overijssel",
    bbox: [6.034, 52.464, 6.214, 52.564],
    centroid: [6.083, 52.5168],
    zoom: 12,
  },
  "0193": {
    code: "0193",
    name: "Enschede",
    province: "Overijssel",
    bbox: [6.789, 52.166, 7.005, 52.297],
    centroid: [6.8936, 52.2215],
    zoom: 12,
  },
  "0246": {
    code: "0246",
    name: "Nijmegen",
    province: "Gelderland",
    bbox: [5.781, 51.771, 5.956, 51.882],
    centroid: [5.8638, 51.8126],
    zoom: 13,
  },
  "0995": {
    code: "0995",
    name: "Eindhoven",
    province: "Noord-Brabant",
    bbox: [5.404, 51.38, 5.58, 51.49],
    centroid: [5.4697, 51.4416],
    zoom: 13,
  },
};

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
