/**
 * @lumen/bag-utils — BAG status codes
 *
 * Official verblijfsobject and pand status values from the
 * Basisregistratie Adressen en Gebouwen (BAG) specification.
 *
 * Source: Catalogus BAG 2.0 — https://www.geobasisregistraties.nl/basisregistraties/adressen-en-gebouwen
 */

export const BAG_VBO_STATUS = {
  GEVORMD: "Verblijfsobject gevormd",
  IN_GEBRUIK: "Verblijfsobject in gebruik",
  IN_GEBRUIK_NIET_INGEMETEN: "Verblijfsobject in gebruik (niet ingemeten)",
  BUITEN_GEBRUIK: "Verblijfsobject buiten gebruik",
  VERBOUWING: "Verbouwing verblijfsobject",
  INGETROKKEN: "Verblijfsobject ingetrokken",
  NIET_GEREALISEERD: "Niet gerealiseerd verblijfsobject",
} as const;

export type BagVboStatus = (typeof BAG_VBO_STATUS)[keyof typeof BAG_VBO_STATUS];

export const BAG_PAND_STATUS = {
  BOUWVERGUNNING: "Bouwvergunning verleend",
  BOUW_GESTART: "Bouw gestart",
  IN_GEBRUIK: "Pand in gebruik",
  IN_GEBRUIK_NIET_INGEMETEN: "Pand in gebruik (niet ingemeten)",
  SLOOPVERGUNNING: "Sloopvergunning verleend",
  GESLOOPT: "Pand gesloopt",
  BUITEN_GEBRUIK: "Pand buiten gebruik",
  VERBOUWING: "Verbouwing pand",
} as const;

export type BagPandStatus =
  (typeof BAG_PAND_STATUS)[keyof typeof BAG_PAND_STATUS];

export const ALL_VBO_STATUSES: BagVboStatus[] = Object.values(BAG_VBO_STATUS);
export const ALL_PAND_STATUSES: BagPandStatus[] = Object.values(BAG_PAND_STATUS);

/**
 * Status values that indicate potential vacancy or underuse.
 * Used as the primary filter in leegstandsradar.
 */
export const VACANCY_INDICATOR_STATUSES: BagVboStatus[] = [
  BAG_VBO_STATUS.VERBOUWING,
  BAG_VBO_STATUS.BUITEN_GEBRUIK,
];

export const BAG_GEBRUIKSDOEL = {
  WOONFUNCTIE: "woonfunctie",
  BIJEENKOMSTFUNCTIE: "bijeenkomstfunctie",
  CELFUNCTIE: "celfunctie",
  GEZONDHEIDSZORGFUNCTIE: "gezondheidszorgfunctie",
  INDUSTRIEFUNCTIE: "industriefunctie",
  KANTOORFUNCTIE: "kantoorfunctie",
  LOGIESFUNCTIE: "logiesfunctie",
  ONDERWIJSFUNCTIE: "onderwijsfunctie",
  SPORTFUNCTIE: "sportfunctie",
  WINKELFUNCTIE: "winkelfunctie",
  OVERIGE_GEBRUIKSFUNCTIE: "overige gebruiksfunctie",
} as const;

export type BagGebruiksdoel =
  (typeof BAG_GEBRUIKSDOEL)[keyof typeof BAG_GEBRUIKSDOEL];

/**
 * Gebruiksdoelen eligible for housing conversion assessment.
 * Excludes woonfunctie (already residential) and celfunctie (specialist conversion).
 */
export const CONVERSION_ELIGIBLE_DOELEN: BagGebruiksdoel[] = [
  BAG_GEBRUIKSDOEL.KANTOORFUNCTIE,
  BAG_GEBRUIKSDOEL.WINKELFUNCTIE,
  BAG_GEBRUIKSDOEL.BIJEENKOMSTFUNCTIE,
  BAG_GEBRUIKSDOEL.ONDERWIJSFUNCTIE,
  BAG_GEBRUIKSDOEL.INDUSTRIEFUNCTIE,
];
