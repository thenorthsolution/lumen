/**
 * lib/tendernet.ts — Lumen Pipeline
 *
 * STUB: TenderNed API access is pending account approval.
 *
 * The TenderNed REST API requires an approved organisational account.
 * Our application is currently in submission. Until access is granted
 * this module returns representative mock data so the rest of the
 * pipeline (pipeline-data.ts, components) can be developed normally.
 *
 * When the account is approved:
 *  1. Store the API key in TENDERNET_API_KEY (env var, never committed).
 *  2. Replace `searchTenders` with the real implementation below the stub.
 *  3. Remove the TENDERNET_STUB flag.
 *
 * CPV codes for residential construction:
 *   45211000 — Multi/single-family residential construction works
 *   45211100 — House construction work
 *   45211200 — Timber house construction work
 *   45211300 — Flat construction work
 *   45211340 — Multi-occupancy building construction work
 *   45211350 — Multi-functional buildings construction work
 */

export const TENDERNET_STUB = true;

export const TENDERNET_BASE =
  "https://www.tenderned.nl/papi/tenderned-rs-tns/v2";

/** CPV codes for residential construction */
export const RESIDENTIAL_CPV_CODES = [
  "45211000",
  "45211100",
  "45211200",
  "45211300",
  "45211340",
  "45211350",
] as const;

export interface TenderPublication {
  id: string;
  title: string;
  publicationDate: string;
  contractingAuthority: string;
  /** Estimated contract value in euros */
  estimatedValue: number | null;
  cpvCodes: string[];
  /** NUTS-3 region code (e.g. NL213 = Veluwe) */
  nutsCode: string;
  status: "active" | "awarded" | "cancelled";
  province: string;
}

export interface TenderSearchParams {
  cpvCodes?: string[] | undefined;
  nutsCode?: string | undefined;
  dateFrom?: string | undefined; // Add | undefined here
  dateTo?: string | undefined; // Add | undefined here
  page?: number | undefined;
  pageSize?: number | undefined;
}
/**
 * NUTS-3 to province mapping for Dutch regions.
 * Source: CBS NUTS-indeling 2024
 */
export const NUTS_TO_PROVINCE: Record<string, string> = {
  NL111: "Groningen",
  NL112: "Groningen",
  NL113: "Groningen",
  NL121: "Friesland",
  NL122: "Friesland",
  NL123: "Friesland",
  NL131: "Drenthe",
  NL132: "Drenthe",
  NL133: "Drenthe",
  NL211: "Overijssel",
  NL212: "Overijssel",
  NL213: "Overijssel",
  NL221: "Gelderland",
  NL224: "Gelderland",
  NL225: "Gelderland",
  NL226: "Gelderland",
  NL230: "Flevoland",
  NL310: "Utrecht",
  NL321: "Noord-Holland",
  NL322: "Noord-Holland",
  NL323: "Noord-Holland",
  NL324: "Noord-Holland",
  NL331: "Zuid-Holland",
  NL332: "Zuid-Holland",
  NL333: "Zuid-Holland",
  NL337: "Zuid-Holland",
  NL33A: "Zuid-Holland",
  NL341: "Zeeland",
  NL342: "Zeeland",
  NL343: "Zeeland",
  NL411: "Noord-Brabant",
  NL412: "Noord-Brabant",
  NL413: "Noord-Brabant",
  NL414: "Noord-Brabant",
  NL421: "Limburg",
  NL422: "Limburg",
};

/**
 * Search TenderNed publications.
 *
 * STUB: always returns mock data until API account is approved.
 * `isMockData` is set to `true` on all returned PipelineData so the
 * UI can surface a clear "voorbeelddata" notice to users.
 */
export async function searchTenders(
  params: TenderSearchParams,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _signal?: AbortSignal,
): Promise<TenderPublication[]> {
  console.info("[tendernet] Account pending — returning mock data");
  return generateMockTenders(params);
}

/**
 * Mock data generator — produces realistic-looking tender publications.
 * Clearly surfaced as mock in the UI via `PipelineData.isMockData`.
 *
 * Replace this entire module with a real API call once the account
 * is approved. The shape of TenderPublication must remain stable.
 */
export function generateMockTenders(
  params: TenderSearchParams,
): TenderPublication[] {
  const authorities = [
    "Gemeente Deventer",
    "Gemeente Zwolle",
    "Woonstede",
    "Deltaforte",
    "Rijksvastgoedbedrijf",
    "Alwel",
    "Talis",
    "Portaal",
  ];
  const titles = [
    "Nieuwbouw 48 woningen fase 2 — Colmschate",
    "Renovatie en verduurzaming 120 huurwoningen",
    "Transformatie kantoorpand naar 35 appartementen",
    "Bouw 72 sociale huurwoningen — Sluiskwartier",
    "Prefab woningbouw 55 units — Rivierenwijk",
    "Nieuwbouw woonzorgcomplex 80 eenheden",
  ];

  const nutsKeys = Object.keys(NUTS_TO_PROVINCE);
  const now = new Date();

  return Array.from({ length: params.pageSize ?? 24 }, (_, i) => {
    const date = new Date(now);
    date.setDate(date.getDate() - i * 14);
    const nutsCode = nutsKeys[i % nutsKeys.length] ?? "NL211";
    return {
      id: `mock-${i}`,
      title: titles[i % titles.length] ?? "Woningbouwproject",
      publicationDate: date.toISOString().split("T")[0] ?? "",
      contractingAuthority: authorities[i % authorities.length] ?? "Gemeente",
      estimatedValue: (800_000 + i * 350_000) * (1 + (i % 3) * 0.4),
      cpvCodes: [
        RESIDENTIAL_CPV_CODES[i % RESIDENTIAL_CPV_CODES.length] ?? "45211000",
      ],
      nutsCode,
      status: i % 7 === 0 ? "awarded" : "active",
      province: NUTS_TO_PROVINCE[nutsCode] ?? "Overijssel",
    };
  });
}
