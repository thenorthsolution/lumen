/**
 * @lumen/pdok-client
 *
 * Typed client for Dutch PDOK geodata APIs.
 * Free and open — no API key required.
 *
 * @example
 * ```ts
 * import { bagVerblijfsobjectenUrl, getDefaultGemeente } from "@lumen/pdok-client";
 *
 * const gemeente = getDefaultGemeente(); // Deventer
 * const url = bagVerblijfsobjectenUrl(gemeente.code, {
 *   status: ["Verbouwing"],
 *   gebruiksdoel: ["kantoorfunctie"],
 * });
 * const res = await fetch(url);
 * const geojson = await res.json();
 * ```
 */

export * from "./gemeente";
export * from "./pdok";
