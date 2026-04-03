/**
 * TenderNed REST API client
 * Endpoint: https://www.tenderned.nl/papi/tenderned-rs-tns/v2
 * Open data — no API key required for public publications.
 *
 * CPV codes used:
 *   45211000 — Bouw van woningen en woongebouwen
 *   45211100 — Bouw van huizen
 *   45211200 — Bouw van houten woningen
 *   45211300 — Bouw van flatgebouwen
 */

import type { TenderPublication, DateRange } from "./types";

export const RESIDENTIAL_CPV = [
  "45211000",
  "45211100",
  "45211200",
  "45211300",
] as const;

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

const GEMEENTEN_BY_NUTS: Record<string, string[]> = {
  NL213: ["Deventer", "Zwolle", "Apeldoorn"],
  NL221: ["Nijmegen", "Arnhem", "Doetinchem"],
  NL321: ["Amsterdam", "Haarlem", "Alkmaar"],
  NL331: ["Rotterdam", "Dordrecht", "Delft"],
  NL332: ["Den Haag", "Leiden", "Zoetermeer"],
  NL310: ["Utrecht", "Amersfoort", "Nieuwegein"],
};

function nutsToGemeente(nutsCode: string): string {
  const list = GEMEENTEN_BY_NUTS[nutsCode];
  if (list && list.length > 0)
    return list[Math.floor(Math.random() * list.length)]!;
  const prov = NUTS_TO_PROVINCE[nutsCode] ?? "Onbekend";
  return prov;
}

function dateFromMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().split("T")[0]!;
}

function rangeMonths(range: DateRange): number {
  return range === "6m" ? 6 : range === "24m" ? 24 : 12;
}

// ─── Live TenderNed fetch ────────────────────────────────────────────────

async function fetchTenderNed(
  dateFrom: string,
  dateTo: string,
  signal?: AbortSignal,
): Promise<TenderPublication[] | null> {
  try {
    const BASE =
      "https://www.tenderned.nl/papi/tenderned-rs-tns/v2/publicaties";
    const params = new URLSearchParams({
      cpvCodes: RESIDENTIAL_CPV.join(","),
      publicatieDatumVanaf: dateFrom,
      publicatieDatumTm: dateTo,
      size: "200",
      page: "0",
      sort: "publicatieDatum,desc",
    });

    const fetchOptions: any = {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    };

    if (signal) {
      fetchOptions.signal = signal;
    }

    const res = await fetch(`${BASE}?${params}`, fetchOptions);

    if (!res.ok) return null;
    const json = (await res.json()) as { content?: unknown[] };
    const items = json.content ?? [];

    return items.map((item: unknown) => {
      const it = item as Record<string, unknown>;
      const nutsCode = String(
        (it["nuts3Code"] ?? it["nutsCode"] ?? "NL213") as string,
      );
      return {
        id: String(it["id"] ?? it["publicatieId"] ?? ""),
        title: String(it["titel"] ?? it["title"] ?? "Woningbouwproject"),
        publicationDate: String(it["publicatieDatum"] ?? dateFrom),
        contractingAuthority: String(
          it["aanbestedendeOrganisatieNaam"] ?? "Onbekend",
        ),
        estimatedValue:
          Number(it["geraamdeWaarde"] ?? it["estimatedValue"] ?? 0) || null,
        cpvCodes: [String(it["cpvCode"] ?? RESIDENTIAL_CPV[0])],
        nutsCode,
        province: NUTS_TO_PROVINCE[nutsCode] ?? "Overijssel",
        gemeente: nutsToGemeente(nutsCode),
        status: "active" as const,
        isMock: false,
      } satisfies TenderPublication;
    });
  } catch {
    return null;
  }
}

// ─── Mock data generator ─────────────────────────────────────────────────

const AUTHORITIES = [
  "Gemeente Deventer",
  "Gemeente Zwolle",
  "Woonstede",
  "Deltaforte",
  "Rijksvastgoedbedrijf",
  "Alwel",
  "Talis",
  "Portaal",
  "Gemeente Utrecht",
  "Gemeente Amsterdam",
  "Woonstad Rotterdam",
  "Ymere",
  "Vidomes",
  "Havensteder",
  "Gemeente Breda",
  "Corporatie Nijmegen",
  "Gemeente Arnhem",
  "Wonen Limburg",
];

const TITLES = [
  "Nieuwbouw 48 woningen fase 2 — Colmschate",
  "Renovatie en verduurzaming 120 huurwoningen",
  "Transformatie kantoorpand naar 35 appartementen",
  "Bouw 72 sociale huurwoningen — Sluiskwartier",
  "Prefab woningbouw 55 units — Rivierenwijk",
  "Nieuwbouw woonzorgcomplex 80 eenheden",
  "Sloop en vervangende nieuwbouw 96 woningen",
  "CPO Nieuwbouw 24 grondgebonden woningen",
  "Flexwoningen 60 units — Spoorzonegebied",
  "Transformatie schoolgebouw 28 appartementen",
  "Nieuwbouw seniorenwoningen 44 units",
  "Stedelijke vernieuwing blok 7 — 110 woningen",
];

const NUTS_WEIGHTS: [string, number][] = [
  ["NL321", 16],
  ["NL331", 14],
  ["NL332", 12],
  ["NL310", 10],
  ["NL221", 8],
  ["NL213", 7],
  ["NL411", 7],
  ["NL412", 6],
  ["NL322", 5],
  ["NL333", 5],
  ["NL230", 4],
  ["NL421", 4],
  ["NL211", 3],
  ["NL131", 2],
  ["NL121", 2],
  ["NL111", 2],
  ["NL341", 1],
];

function weightedNuts(): string {
  const total = NUTS_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [nuts, w] of NUTS_WEIGHTS) {
    r -= w;
    if (r <= 0) return nuts;
  }
  return "NL213";
}

export function generateMockTenders(months: number): TenderPublication[] {
  const count = Math.round(months * 9 + Math.random() * 20);
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(now);
    date.setDate(date.getDate() - Math.floor(Math.random() * months * 30));
    const nutsCode = weightedNuts();
    return {
      id: `mock-${i}`,
      title: TITLES[i % TITLES.length]!,
      publicationDate: date.toISOString().split("T")[0]!,
      contractingAuthority: AUTHORITIES[i % AUTHORITIES.length]!,
      estimatedValue: (600_000 + i * 280_000) * (1 + (i % 4) * 0.35),
      cpvCodes: [RESIDENTIAL_CPV[i % 4]!],
      nutsCode,
      province: NUTS_TO_PROVINCE[nutsCode] ?? "Overijssel",
      gemeente: nutsToGemeente(nutsCode),
      status: i % 8 === 0 ? "awarded" : "active",
      isMock: true,
    };
  });
}

// ─── Public API ──────────────────────────────────────────────────────────

export async function fetchTenders(
  range: DateRange,
  signal?: AbortSignal,
): Promise<{ tenders: TenderPublication[]; isMock: boolean }> {
  const months = rangeMonths(range);
  const dateFrom = dateFromMonthsAgo(months);
  const dateTo = new Date().toISOString().split("T")[0]!;

  const live = await fetchTenderNed(dateFrom, dateTo, signal);
  if (live && live.length > 0) {
    return { tenders: live, isMock: false };
  }

  console.info("[tenderned] Using mock data (live API unavailable or empty)");
  return { tenders: generateMockTenders(months), isMock: true };
}
