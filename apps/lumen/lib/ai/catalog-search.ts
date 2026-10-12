import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogEntityType } from "./world-tools";

const safePropertyKeys = new Set([
  "code", "identificatie", "address", "street", "houseNumber", "postalCode", "place",
  "areaKind", "municipality", "municipalityCode", "districtCode", "parentCode", "parentName",
  "bouwjaar", "oppervlakte", "areaM2", "kadastraleOppervlakteM2", "gebruiksdoel", "status",
  "category", "candidate", "estimatedHomes", "energielabel", "energyLabel",
  "permittedUse", "buildProhibition", "contaminated", "floodRisk", "accessAvailable", "ownershipCount",
]);

type Scalar = string | number | boolean | null;
type CatalogClient = SupabaseClient;
type ClientFactory = () => Promise<CatalogClient | null>;

interface EntityRow {
  id: string;
  entity_type: CatalogEntityType;
  name: string;
  description: string | null;
  properties: Record<string, unknown> | null;
  primary_snapshot_id: string | null;
}

interface SnapshotRow {
  id: string;
  source_id: string;
  version: string;
  captured_at: string;
  license: string;
  method_version: string | null;
}

interface SourceRow {
  id: string;
  label: string;
  authority: string;
  license_url: string | null;
  updated_at: string;
}

function safeProperties(properties: Record<string, unknown> | null): Record<string, Scalar> {
  if (!properties) return {};
  return Object.fromEntries(Object.entries(properties).flatMap(([key, value]) => {
    if (!safePropertyKeys.has(key) || !(value === null || ["string", "number", "boolean"].includes(typeof value))) return [];
    return [[key, value as Scalar]];
  }));
}

export async function searchSpatialCatalog(
  rawQuery: string,
  clientFactory: ClientFactory,
  entityType?: CatalogEntityType,
  requestedLimit = 8,
) {
  const query = rawQuery.trim().slice(0, 120);
  const limit = Math.max(1, Math.min(10, Math.trunc(requestedLimit)));
  if (query.length < 2) return { status: "not_found" as const, message: "Gebruik minimaal twee tekens om de ruimtelijke catalogus te doorzoeken.", entities: [] };

  const client = await clientFactory();
  if (!client) return { status: "unavailable" as const, message: "De beveiligde ruimtelijke catalogus is nog niet geconfigureerd.", entities: [] };

  let entityQuery = client
    .from("spatial_entities")
    .select("id,entity_type,name,description,properties,primary_snapshot_id")
    .textSearch("search_document", query, { config: "simple", type: "websearch" })
    .order("name", { ascending: true })
    .limit(limit);
  if (entityType) entityQuery = entityQuery.eq("entity_type", entityType);
  const { data: entityData, error: entityError } = await entityQuery;
  if (entityError) return { status: "unavailable" as const, message: "De ruimtelijke catalogus kon niet veilig worden doorzocht.", entities: [] };

  const rows = (entityData ?? []) as EntityRow[];
  if (!rows.length) return { status: "not_found" as const, message: "Geen toegankelijke ruimtelijke objecten gevonden.", entities: [] };

  const snapshotIds = Array.from(new Set(rows.flatMap((row) => row.primary_snapshot_id ? [row.primary_snapshot_id] : [])));
  const snapshotResult = snapshotIds.length
    ? await client.from("dataset_snapshots").select("id,source_id,version,captured_at,license,method_version").in("id", snapshotIds)
    : { data: [], error: null };
  const snapshots = new Map(((snapshotResult.data ?? []) as SnapshotRow[]).map((snapshot) => [snapshot.id, snapshot]));
  const sourceIds = Array.from(new Set(Array.from(snapshots.values(), (snapshot) => snapshot.source_id)));
  const sourceResult = !snapshotResult.error && sourceIds.length
    ? await client.from("data_sources").select("id,label,authority,license_url,updated_at").in("id", sourceIds)
    : { data: [], error: null };
  const sources = new Map(((sourceResult.data ?? []) as SourceRow[]).map((source) => [source.id, source]));

  const entities = rows.map((row) => {
    const snapshot = row.primary_snapshot_id ? snapshots.get(row.primary_snapshot_id) : undefined;
    const source = snapshot ? sources.get(snapshot.source_id) : undefined;
    const provenance = snapshot && source ? {
      sourceId: source.id,
      sourceLabel: source.label,
      authority: source.authority,
      sourceUrl: source.license_url,
      snapshotVersion: snapshot.version,
      capturedAt: snapshot.captured_at,
      methodVersion: snapshot.method_version,
      license: snapshot.license,
      confidence: "verified" as const,
      limitations: [] as string[],
    } : {
      sourceId: null,
      sourceLabel: "Bron niet beschikbaar",
      authority: null,
      sourceUrl: null,
      snapshotVersion: null,
      capturedAt: null,
      methodVersion: null,
      license: null,
      confidence: "unknown" as const,
      limitations: ["Aan dit object is geen leesbare bron-snapshot gekoppeld."],
    };
    return {
      id: row.id,
      entityType: row.entity_type,
      name: row.name,
      description: row.description,
      properties: safeProperties(row.properties),
      provenance,
    };
  });

  return { status: "success" as const, message: `${entities.length} toegankelijk ruimtelijk object${entities.length === 1 ? "" : "en"} gevonden.`, entities };
}
