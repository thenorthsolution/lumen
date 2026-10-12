import type { AccessibilityProfile, AccessibilityTheme, DrawingFeature, DrawingMeasurement, KnownSuitabilityInputs, NearbyAmenity, SpatialMetric, SuitabilityAssessment, SuitabilityBlocker, SuitabilityDimension, SuitabilityDimensionResult } from "./data";
import type { Position, Provenance, WorldEntity } from "./index";

export function assessSuitability(input: { subjectId?: SuitabilityAssessment["subjectId"]; dimensions: readonly SuitabilityDimensionResult[]; blockers?: readonly SuitabilityBlocker[]; assessedAt: string; methodVersion: string }): SuitabilityAssessment {
  const blockers = input.blockers ?? [];
  const conclusion = blockers.some((item) => item.severity === "hard") ? "blocked"
    : input.dimensions.some((item) => item.status === "needs-research") ? "needs-research"
    : blockers.length || input.dimensions.some((item) => item.status === "attention") ? "conditional" : "promising";
  return { ...input, blockers, conclusion };
}

export function metric(key: string, label: string, value: number | null, unit: string, provenance: SpatialMetric["provenance"]): SpatialMetric {
  return { key, label, value, unit, status: value === null ? "missing" : "measured", provenance };
}

/** Extracts only explicit, typed suitability inputs; absent or malformed values remain unknown. */
export function knownSuitabilityInputs(entity: WorldEntity): KnownSuitabilityInputs {
  const value = (key: string) => entity.properties[key];
  const number = (key: string) => {
    const raw = value(key);
    const parsed = Number(raw);
    return raw === null || raw === undefined || raw === "" || !Number.isFinite(parsed) ? undefined : parsed;
  };
  const boolean = (key: string) => typeof value(key) === "boolean" ? value(key) as boolean : undefined;
  const flood = value("floodRisk");
  return {
    areaM2: number("areaM2") ?? number("oppervlakte"),
    permittedUse: boolean("permittedUse"),
    hasBuildProhibition: boolean("buildProhibition"),
    contaminated: boolean("contaminated"),
    floodRisk: flood === "low" || flood === "medium" || flood === "high" ? flood : undefined,
    accessAvailable: boolean("accessAvailable"),
    ownershipCount: number("ownershipCount"),
  };
}

const themeByAmenity: Readonly<Record<string, AccessibilityTheme>> = {
  supermarket: "daily", convenience: "daily", school: "education", college: "education", kindergarten: "education", childcare: "education",
  hospital: "healthcare", clinic: "healthcare", doctors: "healthcare", pharmacy: "healthcare",
  bus_station: "mobility", ferry_terminal: "mobility", bicycle_parking: "mobility", station: "mobility", halt: "mobility", platform: "mobility",
  library: "environment", community_centre: "environment", social_centre: "environment", sports_centre: "environment",
};

export function buildNearbyAmenities(subject: WorldEntity, candidates: readonly WorldEntity[], limit = 12, radiusMeters = 2_500): NearbyAmenity[] {
  const center = subject.geometry?.center ?? (subject.geometry?.bounds ? [(subject.geometry.bounds[0] + subject.geometry.bounds[2]) / 2, (subject.geometry.bounds[1] + subject.geometry.bounds[3]) / 2] as Position : null);
  if (!center || limit <= 0 || radiusMeters <= 0) return [];
  return candidates.flatMap((candidate) => {
    if (candidate.type !== "infrastructure" || !candidate.geometry?.center || !candidate.provenance[0]) return [];
    const amenity = String(candidate.properties.amenity ?? "");
    if (!themeByAmenity[amenity]) return [];
    const distance = Math.round(distanceMeters(center, candidate.geometry.center));
    if (distance > radiusMeters) return [];
    return [{ entityId: candidate.id, name: candidate.name, category: String(candidate.properties.category ?? "Voorziening"), amenity, distanceMeters: distance, provenance: candidate.provenance[0] }];
  }).toSorted((left, right) => left.distanceMeters - right.distanceMeters).slice(0, Math.floor(limit));
}

