import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH } from "./route";
import { getCloudIdentity } from "@/lib/cloud/session";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/cloud/session", () => ({ getCloudIdentity: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
const context = { params: Promise.resolve({ projectId: "11111111-1111-4111-8111-111111111111", milestoneId: "22222222-2222-4222-8222-222222222222" }) };

describe("/api/projects/:projectId/milestones/:milestoneId", () => {
  beforeEach(() => { vi.mocked(getCloudIdentity).mockReset(); vi.mocked(createClient).mockReset(); });

  it("rejects cross-organization updates before database access", async () => {
    const from = vi.fn();
    vi.mocked(getCloudIdentity).mockResolvedValue({ user: { id: "user-1" }, organization: { id: "33333333-3333-4333-8333-333333333333" }, entitlements: { features: ["private-projects"] } } as never);
    vi.mocked(createClient).mockResolvedValue({ from } as never);
    const response = await PATCH(new Request("http://localhost/api/projects/p/milestones/m", { method: "PATCH", body: JSON.stringify({ status: "active", organizationId: "44444444-4444-4444-8444-444444444444" }) }), context);
    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects an invalid organization identifier before deleting", async () => {
    const response = await DELETE(new Request("http://localhost/api/projects/p/milestones/m?organizationId=invalid"), context);
    expect(response.status).toBe(400);
    expect(getCloudIdentity).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });
});
