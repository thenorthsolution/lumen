import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BAG_OGC_BASE = "https://api.pdok.nl/kadaster/bag/ogc/v2";
const PAGE_LIMIT = 1000;
const BOUWJAAR_MIN = 1975;
const OPPERVLAKTE_MIN = 300;
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
  const counts = {};

  for (const gemeente of gemeenten) {
    const result = await countEligibleForGemeente(gemeente);
    counts[gemeente.code] = result;
    console.log(
      `${gemeente.code} ${gemeente.name}: ${result.eligibleCount} eligible`,
    );
  }

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
  console.log(`Wrote eligible counts to ${outJson}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
