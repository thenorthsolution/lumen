/**
 * @lumen/pdok-client — PDOK API helpers
 *
 * Typed helpers for querying PDOK WFS services and resolving tile URLs.
 * All endpoints are public and require no API key.
 *
 * Documentation: https://www.pdok.nl/ogc-services
 */

export const PDOK_ENDPOINTS = {
  /** BAG WFS — adressen, verblijfsobjecten, panden */
  BAG_WFS: "https://service.pdok.nl/lv/bag/wfs/v2_0",

  /** Bestemmingsplan WFS (Ruimtelijkeplannen.nl) */
  RO_WFS: "https://afnemers.ruimtelijkeplannen.nl/ruimtelijkeplannen/wfs",

  /** Kadastrale percelen WFS */
  KADASTER_WFS: "https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0",

  /** BGT (grootschalige topografie) WFS */
  BGT_WFS: "https://service.pdok.nl/lv/bgt/wfs/v1_0",

  /** PDOK vector tiles — BRT achtergrondkaart */
  BRT_TILES:
    "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/{z}/{x}/{y}.png",

  /** Luchtfoto tiles */
  LUCHTFOTO_TILES:
    "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg",
} as const;

export interface WfsQueryParams {
  service: string;
  typeName: string;
  /** CQL filter expression */
  cqlFilter?: string;
  /** Max features to return */
  count?: number;
  /** Output SRS — defaults to WGS84 */
  srsName?: string;
  /** Property names to return (reduces payload) */
  propertyName?: string[];
}

/**
 * Build a PDOK WFS GetFeature URL.
 * Returns GeoJSON FeatureCollection.
 */
export function buildWfsUrl(params: WfsQueryParams): string {
  const base = params.service;
  const url = new URL(base);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeName", params.typeName);
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("srsName", params.srsName ?? "EPSG:4326");

  if (params.count) {
    url.searchParams.set("count", String(params.count));
  }
  if (params.cqlFilter) {
    url.searchParams.set("CQL_FILTER", params.cqlFilter);
  }
  if (params.propertyName?.length) {
    url.searchParams.set("propertyName", params.propertyName.join(","));
  }

  return url.toString();
}

/**
 * Fetch BAG verblijfsobjecten within a gemeente.
 * Filters by gemeentecode from the official BAG attribute.
 */
export function bagVerblijfsobjectenUrl(
  gemeenteCode: string,
  options?: {
    status?: string[];
    gebruiksdoel?: string[];
    maxFeatures?: number;
  },
): string {
  const filters: string[] = [`gemeentecode = '${gemeenteCode}'`];

  if (options?.status?.length) {
    const statusFilter = options.status
      .map((s) => `status = '${s}'`)
      .join(" OR ");
    filters.push(`(${statusFilter})`);
  }

  if (options?.gebruiksdoel?.length) {
    const gdFilter = options.gebruiksdoel
      .map((g) => `gebruiksdoel = '${g}'`)
      .join(" OR ");
    filters.push(`(${gdFilter})`);
  }

  return buildWfsUrl({
    service: PDOK_ENDPOINTS.BAG_WFS,
    typeName: "bag:verblijfsobject",
    cqlFilter: filters.join(" AND "),
    count: options?.maxFeatures ?? 5000,
    propertyName: [
      "identificatie",
      "status",
      "gebruiksdoel",
      "oppervlakte",
      "bouwjaar",
      "gemeentecode",
      "woonplaatsnaam",
      "geometrie",
    ],
  });
}

/**
 * Fetch BAG panden (buildings) within a gemeente.
 */
export function bagPandenUrl(gemeenteCode: string, maxFeatures = 2000): string {
  return buildWfsUrl({
    service: PDOK_ENDPOINTS.BAG_WFS,
    typeName: "bag:pand",
    cqlFilter: `gemeentecode = '${gemeenteCode}'`,
    count: maxFeatures,
    propertyName: [
      "identificatie",
      "status",
      "bouwjaar",
      "gemeentecode",
      "geometrie",
    ],
  });
}

/**
 * MapLibre-compatible style source for PDOK BRT background tiles.
 */
export function brtTileSource() {
  return {
    type: "raster" as const,
    tiles: [PDOK_ENDPOINTS.BRT_TILES],
    tileSize: 256,
    attribution: "© PDOK / Kadaster",
    minzoom: 0,
    maxzoom: 19,
  };
}
