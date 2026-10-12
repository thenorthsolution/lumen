import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { getCloudIdentity } from "@/lib/cloud/session";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/cloud/session", () => ({ getCloudIdentity: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

function queryResult(data: unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "order", "limit", "eq", "is"]) query[method] = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve);
  return query;
}

describe("GET /api/projects", () => {
  beforeEach(() => { vi.mocked(getCloudIdentity).mockReset(); vi.mocked(createClient).mockReset(); });

  it("lists only the authenticated user's personal projects", async () => {
    const query = queryResult([{ id: "project-1", name: "Binnenstad" }]);
    const from = vi.fn(() => query);
    vi.mocked(getCloudIdentity).mockResolvedValue({ user: { id: "user-1" }, organization: null } as never);
    vi.mocked(createClient).mockResolvedValue({ from } as never);
    const response = await GET(new Request("http://localhost/api/projects"));
    expect(response.status).toBe(200);
    expect((query.is as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("organization_id", null);
    expect((query.eq as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("owner_id", "user-1");
  });

  it("rejects an organization outside the active identity before querying projects", async () => {
    const from = vi.fn();
    vi.mocked(getCloudIdentity).mockResolvedValue({ user: { id: "user-1" }, organization: { id: "11111111-1111-4111-8111-111111111111" } } as never);
    vi.mocked(createClient).mockResolvedValue({ from } as never);
    const response = await GET(new Request("http://localhost/api/projects?organizationId=22222222-2222-4222-8222-222222222222"));
    expect(response.status).toBe(403); expect(from).not.toHaveBeenCalled();
  });
});

describe("POST /api/projects", () => {
  beforeEach(() => { vi.mocked(getCloudIdentity).mockReset(); vi.mocked(createClient).mockReset(); });

  it("persists a validated canonical site snapshot with the project", async () => {
    const workspaceSingle = vi.fn().mockResolvedValue({ data: { id: "workspace-1" }, error: null });
    const workspaceSelect = vi.fn(() => ({ single: workspaceSingle }));
    const workspaceInsert = vi.fn(() => ({ select: workspaceSelect }));
    const projectSingle = vi.fn().mockResolvedValue({ data: { id: "project-1" }, error: null });
    const projectSelect = vi.fn(() => ({ single: projectSingle }));
    const projectInsert = vi.fn(() => ({ select: projectSelect }));
    const from = vi.fn((table: string) => table === "workspaces" ? { insert: workspaceInsert } : { insert: projectInsert });
    vi.mocked(getCloudIdentity).mockResolvedValue({ user: { id: "user-1" }, organization: null, entitlements: { features: ["private-projects"], projectLimit: null } } as never);
    vi.mocked(createClient).mockResolvedValue({ from } as never);
    const siteSnapshot = { id: "brk-perceel-1", type: "parcel", name: "Deventer A 1", geometry: { kind: "polygon", center: [6.16, 52.26], coordinateSystem: "WGS84" }, properties: { identificatie: "1" }, provenance: [{ sourceId: "brk", sourceLabel: "BRK", retrievedAt: "2026-09-11T12:00:00.000Z", confidence: "verified" }] };

    const response = await POST(new Request("http://localhost/api/projects", { method: "POST", body: JSON.stringify({ name: "Binnenstad", siteId: siteSnapshot.id, siteSnapshot }) }));

    expect(response.status).toBe(201);
    expect(projectInsert).toHaveBeenCalledWith(expect.objectContaining({ site_entity_id: siteSnapshot.id, site_snapshot: siteSnapshot }));
  });

  it("rejects a site snapshot that belongs to another entity", async () => {
    const response = await POST(new Request("http://localhost/api/projects", { method: "POST", body: JSON.stringify({ name: "Binnenstad", siteId: "site-1", siteSnapshot: { id: "site-2", type: "site", name: "Andere locatie", properties: {}, provenance: [] } }) }));
    expect(response.status).toBe(400);
    expect(getCloudIdentity).not.toHaveBeenCalled();
  });
});
