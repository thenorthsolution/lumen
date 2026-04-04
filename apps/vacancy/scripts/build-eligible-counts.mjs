import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BAG_OGC_BASE = "https://api.pdok.nl/kadaster/bag/ogc/v2";
const PAGE_LIMIT = 1000;
const CONCURRENCY = 8;
const BOUWJAAR_MIN = 0;
const OPPERVLAKTE_MIN = 0;
const GEBRUIKSDOELEN = new Set([
  "kantoorfunctie",
  "winkelfunctie",
  "bijeenkomstfunctie",
  "onderwijsfunctie",
  "industriefunctie",
]);

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
  const bouwjaar = Number(props.bouwjaar ?? props.BOUWJAAR ?? 0);
  const oppervlakte = Number(
    props.oppervlakte ?? props.oppervlakteverblijfsobject ?? 0,
  );

  return (
    GEBRUIKSDOELEN.has(gebruiksdoel) &&
    bouwjaar >= BOUWJAAR_MIN &&
    oppervlakte >= OPPERVLAKTE_MIN
  );
}

async function countEligibleForGemeente(gemeente) {
  let nextUrl = new URL(`${BAG_OGC_BASE}/collections/verblijfsobject/items`);
  nextUrl.searchParams.set("f", "json");
  nextUrl.searchParams.set("limit", String(PAGE_LIMIT));
  nextUrl.searchParams.set("bbox", gemeente.bbox.join(","));

  let pages = 0;
  let totalFetched = 0;
  let eligibleCount = 0;

  while (nextUrl) {
    const res = await fetch(nextUrl.toString());
    if (!res.ok) {
      throw new Error(
        `Eligible count fetch failed for ${gemeente.code}: ${res.status} ${res.statusText}`,
      );
    }
    const data = await res.json();
    const features = data.features ?? [];
    totalFetched += features.length;
    eligibleCount += features.filter(isEligible).length;
    pages += 1;
    const href = data.links?.find((link) => link?.rel === "next")?.href;
    nextUrl = href ? new URL(href) : null;
  }

  return {
    eligibleCount,
    totalFetched,
    pages,
  };
}

async function main() {
  const gemeenten = Object.values(await loadGemeenten());
  const existing = await loadExistingCounts();
  const counts = { ...existing.counts };
  const pending = gemeenten.filter((gemeente) => !counts[gemeente.code]);

  let index = 0;

  async function worker() {
    while (index < pending.length) {
      const gemeente = pending[index];
      index += 1;
      if (!gemeente) return;

      const result = await countEligibleForGemeente(gemeente);
      counts[gemeente.code] = result;
      console.log(
        `${gemeente.code} ${gemeente.name}: ${result.eligibleCount} eligible`,
      );
      await persistCounts(counts);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () => worker()),
  );

  await persistCounts(counts);
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
