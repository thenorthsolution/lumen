import { NextResponse } from "next/server";
import type { Bounds, Position } from "@lumen/world";
import { NETHERLANDS_BOUNDS } from "@/lib/cesium/netherlands-policy";

type VegetationFeature = {
  id?: string;
  geometry?: { type?: string; coordinates?: unknown };
  properties?: { plus_type?: string; status?: string; termination_date?: string | null; bronhouder?: string };
};

const DEFAULT_BOUNDS: Bounds = [6.145, 52.247, 6.165, 52.263];
const MAX_SPAN = 0.04;
const MAX_TREES = 1_000;

function parseBounds(value: string | null): Bounds | null {
  if (!value) return DEFAULT_BOUNDS;
  const values = value.split(",").map(Number);
  if (values.length !== 4 || values.some((entry) => !Number.isFinite(entry))) return null;
  const [west, south, east, north] = values as [number, number, number, number];
  if (west >= east || south >= north || east - west > MAX_SPAN || north - south > MAX_SPAN) return null;
  if (west < NETHERLANDS_BOUNDS[0] || south < NETHERLANDS_BOUNDS[1] || east > NETHERLANDS_BOUNDS[2] || north > NETHERLANDS_BOUNDS[3]) return null;
  return [west, south, east, north];
}

function point(feature: VegetationFeature): { id: string; position: Position } | null {
  const coordinates = feature.geometry?.coordinates;
  const properties = feature.properties;
  if (feature.geometry?.type !== "Point" || !Array.isArray(coordinates)) return null;
  if (properties?.plus_type !== "boom" || properties.status !== "bestaand" || properties.termination_date) return null;
  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return { id: String(feature.id ?? `${longitude}-${latitude}`), position: [longitude, latitude] };
}

export async function GET(request: Request) {
  const bounds = parseBounds(new URL(request.url).searchParams.get("bbox"));
  if (!bounds) return NextResponse.json({ error: "Ongeldige of te grote Nederlandse viewport." }, { status: 400 });
  const params = new URLSearchParams({ bbox: bounds.join(","), limit: String(MAX_TREES), f: "json" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`https://api.pdok.nl/lv/bgt/ogc/v1/collections/vegetatieobject_punt/items?${params}`, {
      signal: controller.signal,
      headers: { Accept: "application/geo+json, application/json" },
      next: { revalidate: 86_400 },
    });
    if (!response.ok) throw new Error(`PDOK antwoordde met ${response.status}`);
    const collection = await response.json() as { features?: VegetationFeature[]; numberMatched?: number };
    const trees = (collection.features ?? []).map(point).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    return NextResponse.json({
      trees,
      truncated: trees.length >= MAX_TREES,
      provenance: { source: "BGT Vegetatieobject via PDOK", retrievedAt: new Date().toISOString(), methodVersion: "bgt-tree-points-1.0.0" },
    }, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "PDOK reageerde niet binnen 8 seconden." : error instanceof Error ? error.message : "PDOK is niet bereikbaar.";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
