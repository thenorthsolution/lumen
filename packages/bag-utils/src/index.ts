/**
 * @lumen/bag-utils
 *
 * BAG status codes, viability scoring model, and data utilities.
 *
 * The viability scoring model is the intellectual core of leegstandsradar.
 * It is exported as a standalone module so it can be used, critiqued,
 * and improved independently of the UI.
 *
 * @example
 * ```ts
 * import { scoreViability } from "@lumen/bag-utils";
 *
 * const result = scoreViability({
 *   identificatie: "0150100000123456",
 *   bouwjaar: 1998,
 *   oppervlakte: 1240,
 *   gebruiksdoel: "kantoorfunctie",
 *   wozWaarde: 1_103_600,
 *   gemeenteMediaanWozPerM2: 1240,
 * });
 *
 * console.log(result.tier); // "hoog"
 * console.log(result.totalPoints); // 5
 * ```
 */

export * from "./status-codes";
export * from "./viability";
