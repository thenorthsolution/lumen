import { NextResponse } from "next/server";
import { scoreViability } from "@lumen/bag-utils";
import { bagVerblijfsobjectenUrl } from "@lumen/pdok-client";
import { entityId, rankOpportunity, type Bounds, type OpportunityEntity, type OpportunityEvidence, type OpportunityKind, type OpportunityTier, type Position, type Provenance } from "@lumen/world";

type BagFeature = { type: "Feature"; id?: string | number; geometry?: { type: string; coordinates: unknown }; properties?: Record<string, unknown> };
const DEFAULT_BOUNDS: Bounds = [6.145, 52.247, 6.165, 52.263];
const ELIGIBLE_USES = ["kantoorfunctie", "winkelfunctie", "industriefunctie", "overige gebruiksfunctie"];

function parseBounds(value: string | null): Bounds | null {
  if (!value) return DEFAULT_BOUNDS;
  const values = value.split(",").map(Number);
  if (values.length !== 4 || values.some((entry) => !Number.isFinite(entry))) return null;
  const [west, south, east, north] = values as [number, number, number, number];
  if (west >= east || south >= north || east - west > .08 || north - south > .08 || west < 3 || east > 8 || south < 50 || north > 54) return null;
  return [west, south, east, north];
}

function coordinates(value: unknown, output: Position[] = []): Position[] {
  if (!Array.isArray(value)) return output;
  if (typeof value[0] === "number" && typeof value[1] === "number") output.push([value[0], value[1]]);
  else value.forEach((entry) => coordinates(entry, output));
  return output;
}

function primaryUse(value: unknown) {
  const raw = Array.isArray(value) ? value.map(String) : String(value ?? "").split(",");
  return raw.map((entry) => entry.trim().toLowerCase()).find((entry) => ELIGIBLE_USES.includes(entry)) ?? "";
}

function tier(value: "hoog" | "middel" | "laag" | "uitgesloten"): OpportunityTier {
  return ({ hoog: "high", middel: "medium", laag: "low", uitgesloten: "excluded" } as const)[value];
}

function spaceSignal(gebruiksdoel: string, oppervlakte: number): { kind: OpportunityKind; score: number; rationale: string } | null {
  if (oppervlakte >= 200 && oppervlakte <= 2000 && ["winkelfunctie", "overige gebruiksfunctie"].includes(gebruiksdoel)) return { kind: "infill", score: 62, rationale: "Kleinschalig niet-residentieel object met een omvang die nader onderzoek naar inbreiding rechtvaardigt." };
  if (oppervlakte > 2000 && ["industriefunctie", "kantoorfunctie"].includes(gebruiksdoel)) return { kind: "transformation", score: 72, rationale: "Groter niet-residentieel object met ruimte voor een mogelijke gebieds- of gebouwtransformatie." };
  if (["industriefunctie", "kantoorfunctie"].includes(gebruiksdoel)) return { kind: "redevelopment", score: 56, rationale: "Niet-residentieel gebruik vormt een eerste herontwikkelsignaal; planologische geschiktheid is niet vastgesteld." };
  return null;
}

