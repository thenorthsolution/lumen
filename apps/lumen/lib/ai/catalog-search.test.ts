import { describe, expect, it, vi } from "vitest";
import { searchSpatialCatalog } from "./catalog-search";

function queryResult(data: unknown[], error: unknown = null) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "textSearch", "order", "limit", "eq", "in"]) chain[method] = vi.fn(() => chain);
  chain.then = (resolve: (value: unknown) => unknown) => resolve({ data, error });
  return chain;
}

function clientWith(tableRows: Record<string, unknown[]>) {
  const queries = new Map(Object.entries(tableRows).map(([table, rows]) => [table, queryResult(rows)]));
  return { client: { from: vi.fn((table: string) => queries.get(table)) }, queries };
}

describe("tenant-safe spatial catalog search", () => {
  it("uses the authenticated data client and returns only allowlisted properties with provenance", async () => {
    const { client, queries } = clientWith({
      spatial_entities: [{ id: "building-1", entity_type: "building", name: "Stadhuis", description: "Publiek gebouw", properties: { bouwjaar: 2016, status: "in gebruik", secretOwnerNote: "never expose" }, primary_snapshot_id: "snapshot-1", owner_id: "must-not-leak" }],
      dataset_snapshots: [{ id: "snapshot-1", source_id: "bag", version: "2026-09-01", captured_at: "2026-09-01T00:00:00.000Z", license: "CC0", method_version: "bag-sync-1" }],
      data_sources: [{ id: "bag", label: "BAG", authority: "Kadaster", license_url: "https://example.test/license", updated_at: "2026-09-01T00:00:00.000Z" }],
    });

    const result = await searchSpatialCatalog("Stadhuis", async () => client as never, "building", 40);

    expect(result).toMatchObject({ status: "success", entities: [{ id: "building-1", properties: { bouwjaar: 2016, status: "in gebruik" }, provenance: { sourceId: "bag", confidence: "verified" } }] });
    expect(result.entities[0]?.properties).not.toHaveProperty("secretOwnerNote");
    expect(result.entities[0]).not.toHaveProperty("owner_id");
    expect(queries.get("spatial_entities")?.select).toHaveBeenCalledWith("id,entity_type,name,description,properties,primary_snapshot_id");
    expect(String(vi.mocked(queries.get("spatial_entities")?.select as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])).not.toMatch(/geometry|owner_id|organization_id|project_id|payload/i);
    expect(queries.get("spatial_entities")?.textSearch).toHaveBeenCalledWith("search_document", "Stadhuis", { config: "simple", type: "websearch" });
    expect(queries.get("spatial_entities")?.limit).toHaveBeenCalledWith(10);
    expect(queries.get("spatial_entities")?.eq).toHaveBeenCalledWith("entity_type", "building");
  });

  it("fails closed when the catalogue is unavailable and marks absent provenance unknown", async () => {
    expect(await searchSpatialCatalog("Deventer", async () => null)).toMatchObject({ status: "unavailable", entities: [] });
    const { client } = clientWith({ spatial_entities: [{ id: "project-1", entity_type: "project", name: "Project", description: null, properties: {}, primary_snapshot_id: null }] });
    const result = await searchSpatialCatalog("Project", async () => client as never);
    expect(result).toMatchObject({ status: "success", entities: [{ provenance: { confidence: "unknown", capturedAt: null } }] });
  });
});
