import { NextResponse } from "next/server";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { Gemeente } from "@lumen/pdok-client";

const CBS_WFS_URL =
  "https://service.pdok.nl/cbs/gebiedsindelingen/2024/wfs/v1_0";
const CBS_BUURT_TYPENAME = "gebiedsindelingen:buurt_gegeneraliseerd";
const NEIGHBORHOOD_TIMEOUT_MS = 1800;
const MAX_NEIGHBORHOODS = 220;

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

  const limit = Math.min(
    Math.max(clampNumber(searchParams.get("limit"), 140), 1),
    MAX_NEIGHBORHOODS,
  );

  try {
    const featureCollection = await fetchNeighborhoods(
      bbox,
      limit,
      AbortSignal.timeout(NEIGHBORHOOD_TIMEOUT_MS),
    );

    return NextResponse.json({
      featureCollection,
      limited: featureCollection.features.length >= limit,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message =
      (error as Error).name === "AbortError"
        ? "Buurtlagen ophalen afgebroken."
        : (error as Error).message || "Buurtlagen konden niet worden geladen.";
    return NextResponse.json({
      featureCollection: { type: "FeatureCollection", features: [] },
      limited: false,
      accessIssues: [message],
      durationMs: Date.now() - startedAt,
    });
  }
}

async function fetchNeighborhoods(
  bbox: Gemeente["bbox"],
  limit: number,
  signal: AbortSignal,
): Promise<FeatureCollection<Geometry, GeoJsonProperties>> {
  const rdBbox = wgs84BboxToRd(bbox);
  const url = new URL(CBS_WFS_URL);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeNames", CBS_BUURT_TYPENAME);
  url.searchParams.set("outputFormat", "json");
  url.searchParams.set("srsName", "EPSG:4326");
  url.searchParams.set("bbox", `${rdBbox.join(",")},EPSG:28992`);
  url.searchParams.set("count", String(limit));

  let response: Response;
  try {
    response = await fetch(url.toString(), { signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new Error(`Netwerk fout bij ophalen CBS buurten: ${(err as Error).message}`);
  }

  if (!response.ok) {
    throw new Error(
      `CBS buurten WFS fout: ${response.status} ${response.statusText}`,
    );
  }

  const raw = (await response.json()) as FeatureCollection<
    Geometry,
    GeoJsonProperties
  >;

  return {
    type: "FeatureCollection",
    features: (raw.features ?? []).map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        buurtCode: String(feature.properties?.["statcode"] ?? ""),
        buurtNaam: String(feature.properties?.["statnaam"] ?? "Onbekende buurt"),
      },
    })),
  };
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

function clampNumber(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function wgs84BboxToRd([west, south, east, north]: Gemeente["bbox"]): [
  number,
  number,
  number,
  number,
] {
  const corners = [
    wgs84ToRd(south, west),
    wgs84ToRd(south, east),
    wgs84ToRd(north, west),
    wgs84ToRd(north, east),
  ];
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);

  return [
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys),
  ];
}

function wgs84ToRd(lat: number, lon: number): [number, number] {
  const dLat = 0.36 * (lat - 52.1551744);
  const dLon = 0.36 * (lon - 5.38720621);

  const x =
    155000 +
    190094.945 * dLon +
    -11832.228 * dLat * dLon +
    -114.221 * dLat * dLon ** 2 +
    -32.391 * dLon ** 3 +
    -0.705 * dLat +
    -2.34 * dLat ** 3 * dLon +
    -0.608 * dLat * dLon ** 3 +
    -0.008 * dLat ** 2 * dLon ** 2;
  const y =
    463000 +
    309056.544 * dLat +
    3638.893 * dLon ** 2 +
    73.077 * dLat ** 2 +
    -157.984 * dLat * dLon ** 2 +
    59.788 * dLat ** 3 +
    0.433 * dLon ** 4 +
    -6.439 * dLat ** 2 * dLon ** 2 +
    -0.032 * dLat ** 4 +
    0.092 * dLon ** 2 * dLat ** 3 +
    -0.054 * dLat * dLon ** 4;

  return [Math.round(x), Math.round(y)];
}
