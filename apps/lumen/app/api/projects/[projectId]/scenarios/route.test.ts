import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { getCloudIdentity } from "@/lib/cloud/session";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/cloud/session", () => ({ getCloudIdentity: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

describe("POST /api/projects/:projectId/scenarios", () => {
  beforeEach(() => { vi.mocked(getCloudIdentity).mockReset(); vi.mocked(createClient).mockReset(); });

  it("rejects an organization outside the active identity", async () => {
    vi.mocked(getCloudIdentity).mockResolvedValue({ user: { id: "user-1" }, organization: { id: "11111111-1111-4111-8111-111111111111" }, entitlements: { features: ["private-projects"] } } as never);
    vi.mocked(createClient).mockResolvedValue({} as never);
    const response = await POST(new Request("http://localhost/api/projects/p/scenarios", { method: "POST", body: JSON.stringify({ name: "Basis", organizationId: "22222222-2222-4222-8222-222222222222" }) }), { params: Promise.resolve({ projectId: "project-1" }) });
    expect(response.status).toBe(403);
  });

  it("inserts a validated scenario under the authenticated user", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "scenario-1", name: "Basis" }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    vi.mocked(getCloudIdentity).mockResolvedValue({ user: { id: "user-1" }, organization: null, entitlements: { features: ["private-projects"] } } as never);
    vi.mocked(createClient).mockResolvedValue({ from } as never);
    const calculation = { methodVersion: "indicative-scenario-1.0.0", grossFloorAreaM2: 1000, netFloorAreaM2: 800, homes: { low: 8, expected: 10, high: 12 }, constructionCostEur: { low: 1800000, expected: 2000000, high: 2200000 }, durationMonths: { low: 12, expected: 15, high: 18 }, riskFlags: [], assumptions: ["Indicatief"], inputs: { siteAreaM2: 1000, coverageRatio: 0.5, floors: 2, grossToNetRatio: 0.8, averageHomeAreaM2: 80, constructionCostPerGfaM2: 2000, preparationMonths: 12, constructionMonthsPer10kGfa: 30 } };
    const response = await POST(new Request("http://localhost/api/projects/p/scenarios", { method: "POST", body: JSON.stringify({ name: "Basis", calculation, assumptions: ["Indicatief"] }) }), { params: Promise.resolve({ projectId: "project-1" }) });

    expect(response.status).toBe(201);
    expect(from).toHaveBeenCalledWith("scenarios");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ project_id: "project-1", created_by: "user-1", status: "calculated", assumptions: ["Indicatief"], calculation }));
  });
});

describe("GET /api/projects/:projectId/scenarios", () => {
  beforeEach(() => { vi.mocked(getCloudIdentity).mockReset(); vi.mocked(createClient).mockReset(); });

  it("returns non-archived scenarios newest first through the RLS client", async () => {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "order", "limit"]) query[method] = vi.fn(() => query);
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ id: "scenario-1", name: "Basis" }], error: null }).then(resolve);
    vi.mocked(getCloudIdentity).mockResolvedValue({ user: { id: "user-1" }, organization: null } as never);
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn(() => query) } as never);
    const response = await GET(new Request("http://localhost/api/projects/project-1/scenarios"), { params: Promise.resolve({ projectId: "project-1" }) });
    expect(response.status).toBe(200);
    expect(query.eq as ReturnType<typeof vi.fn>).toHaveBeenCalledWith("project_id", "project-1");
    expect(query.neq as ReturnType<typeof vi.fn>).toHaveBeenCalledWith("status", "archived");
    expect(query.order as ReturnType<typeof vi.fn>).toHaveBeenCalledWith("updated_at", { ascending: false });
  });
});
