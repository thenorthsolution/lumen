import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogEntityType } from "./world-tools";

type ClientFactory = () => Promise<SupabaseClient | null>;
type Scalar = string | number | boolean | null;
type SnapshotRow = { id: string; source_id: string; version: string; captured_at: string; license: string; method_version: string | null };
type SourceRow = { id: string; label: string; authority: string; license_url: string | null };

const dimensions = new Set(["planning", "physical", "environment-safety", "accessibility", "market-program", "deliverability"]);
const dimensionStatuses = new Set(["suitable", "attention", "blocked", "needs-research"]);
const confidences = new Set(["verified", "high", "medium", "low", "unknown"]);
const metricStatuses = new Set(["measured", "estimated", "missing"]);

const record = (value: unknown): Record<string, unknown> | null => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
const boundedText = (value: unknown, maximum = 500) => typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : null;
const scalar = (value: unknown): Scalar | undefined => value === null || ["string", "number", "boolean"].includes(typeof value) ? value as Scalar : undefined;
const strings = (value: unknown) => Array.isArray(value) ? value.flatMap((item) => boundedText(item, 500) ?? []).slice(0, 5) : [];

function safeMetrics(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const source = record(item); const key = boundedText(source?.key, 120); const metricValue = scalar(source?.value);
    if (!source || !key || metricValue === undefined) return [];
    const unit = boundedText(source.unit, 40);
    const status = typeof source.status === "string" && metricStatuses.has(source.status) ? source.status : "missing";
    return [{ key, value: metricValue, unit, status }];
  }).slice(0, 30);
}

function safeDimensions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const source = record(item);
    if (!source || typeof source.dimension !== "string" || !dimensions.has(source.dimension) || typeof source.status !== "string" || !dimensionStatuses.has(source.status)) return [];
    return [{
      dimension: source.dimension,
      status: source.status,
      score: typeof source.score === "number" && Number.isFinite(source.score) ? source.score : null,
      confidence: typeof source.confidence === "string" && confidences.has(source.confidence) ? source.confidence : "unknown",
      metrics: safeMetrics(source.metrics),
    }];
  }).slice(0, 6);
}

function safeBlockers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const source = record(item); const code = boundedText(source?.code, 120); const label = boundedText(source?.label, 240); const explanation = boundedText(source?.explanation, 1_000);
    if (!source || !code || !label || !explanation || (source.severity !== "hard" && source.severity !== "conditional")) return [];
    return [{ code, label, explanation, severity: source.severity }];
  }).slice(0, 30);
}

