import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";
import { getCloudIdentity } from "@/lib/cloud/session";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/cloud/session", () => ({ getCloudIdentity: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const context = { params: Promise.resolve({ projectId: "11111111-1111-4111-8111-111111111111", scenarioId: "22222222-2222-4222-8222-222222222222" }) };

describe("PATCH /api/projects/:projectId/scenarios/:scenarioId", () => {
  beforeEach(() => { vi.mocked(getCloudIdentity).mockReset(); vi.mocked(createClient).mockReset(); });

  it("updates only the scenario inside the requested project", async () => {
    const query: Record<string, unknown> = {};
    for (const method of ["update", "eq", "select"]) query[method] = vi.fn(() => query);
    query.maybeSingle = vi.fn().mockResolvedValue({ data: { id: "22222222-2222-4222-8222-222222222222" }, error: null });
    vi.mocked(getCloudIdentity).mockResolvedValue({ user: { id: "user-1" }, organization: null, entitlements: { features: ["private-projects"] } } as never);
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn(() => query) } as never);

    const response = await PATCH(new Request("http://localhost/api/projects/p/scenarios/s", { method: "PATCH", body: JSON.stringify({ name: "Voorkeur" }) }), context);

    expect(response.status).toBe(200);
    expect(query.update).toHaveBeenCalledWith({ name: "Voorkeur" });
    expect(query.eq).toHaveBeenNthCalledWith(1, "id", "22222222-2222-4222-8222-222222222222");
    expect(query.eq).toHaveBeenNthCalledWith(2, "project_id", "11111111-1111-4111-8111-111111111111");
  });

  it("rejects writes without the private-projects entitlement", async () => {
    const from = vi.fn();
    vi.mocked(getCloudIdentity).mockResolvedValue({ user: { id: "user-1" }, organization: null, entitlements: { features: [] } } as never);
    vi.mocked(createClient).mockResolvedValue({ from } as never);
    const response = await PATCH(new Request("http://localhost/api/projects/p/scenarios/s", { method: "PATCH", body: JSON.stringify({ name: "Voorkeur" }) }), context);
    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
});