function normalize(feature: BagFeature, retrievedAt: string): { feature: BagFeature; entity: OpportunityEntity } | null {
  if (!feature.geometry) return null;
  const props = feature.properties ?? {};
  const id = String(props.identificatie ?? feature.id ?? "");
  const gebruiksdoel = primaryUse(props.gebruiksdoel);
  const oppervlakte = Number(props.oppervlakte ?? 0);
  if (!id || !gebruiksdoel || !Number.isFinite(oppervlakte) || oppervlakte <= 0) return null;
  const points = coordinates(feature.geometry.coordinates);
  if (!points.length) return null;
  const xs = points.map(([x]) => x); const ys = points.map(([, y]) => y);
  const bounds: Bounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const center: Position = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
  const score = scoreViability({ identificatie: id, bouwjaar: Number(props.bouwjaar ?? 0), oppervlakte, gebruiksdoel, vboStatus: String(props.status ?? ""), pandStatus: String(props.pandstatus ?? "") });
  const bagProvenance: Provenance = { sourceId: "pdok-bag-vbo", sourceLabel: "BAG via PDOK", sourceUrl: "https://www.pdok.nl/introductie/-/article/basisregistratie-adressen-en-gebouwen-ba-1", retrievedAt, confidence: "medium", assumptions: ["BAG-status is een proxy en bevestigt geen feitelijke leegstand."], methodVersion: "bag-viability-1.0.0" };
  const evidence: OpportunityEvidence[] = [{ kind: "vacancy", label: "BAG-transformatiesignaal", score: score.maxPossiblePoints > 0 ? Math.max(0, Math.round(score.totalPoints / score.maxPossiblePoints * 100)) : 0, weight: .65, confidence: "medium", rationale: score.explanation, provenance: bagProvenance }];
  const spatial = spaceSignal(gebruiksdoel, oppervlakte);
  if (spatial) evidence.push({ kind: "space", label: "Ruimtelijke voorselectie", score: spatial.score, weight: .35, confidence: "low", rationale: spatial.rationale, provenance: { ...bagProvenance, sourceId: "lumen-space-heuristic", sourceLabel: "Lumen ruimtemethodiek op BAG", confidence: "low", assumptions: ["Geen perceel-, eigendom- of omgevingsplanintersectie uitgevoerd."], methodVersion: "space-prescreen-1.0.0" } });
  const ranking = rankOpportunity(evidence);
  const entity: OpportunityEntity = {
    id: entityId(`vacancy-${id}`), type: "opportunity", name: `Transformatiekans ${id.slice(-6)}`,
    description: score.explanation,
    geometry: { kind: feature.geometry.type.toLowerCase().includes("point") ? "point" : feature.geometry.type.toLowerCase().includes("multi") ? "multipolygon" : "polygon", center, bounds, coordinateSystem: "WGS84" },
    provenance: evidence.map((item) => item.provenance), evidence,
    properties: { kind: spatial?.kind ?? "vacancy-conversion", tier: ranking.evidenceCount > 1 ? ranking.tier : tier(score.tier), score: ranking.score, maximumScore: 100, methodology: ranking.methodVersion, candidate: score.tier !== "uitgesloten", estimatedHomes: spatial ? Math.max(1, Math.floor(oppervlakte / (spatial.kind === "infill" ? 60 : 80))) : null, identificatie: id, gebruiksdoel, oppervlakte, bouwjaar: Number(props.bouwjaar) || null, status: String(props.status ?? "Onbekend"), viabilityScore: score.totalPoints, evidenceCount: ranking.evidenceCount, pipelineEvidence: false },
  };
  return { feature: { ...feature, properties: { ...props, lumenEntityId: entity.id, opportunityTier: entity.properties.tier, opportunityCandidate: entity.properties.candidate } }, entity };
}

export async function GET(request: Request) {
  const bounds = parseBounds(new URL(request.url).searchParams.get("bbox"));
  if (!bounds) return NextResponse.json({ error: "Ongeldige of te grote viewport." }, { status: 400 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(bagVerblijfsobjectenUrl({ bbox: [...bounds], gebruiksdoel: ELIGIBLE_USES, maxFeatures: 120 }), { signal: controller.signal, headers: { Accept: "application/geo+json, application/json" }, next: { revalidate: 300 } });
    if (!response.ok) throw new Error(`PDOK antwoordde met ${response.status}`);
    const data = await response.json() as { features?: BagFeature[] };
    const retrievedAt = new Date().toISOString();
    const normalized = (data.features ?? []).map((feature) => normalize(feature, retrievedAt)).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    return NextResponse.json({ type: "FeatureCollection", features: normalized.map((entry) => entry.feature), entities: normalized.map((entry) => entry.entity), provenance: { source: "BAG via PDOK", retrievedAt, methodology: "bag-viability-1.0.0" }, truncated: normalized.length >= 120 }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400" } });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "PDOK reageerde niet binnen 8 seconden." : error instanceof Error ? error.message : "PDOK is niet bereikbaar.";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally { clearTimeout(timeout); }
}