export async function inspectCatalogEntity(entityId: string, clientFactory: ClientFactory) {
  const id = entityId.trim().slice(0, 240);
  if (!id) return { status: "not_found" as const, message: "Geen geldig ruimtelijk object opgegeven.", entity: null };
  const client = await clientFactory();
  if (!client) return { status: "unavailable" as const, message: "De beveiligde ruimtelijke catalogus is nog niet geconfigureerd.", entity: null };

  const entityResult = await client.from("spatial_entities").select("id,entity_type,name,description,primary_snapshot_id").eq("id", id).maybeSingle();
  if (entityResult.error) return { status: "unavailable" as const, message: "Het ruimtelijke object kon niet veilig worden gelezen.", entity: null };
  if (!entityResult.data) return { status: "not_found" as const, message: "Dit object bestaat niet of is niet toegankelijk.", entity: null };

  const [recordsResult, leftResult, rightResult, observationsResult, assessmentsResult] = await Promise.all([
    client.from("source_records").select("id,snapshot_id,external_id,observed_at").eq("entity_id", id).order("observed_at", { ascending: false }).limit(20),
    client.from("entity_relationships").select("id,left_entity_id,right_entity_id,relation_type,snapshot_id,method_version,created_at").eq("left_entity_id", id).limit(30),
    client.from("entity_relationships").select("id,left_entity_id,right_entity_id,relation_type,snapshot_id,method_version,created_at").eq("right_entity_id", id).limit(30),
    client.from("spatial_observations").select("id,snapshot_id,theme,observed_at,method_version,metrics,limitations").eq("subject_entity_id", id).order("observed_at", { ascending: false }).limit(20),
    client.from("suitability_assessments").select("id,conclusion,dimensions,blockers,snapshot_ids,method_version,assessed_at").eq("subject_entity_id", id).order("assessed_at", { ascending: false }).limit(5),
  ]);

  const relationRows = [...(leftResult.data ?? []), ...(rightResult.data ?? [])] as Record<string, unknown>[];
  const linkedIds = Array.from(new Set(relationRows.map((relation) => relation.left_entity_id === id ? relation.right_entity_id : relation.left_entity_id).filter((value): value is string => typeof value === "string")));
  const evidenceRows = [...((recordsResult.data ?? []) as Record<string, unknown>[]), ...relationRows, ...((observationsResult.data ?? []) as Record<string, unknown>[])];
  const assessmentSnapshotIds = ((assessmentsResult.data ?? []) as Record<string, unknown>[]).flatMap((assessment) => Array.isArray(assessment.snapshot_ids) ? assessment.snapshot_ids.filter((value): value is string => typeof value === "string") : []);
  const snapshotIds = Array.from(new Set([
    typeof entityResult.data.primary_snapshot_id === "string" ? entityResult.data.primary_snapshot_id : null,
    ...evidenceRows.map((row) => typeof row.snapshot_id === "string" ? row.snapshot_id : null),
    ...assessmentSnapshotIds,
  ].filter((value): value is string => Boolean(value))));
  const [linkedResult, snapshotsResult] = await Promise.all([
    linkedIds.length ? client.from("spatial_entities").select("id,entity_type,name").in("id", linkedIds) : Promise.resolve({ data: [], error: null }),
    snapshotIds.length ? client.from("dataset_snapshots").select("id,source_id,version,captured_at,license,method_version").in("id", snapshotIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const linked = new Map(((linkedResult.data ?? []) as { id: string; entity_type: CatalogEntityType; name: string }[]).map((entity) => [entity.id, entity]));
  const snapshots = new Map(((snapshotsResult.data ?? []) as SnapshotRow[]).map((snapshot) => [snapshot.id, snapshot]));
  const sourceIds = Array.from(new Set(Array.from(snapshots.values(), (snapshot) => snapshot.source_id)));
  const sourcesResult = !snapshotsResult.error && sourceIds.length ? await client.from("data_sources").select("id,label,authority,license_url").in("id", sourceIds) : { data: [], error: null };
  const sources = new Map(((sourcesResult.data ?? []) as SourceRow[]).map((source) => [source.id, source]));
  const provenanceFor = (snapshotId: unknown) => {
    const snapshot = typeof snapshotId === "string" ? snapshots.get(snapshotId) : undefined;
    const source = snapshot ? sources.get(snapshot.source_id) : undefined;
    return snapshot && source ? {
      sourceId: source.id, sourceLabel: source.label, authority: source.authority, sourceUrl: source.license_url,
      snapshotVersion: snapshot.version, capturedAt: snapshot.captured_at, methodVersion: snapshot.method_version,
      license: snapshot.license, confidence: "verified" as const, limitations: [] as string[],
    } : {
      sourceId: null, sourceLabel: "Bron niet beschikbaar", authority: null, sourceUrl: null,
      snapshotVersion: null, capturedAt: null, methodVersion: null, license: null,
      confidence: "unknown" as const, limitations: ["De gekoppelde bron-snapshot is niet leesbaar of ontbreekt."],
    };
  };

  const relationships = relationRows.flatMap((relation) => {
    const otherId = relation.left_entity_id === id ? relation.right_entity_id : relation.left_entity_id;
    const other = typeof otherId === "string" ? linked.get(otherId) : undefined;
    if (!other || typeof relation.relation_type !== "string" || typeof relation.method_version !== "string") return [];
    return [{ direction: relation.left_entity_id === id ? "outgoing" : "incoming", relationType: relation.relation_type, entity: { id: other.id, entityType: other.entity_type, name: other.name }, methodVersion: relation.method_version, observedAt: typeof relation.created_at === "string" ? relation.created_at : null, provenance: provenanceFor(relation.snapshot_id) }];
  }).slice(0, 30);

  const observations = ((observationsResult.data ?? []) as Record<string, unknown>[]).map((observation) => ({
    id: String(observation.id), theme: String(observation.theme), observedAt: String(observation.observed_at), methodVersion: String(observation.method_version),
    metrics: safeMetrics(observation.metrics), limitations: strings(observation.limitations), snapshotId: String(observation.snapshot_id), provenance: provenanceFor(observation.snapshot_id),
  }));
  const assessments = ((assessmentsResult.data ?? []) as Record<string, unknown>[]).map((assessment) => ({
    id: String(assessment.id), conclusion: String(assessment.conclusion), assessedAt: String(assessment.assessed_at), methodVersion: String(assessment.method_version),
    dimensions: safeDimensions(assessment.dimensions), blockers: safeBlockers(assessment.blockers),
    snapshotIds: Array.isArray(assessment.snapshot_ids) ? assessment.snapshot_ids.filter((value): value is string => typeof value === "string").slice(0, 20) : [],
    provenance: (Array.isArray(assessment.snapshot_ids) ? assessment.snapshot_ids : []).flatMap((snapshotId) => typeof snapshotId === "string" ? [provenanceFor(snapshotId)] : []).slice(0, 20),
  }));
  const sourceRecords = ((recordsResult.data ?? []) as Record<string, unknown>[]).map((sourceRecord) => ({
    id: String(sourceRecord.id), snapshotId: String(sourceRecord.snapshot_id), externalId: String(sourceRecord.external_id), observedAt: String(sourceRecord.observed_at), provenance: provenanceFor(sourceRecord.snapshot_id),
  }));

  const partial = [recordsResult, leftResult, rightResult, observationsResult, assessmentsResult, linkedResult, snapshotsResult, sourcesResult].some((result) => result.error);
  return {
    status: "success" as const,
    message: partial ? "Object gevonden; een deel van het bewijs is tijdelijk niet beschikbaar." : "Object en toegankelijk bewijs gevonden.",
    entity: {
      id: String(entityResult.data.id), entityType: entityResult.data.entity_type as CatalogEntityType,
      name: String(entityResult.data.name), description: entityResult.data.description ? String(entityResult.data.description) : null,
      primarySnapshotId: entityResult.data.primary_snapshot_id ? String(entityResult.data.primary_snapshot_id) : null, provenance: provenanceFor(entityResult.data.primary_snapshot_id),
      sourceRecords, relationships, observations, assessments,
      limitations: partial ? ["Een of meer bewijssets konden niet worden gelezen; niet invullen of afleiden."] : [],
    },
  };
}
