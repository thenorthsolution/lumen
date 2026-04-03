import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_URL =
  "https://api.pdok.nl/kadaster/bestuurlijkegebieden/ogc/v1/collections/gemeentegebied/items?f=json&limit=500";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../src");
const outJson = path.join(outDir, "gemeenten.generated.json");

async function fetchAllGemeenten() {
  const features = [];
  let nextUrl = API_URL;

  while (nextUrl) {
    const res = await fetch(nextUrl);
    if (!res.ok) {
      throw new Error(`Gemeenten fetch failed: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    features.push(...(data.features ?? []));
    nextUrl =
      data.links?.find((link) => link?.rel === "next" && link?.href)?.href ??
      null;
  }

  return features;
}

function walkCoords(coords, visit) {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    visit(coords[0], coords[1]);
    return;
  }
  for (const child of coords) {
    walkCoords(child, visit);
  }
}

function computeBBox(geometry) {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  walkCoords(geometry?.coordinates, (lng, lat) => {
    west = Math.min(west, lng);
    south = Math.min(south, lat);
    east = Math.max(east, lng);
    north = Math.max(north, lat);
  });

  if (!Number.isFinite(west)) {
    throw new Error("Failed to compute bbox for gemeente geometry");
  }

  return [west, south, east, north];
}

function estimateZoom([west, south, east, north]) {
  const span = Math.max(east - west, north - south);
  if (span > 0.7) return 10;
  if (span > 0.35) return 11;
  if (span > 0.18) return 12;
  if (span > 0.09) return 13;
  return 14;
}

function formatGemeenten(features) {
  const entries = features
    .map((feature) => {
      const props = feature.properties ?? {};
      const code = String(props.code ?? "").padStart(4, "0");
      if (!code) return null;
      const bbox = computeBBox(feature.geometry);
      return [
        code,
        {
          code,
          name: String(props.naam ?? ""),
          province: String(props.ligt_in_provincie_naam ?? ""),
          bbox,
          centroid: [
            Number(((bbox[0] + bbox[2]) / 2).toFixed(6)),
            Number(((bbox[1] + bbox[3]) / 2).toFixed(6)),
          ],
          zoom: estimateZoom(bbox),
        },
      ];
    })
    .filter(Boolean)
    .sort((a, b) => a[0].localeCompare(b[0]));

  return Object.fromEntries(entries);
}

async function main() {
  const features = await fetchAllGemeenten();
  const gemeenten = formatGemeenten(features);
  await mkdir(outDir, { recursive: true });
  await writeFile(outJson, `${JSON.stringify(gemeenten, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(gemeenten).length} gemeenten to ${outJson}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