export function distanceMeters(a: Position, b: Position) {
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = toRadians(b[1] - a[1]);
  const longitudeDelta = toRadians(b[0] - a[0]);
  const latitude1 = toRadians(a[1]);
  const latitude2 = toRadians(b[1]);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function drawingRing(drawing: DrawingFeature): readonly Position[] {
  if (drawing.kind !== "rectangle") return drawing.coordinates;
  const [a, b] = drawing.coordinates;
  if (!a || !b) return drawing.coordinates;
  return [a, [b[0], a[1]], b, [a[0], b[1]], a];
}

export function measureDrawing(drawing: DrawingFeature): DrawingMeasurement {
  const points = drawingRing(drawing);
  const closed = drawing.kind === "polygon" || drawing.kind === "rectangle";
  const path = closed && points.length > 2 && points[0] !== points.at(-1) ? [...points, points[0]!] : points;
  const lengthMeters = path.slice(1).reduce((sum, point, index) => sum + distanceMeters(path[index]!, point), 0);
  if (!closed || path.length < 4) return { lengthMeters, areaSquareMeters: 0, methodVersion: "geodesic-local-area-1.0.0", limitations: ["Lengte is geodesisch; oppervlak is alleen beschikbaar voor gesloten vlakken."] };
  const meanLatitude = path.reduce((sum, point) => sum + point[1], 0) / path.length * Math.PI / 180;
  const projected = path.map(([longitude, latitude]) => [6_371_000 * longitude * Math.PI / 180 * Math.cos(meanLatitude), 6_371_000 * latitude * Math.PI / 180] as const);
  const twiceArea = projected.slice(1).reduce((sum, point, index) => sum + projected[index]![0] * point[1] - point[0] * projected[index]![1], 0);
  return { lengthMeters, areaSquareMeters: Math.abs(twiceArea) / 2, methodVersion: "geodesic-local-area-1.0.0", limitations: ["Oppervlak is indicatief berekend in een lokale projectie; gebruik een officiële inmeting voor besluiten."] };
}

export function assessKnownSuitability(input: KnownSuitabilityInputs, provenance: SpatialMetric["provenance"], assessedAt = new Date().toISOString()): SuitabilityAssessment {
  const dimensions: SuitabilityDimension[] = ["planning", "physical", "environment-safety", "accessibility", "market-program", "deliverability"];
  const results = new Map<SuitabilityDimension, SuitabilityDimensionResult>(dimensions.map((dimension) => [dimension, { dimension, status: "needs-research", score: null, metrics: [], confidence: "unknown" }]));
  const blockers: SuitabilityBlocker[] = [];
  if (input.permittedUse !== undefined && input.permittedUse !== null) results.set("planning", { dimension: "planning", status: input.permittedUse ? "suitable" : "blocked", score: null, metrics: [], confidence: provenance.confidence });
  if (input.hasBuildProhibition) blockers.push({ code: "BUILD_PROHIBITION", label: "Bouwverbod aanwezig", severity: "hard", explanation: "De aangeleverde bron markeert een bouwverbod voor deze locatie.", provenance });
  if (input.permittedUse === false) blockers.push({ code: "USE_NOT_PERMITTED", label: "Gebruik niet toegestaan", severity: "hard", explanation: "De aangeleverde planinformatie staat het beoogde gebruik niet toe.", provenance });
  if (input.areaM2 !== undefined && input.areaM2 !== null) results.set("physical", { dimension: "physical", status: input.areaM2 > 0 ? "suitable" : "attention", score: null, metrics: [metric("area-m2", "Oppervlakte", input.areaM2, "m²", provenance)], confidence: provenance.confidence });
  if (input.contaminated !== undefined && input.contaminated !== null || input.floodRisk) {
    const attention = input.contaminated === true || input.floodRisk === "high" || input.floodRisk === "medium";
    results.set("environment-safety", { dimension: "environment-safety", status: attention ? "attention" : "suitable", score: null, metrics: [], confidence: provenance.confidence });
    if (input.contaminated) blockers.push({ code: "CONTAMINATION", label: "Mogelijke bodemverontreiniging", severity: "conditional", explanation: "Sanering of nader bodemonderzoek kan nodig zijn.", provenance });
    if (input.floodRisk === "high") blockers.push({ code: "HIGH_FLOOD_RISK", label: "Hoog overstromingsrisico", severity: "conditional", explanation: "Klimaatadaptatie en nader wateronderzoek zijn nodig.", provenance });
  }
  if (input.accessAvailable !== undefined && input.accessAvailable !== null) results.set("accessibility", { dimension: "accessibility", status: input.accessAvailable ? "suitable" : "attention", score: null, metrics: [], confidence: provenance.confidence });
  if (input.ownershipCount !== undefined && input.ownershipCount !== null) results.set("deliverability", { dimension: "deliverability", status: input.ownershipCount <= 1 ? "suitable" : "attention", score: null, metrics: [metric("ownership-count", "Aantal eigenaren", input.ownershipCount, "eigenaren", provenance)], confidence: provenance.confidence });
  return assessSuitability({ dimensions: Array.from(results.values()), blockers, assessedAt, methodVersion: "known-input-suitability-1.0.0" });
}

export function buildProximityBaseline(subject: WorldEntity, candidates: readonly WorldEntity[], computedAt = new Date().toISOString()): AccessibilityProfile | null {
  const center = subject.geometry?.center ?? (subject.geometry?.bounds ? [(subject.geometry.bounds[0] + subject.geometry.bounds[2]) / 2, (subject.geometry.bounds[1] + subject.geometry.bounds[3]) / 2] as Position : null);
  if (!center) return null;
  const grouped = new Map<string, { theme: AccessibilityTheme; distances: number[]; sources: Provenance[] }>();
  for (const candidate of candidates) {
    if (candidate.type !== "infrastructure" || !candidate.geometry?.center) continue;
    const amenity = String(candidate.properties.amenity ?? "");
    const theme = themeByAmenity[amenity];
    if (!theme) continue;
    const key = `${theme}:${amenity}`;
    const entry = grouped.get(key) ?? { theme, distances: [], sources: [] };
    entry.distances.push(distanceMeters(center, candidate.geometry.center));
    entry.sources.push(...candidate.provenance);
    grouped.set(key, entry);
  }
  const measures = Array.from(grouped.entries()).map(([key, entry]) => {
    const closest = Math.min(...entry.distances);
    const source = [...entry.sources].sort((left, right) => Date.parse(right.retrievedAt) - Date.parse(left.retrievedAt))[0];
    const provenance: Provenance = source ? {
      sourceId: `lumen-proximity:${source.sourceId}`,
      sourceLabel: `Lumen-berekening op ${source.sourceLabel}`,
      ...(source.sourceUrl ? { sourceUrl: source.sourceUrl } : {}),
      retrievedAt: source.retrievedAt,
      confidence: "low",
      methodVersion: "straight-line-proximity-1.0.0",
      limitations: Array.from(new Set(["Hemelsbrede afstand; geen route over wegennet of dienstregeling.", ...(source.limitations ?? []), ...(source.assumptions ?? [])])),
    } : {
      sourceId: "missing-poi-source",
      sourceLabel: "POI-bron niet geregistreerd",
      retrievedAt: "",
      confidence: "unknown",
      methodVersion: "straight-line-proximity-1.0.0",
      limitations: ["De voorziening heeft geen herleidbare bron; deze uitkomst mag niet voor besluitvorming worden gebruikt.", "Hemelsbrede afstand; geen route over wegennet of dienstregeling."],
    };
    return { destinationType: key.split(":")[1]!, mode: "walk" as const, minutes: Math.round(closest / 80), distanceMeters: Math.round(closest), status: "estimated" as const, count5: entry.distances.filter((distance) => distance <= 400).length, count10: entry.distances.filter((distance) => distance <= 800).length, count15: entry.distances.filter((distance) => distance <= 1200).length, provenance };
  });
  // A straight-line POI baseline is not sufficient evidence for a mobility score.
  // Scores remain unknown until a routed network or timetable calculation exists.
  const themes: AccessibilityProfile["themes"] = Object.fromEntries((["daily", "healthcare", "education", "mobility", "environment"] as const).map((theme) => [theme, { score: null, confidence: "unknown" }]));
  return { entityId: subject.id, computedAt, methodVersion: "straight-line-proximity-1.0.0", measures, themes };
}
