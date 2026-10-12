import { describe, expect, it, vi } from "vitest";
import { inspectCatalogEntity } from "./catalog-evidence";

function queuedClient(queued: Record<string, { data: unknown; error: unknown }[]>) {
  const calls: { table: string; select?: string }[] = [];
  const client = { from: vi.fn((table: string) => {
    const result = queued[table]?.shift() ?? { data: [], error: null };
    const call: { table: string; select?: string } = { table }; calls.push(call);
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn((columns: string) => { call.select = columns; return chain; });
    for (const method of ["eq", "order", "limit", "in"]) chain[method] = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => result);
    chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
    return chain;
  }) };
  return { client, calls };
}

describe("controlled catalogue evidence", () => {
  it("returns RLS-visible relationships and strips arbitrary analytical payload fields", async () => {
    const { client, calls } = queuedClient({
      spatial_entities: [
        { data: { id: "site-1", entity_type: "site", name: "Locatie", description: null, primary_snapshot_id: "snap-1" }, error: null },
        { data: [{ id: "project-1", entity_type: "project", name: "Project" }], error: null },
      ],
      source_records: [{ data: [{ id: "record-1", snapshot_id: "snap-1", external_id: "OFFICIAL-1", observed_at: "2026-09-11T00:00:00.000Z", payload_reference: "vault://never" }], error: null }],
      entity_relationships: [
        { data: [{ id: "rel-1", left_entity_id: "site-1", right_entity_id: "project-1", relation_type: "project-site", snapshot_id: "snap-1", method_version: "link-1", created_at: "2026-09-11T00:00:00.000Z" }], error: null },
        { data: [], error: null },
      ],
      spatial_observations: [{ data: [{ id: "obs-1", snapshot_id: "snap-1", theme: "physical", observed_at: "2026-09-11T00:00:00.000Z", method_version: "physical-1", metrics: [{ key: "areaM2", value: 1200, unit: "m²", status: "measured", privateNote: "never" }, { arbitrary: "drop" }], limitations: ["Indicatief", { secret: true }] }], error: null }],
      suitability_assessments: [{ data: [{ id: "assessment-1", conclusion: "conditional", assessed_at: "2026-09-11T00:00:00.000Z", method_version: "suitability-1", snapshot_ids: ["snap-1"], dimensions: [{ dimension: "physical", status: "attention", score: 72, confidence: "high", metrics: [], raw: "drop" }], blockers: [{ code: "SOIL", label: "Bodemonderzoek", severity: "conditional", explanation: "Nader onderzoek nodig.", secret: true }] }], error: null }],
      dataset_snapshots: [{ data: [{ id: "snap-1", source_id: "bro", version: "2026-09", captured_at: "2026-09-01T00:00:00.000Z", license: "CC BY 4.0", method_version: "bro-sync-1" }], error: null }],
      data_sources: [{ data: [{ id: "bro", label: "BRO", authority: "Ministerie van BZK", license_url: "https://example.test/bro-license" }], error: null }],
    });

    const result = await inspectCatalogEntity("site-1", async () => client as never);

    expect(result).toMatchObject({ status: "success", entity: { provenance: { sourceId: "bro", confidence: "verified" }, sourceRecords: [{ externalId: "OFFICIAL-1", provenance: { snapshotVersion: "2026-09" } }], relationships: [{ direction: "outgoing", relationType: "project-site", entity: { id: "project-1" }, provenance: { authority: "Ministerie van BZK" } }], observations: [{ metrics: [{ key: "areaM2", value: 1200, status: "measured" }], limitations: ["Indicatief"], provenance: { sourceId: "bro" } }], assessments: [{ blockers: [{ code: "SOIL", severity: "conditional" }], provenance: [{ sourceId: "bro" }] }] } });
    expect(JSON.stringify(result)).not.toMatch(/vault:\/\/|privateNote|secret/i);
    expect(calls.find((call) => call.table === "source_records")?.select).not.toContain("payload_reference");
    expect(calls[0]?.select).not.toMatch(/geometry|owner_id|organization_id|project_id/i);
  });

  it("does not distinguish a missing object from one hidden by RLS", async () => {
    const { client } = queuedClient({ spatial_entities: [{ data: null, error: null }] });
    expect(await inspectCatalogEntity("private-object", async () => client as never)).toEqual({ status: "not_found", message: "Dit object bestaat niet of is niet toegankelijk.", entity: null });
  });
});
