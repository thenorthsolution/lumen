import { NextResponse } from "next/server";
import { getGemeente } from "@lumen/pdok-client";
import {
  fetchAndScoreGemeente,
  SHORTLIST_COUNT_FILTERS,
} from "@/lib/bag-fetch";
import type { FilterState } from "@/components/AppShell";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);
  const gemeenteCode = searchParams.get("gemeenteCode")?.trim();

  if (!gemeenteCode) {
    return NextResponse.json(
      { error: "Query parameter 'gemeenteCode' is verplicht." },
      { status: 400 },
    );
  }

  const gemeente = getGemeente(gemeenteCode);
  if (!gemeente) {
    return NextResponse.json(
      { error: `Onbekende gemeenteCode '${gemeenteCode}'.` },
      { status: 404 },
    );
  }

  const filters = parseFilters(searchParams);

  try {
    const featureCollection = await fetchAndScoreGemeente(gemeente, filters);
    return NextResponse.json({
      gemeenteCode,
      filters,
      featureCollection,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message =
      (error as Error).name === "AbortError"
        ? "Shortlist ophalen afgebroken."
        : (error as Error).message || "Shortlist kon niet worden geladen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseFilters(searchParams: URLSearchParams): FilterState {
  return {
    bouwjaarMin: clampNumber(searchParams.get("bouwjaarMin"), 0),
    oppervlakteMin: clampNumber(searchParams.get("oppervlakteMin"), 0),
    gebruiksdoelen:
      parseList(searchParams.get("gebruiksdoelen")) ??
      [...SHORTLIST_COUNT_FILTERS.gebruiksdoelen],
    vboStatuses:
      parseList(searchParams.get("vboStatuses")) ??
      [...SHORTLIST_COUNT_FILTERS.vboStatuses],
    pandStatuses:
      parseList(searchParams.get("pandStatuses")) ??
      [...SHORTLIST_COUNT_FILTERS.pandStatuses],
  };
}

function parseList(value: string | null): string[] | null {
  if (!value) return null;
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : [];
}

function clampNumber(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
