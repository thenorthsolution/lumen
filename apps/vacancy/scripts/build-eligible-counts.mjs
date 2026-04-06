import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BAG_WFS_BASE = "https://service.pdok.nl/lv/bag/wfs/v2_0";
const PAGE_LIMIT = 1000;
const CONCURRENCY = 8;
const BOUWJAAR_MIN = 0;
const OPPERVLAKTE_MIN = 0;
const RD_BBOX_PADDING_METERS = 250;
const GEBRUIKSDOELEN = new Set([
  "kantoorfunctie",
  "winkelfunctie",
  "bijeenkomstfunctie",
  "onderwijsfunctie",
  "industriefunctie",
]);
const VBO_STATUSES = new Set([
  "Verblijfsobject gevormd",
  "Verblijfsobject buiten gebruik",
  "Verbouwing verblijfsobject",
  "Verblijfsobject ingetrokken",
  "Niet gerealiseerd verblijfsobject",
]);
const PAND_STATUSES = new Set([
  "Bouwvergunning verleend",
  "Bouw gestart",
  "Sloopvergunning verleend",
  "Pand gesloopt",
  "Pand buiten gebruik",
  "Verbouwing pand",
]);
const PROPERTY_NAMES = [
  "identificatie",
  "gebruiksdoel",
  "oppervlakte",
  "status",
  "bouwjaar",
  "pandstatus",
  "geom",
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../..");
const gemeentenJson = path.join(
  root,
  "packages/pdok-client/src/gemeenten.generated.json",
);
const outDir = path.resolve(__dirname, "../data");
const outJson = path.join(outDir, "eligible-counts.generated.json");

async function loadGemeenten() {
  return JSON.parse(await readFile(gemeentenJson, "utf8"));
}

function isEligible(feature) {
  const props = feature?.properties ?? {};
  const gebruiksdoel = String(
    props.gebruiksdoel ?? props.gebruiksdoelverblijfsobject ?? "",
  ).toLowerCase();
  const vboStatus = String(props.status ?? "");
  const pandStatus = String(props.pandstatus ?? props.pandStatus ?? "");
  const bouwjaar = Number(props.bouwjaar ?? props.BOUWJAAR ?? 0);
  const oppervlakte = Number(
    props.oppervlakte ?? props.oppervlakteverblijfsobject ?? 0,
  );

  return (
    splitGebruiksdoelen(gebruiksdoel).some((value) => GEBRUIKSDOELEN.has(value)) &&
    VBO_STATUSES.has(vboStatus) &&
    PAND_STATUSES.has(pandStatus) &&
    bouwjaar >= BOUWJAAR_MIN &&
    oppervlakte >= OPPERVLAKTE_MIN
  );
}

async function countEligibleForGemeente(gemeente) {
  let startIndex = 0;
  let totalFetched = 0;
  let eligibleCount = 0;
  let pages = 0;
  const seen = new Set();

  while (true) {
    const url = buildWfsUrl(gemeente, startIndex);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Eligible count fetch failed for ${gemeente.code}: ${res.status} ${res.statusText}`,
      );
    }
    const data = await res.json();
    const rawFeatures = data.features ?? [];
    if (rawFeatures.length === 0) {
      break;
    }
    const features = rawFeatures.filter((feature) => {
      const identificatie = String(feature?.properties?.identificatie ?? "");
      if (!identificatie) return true;
      if (seen.has(identificatie)) return false;
      seen.add(identificatie);
      return true;
    });
    totalFetched += features.length;
    eligibleCount += features.filter(isEligible).length;
    pages += 1;
    if (features.length === 0) {
      break;
    }
    startIndex += rawFeatures.length;
  }

  return {
    eligibleCount,
    totalFetched,
    pages,
  };
}

async function main() {
  const gemeenten = Object.values(await loadGemeenten());
  const counts = {};
  const pending = gemeenten;
  const failures = [];

  let index = 0;

  async function worker() {
    while (index < pending.length) {
      const gemeente = pending[index];
      index += 1;
      if (!gemeente) return;

      try {
        const result = await countEligibleForGemeente(gemeente);
        counts[gemeente.code] = result;
        console.log(
          `${gemeente.code} ${gemeente.name}: ${result.eligibleCount} eligible`,
        );
        await persistCounts(counts);
      } catch (error) {
        failures.push({
          code: gemeente.code,
          name: gemeente.name,
          message: (error && error.message) || String(error),
        });
        console.error(
          `Skipping ${gemeente.code} ${gemeente.name}: ${
            (error && error.message) || String(error)
          }`,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () => worker()),
  );

  await persistCounts(counts);
  if (failures.length > 0) {
    console.warn(`Skipped ${failures.length} gemeenten during rebuild.`);
  }
  console.log(`Wrote eligible counts to ${outJson}`);
}

async function loadExistingCounts() {
  try {
    return JSON.parse(await readFile(outJson, "utf8"));
  } catch {
    return { counts: {} };
  }
}

async function persistCounts(counts) {
  await mkdir(outDir, { recursive: true });
  await writeFile(
    outJson,
    `${JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        filters: {
          bouwjaarMin: BOUWJAAR_MIN,
          oppervlakteMin: OPPERVLAKTE_MIN,
          gebruiksdoelen: Array.from(GEBRUIKSDOELEN),
          vboStatuses: Array.from(VBO_STATUSES),
          pandStatuses: Array.from(PAND_STATUSES),
        },
        counts,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

function splitGebruiksdoelen(gebruiksdoel) {
  return gebruiksdoel
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function buildWfsUrl(gemeente, startIndex) {
  const url = new URL(BAG_WFS_BASE);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeName", "bag:verblijfsobject");
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("srsName", "EPSG:4326");
  url.searchParams.set("count", String(PAGE_LIMIT));
  url.searchParams.set("startIndex", String(startIndex));
  url.searchParams.set("bbox", wgs84BboxToRd(gemeente.bbox).join(","));
  url.searchParams.set("propertyName", PROPERTY_NAMES.join(","));
  return url.toString();
}

function wgs84BboxToRd([west, south, east, north]) {
  const corners = [
    wgs84ToRd(south, west),
    wgs84ToRd(south, east),
    wgs84ToRd(north, west),
    wgs84ToRd(north, east),
  ];
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);

  return [
    Math.min(...xs) - RD_BBOX_PADDING_METERS,
    Math.min(...ys) - RD_BBOX_PADDING_METERS,
    Math.max(...xs) + RD_BBOX_PADDING_METERS,
    Math.max(...ys) + RD_BBOX_PADDING_METERS,
  ];
}

function wgs84ToRd(lat, lon) {
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
