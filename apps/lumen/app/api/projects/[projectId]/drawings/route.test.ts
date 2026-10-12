import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { getCloudIdentity } from "@/lib/cloud/session";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/cloud/session", () => ({ getCloudIdentity: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

describe("/api/projects/:projectId/drawings", () => {
  beforeEach(() => {
    vi.mocked(getCloudIdentity).mockReset();
    vi.mocked(createClient).mockReset();
  });

  it("loads project drawings through the tenant-scoped RLS client", async () => {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order"]) query[method] = vi.fn(() => query);
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ id: "drawing-1" }], error: null }).then(resolve);
    const from = vi.fn(() => query);
    vi.mocked(getCloudIdentity).mockResolvedValue({ user: { id: "user-1" }, organization: null, entitlements: { features: ["private-projects"] } } as never);
    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await GET(new Request("http://localhost/api/projects/project-1/drawings"), { params: Promise.resolve({ projectId: "project-1" }) });

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith("project_drawings");
    expect(query.eq as ReturnType<typeof vi.fn>).toHaveBeenCalledWith("project_id", "project-1");
    expect(query.order as ReturnType<typeof vi.fn>).toHaveBeenCalledWith("updated_at", { ascending: false });
  });

  it("rejects writes for an organization outside the active identity", async () => {
    vi.mocked(getCloudIdentity).mockResolvedValue({ user: { id: "user-1" }, organization: { id: "11111111-1111-4111-8111-111111111111" }, entitlements: { features: ["private-projects"] } } as never);
    vi.mocked(createClient).mockResolvedValue({} as never);
    const response = await POST(new Request("http://localhost/api/projects/project-1/drawings", {
      method: "POST",
      body: JSON.stringify({
        id: "33333333-3333-4333-8333-333333333333",
        name: "Bouwvlak",
        kind: "rectangle",
        coordinates: [[6.1, 52.2], [6.2, 52.3]],
        color: "#315df0",
        organizationId: "22222222-2222-4222-8222-222222222222",
      }),
    }), { params: Promise.resolve({ projectId: "project-1" }) });

    expect(response.status).toBe(403);
  });

  it("rejects writes when private project storage is not entitled", async () => {
    const from = vi.fn();
    vi.mocked(getCloudIdentity).mockResolvedValue({ user: { id: "user-1" }, organization: null, entitlements: { features: [] } } as never);
    vi.mocked(createClient).mockResolvedValue({ from } as never);
    const response = await POST(new Request("http://localhost/api/projects/project-1/drawings", {
      method: "POST",
      body: JSON.stringify({ id: "33333333-3333-4333-8333-333333333333", name: "Bouwvlak", kind: "rectangle", coordinates: [[6.1, 52.2], [6.2, 52.3]], color: "#315df0" }),
    }), { params: Promise.resolve({ projectId: "project-1" }) });

    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
});
