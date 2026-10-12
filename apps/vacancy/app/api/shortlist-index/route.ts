import { NextResponse } from "next/server";
import {
  fetchViewportShortlistIndex,
  SHORTLIST_COUNT_FILTERS,
} from "@/lib/bag-fetch";
import type { FilterState } from "@/components/AppShell";
import type { Gemeente } from "@lumen/pdok-client";

const VIEWPORT_INDEX_TIMEOUT_MS = 1800;

export async function GET(request: Request) {
  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);
  const bbox = parseBbox(searchParams.get("bbox"));

  if (!bbox) {
    return NextResponse.json(
      { error: "Query parameter 'bbox' is verplicht." },
      { status: 400 },
    );
  }

  const filters = parseFilters(searchParams);
  const limit = clampNumber(searchParams.get("limit"), 450);

  try {
    const featureCollection = await fetchViewportShortlistIndex(
      bbox,
      filters,
      AbortSignal.timeout(VIEWPORT_INDEX_TIMEOUT_MS),
      limit,
    );

    return NextResponse.json({
      filters,
      featureCollection,
      limited: featureCollection.features.length >= limit,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message =
      (error as Error).name === "AbortError"
        ? "Viewport-index ophalen afgebroken."
        : (error as Error).message || "Viewport-index kon niet worden geladen.";
    return NextResponse.json({
      filters,
      featureCollection: { type: "FeatureCollection", features: [] },
      limited: false,
      accessIssues: [message],
      durationMs: Date.now() - startedAt,
    });
  }
}

function parseBbox(value: string | null): Gemeente["bbox"] | null {
  if (!value) return null;
  const parsed = value.split(",").map((part) => Number(part.trim()));
  if (parsed.length !== 4 || parsed.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const bbox = parsed as Gemeente["bbox"];
  const [west, south, east, north] = bbox;
  if (west >= east || south >= north) return null;
  return bbox;
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
