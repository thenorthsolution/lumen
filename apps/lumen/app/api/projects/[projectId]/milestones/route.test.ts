import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { getCloudIdentity } from "@/lib/cloud/session";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/cloud/session", () => ({ getCloudIdentity: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const context = { params: Promise.resolve({ projectId: "11111111-1111-4111-8111-111111111111" }) };

describe("/api/projects/:projectId/milestones", () => {
  beforeEach(() => { vi.mocked(getCloudIdentity).mockReset(); vi.mocked(createClient).mockReset(); });

  it("lists milestones through the tenant-scoped client", async () => {
    const query: Record<string, unknown> = {}; for (const method of ["select", "eq", "order"]) query[method] = vi.fn(() => query);
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
    vi.mocked(getCloudIdentity).mockResolvedValue({ user: { id: "user-1" }, organization: null } as never);
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn(() => query) } as never);
    const response = await GET(new Request("http://localhost/api/projects/p/milestones"), context);
    expect(response.status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith("project_id", "11111111-1111-4111-8111-111111111111");
  });

  it("creates a validated milestone for an entitled user", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "22222222-2222-4222-8222-222222222222" }, error: null }); const select = vi.fn(() => ({ single })); const insert = vi.fn(() => ({ select }));
    vi.mocked(getCloudIdentity).mockResolvedValue({ user: { id: "user-1" }, organization: null, entitlements: { features: ["private-projects"] } } as never);
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn(() => ({ insert })) } as never);
    const response = await POST(new Request("http://localhost/api/projects/p/milestones", { method: "POST", body: JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", label: "Vergunning", status: "planned", plannedAt: "2026-10-01T12:00:00.000Z" }) }), context);
    expect(response.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ project_id: "11111111-1111-4111-8111-111111111111", created_by: "user-1", label: "Vergunning", status: "planned" }));
  });
});
