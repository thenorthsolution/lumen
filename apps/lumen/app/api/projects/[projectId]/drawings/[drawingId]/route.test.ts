import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PATCH } from "./route";
import { getCloudIdentity } from "@/lib/cloud/session";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/cloud/session", () => ({ getCloudIdentity: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const projectId = "11111111-1111-4111-8111-111111111111";
const drawingId = "22222222-2222-4222-8222-222222222222";
const organizationId = "33333333-3333-4333-8333-333333333333";
const context = { params: Promise.resolve({ projectId, drawingId }) };

describe("/api/projects/:projectId/drawings/:drawingId", () => {
  beforeEach(() => {
    vi.mocked(getCloudIdentity).mockReset();
    vi.mocked(createClient).mockReset();
  });

  it("updates complete geometry and scopes the mutation to project and drawing", async () => {
    const query: Record<string, unknown> = {};
    for (const method of ["update", "eq", "select"]) query[method] = vi.fn(() => query);
    query.maybeSingle = vi.fn().mockResolvedValue({ data: { id: drawingId }, error: null });
    const from = vi.fn(() => query);
    vi.mocked(getCloudIdentity).mockResolvedValue({ user: { id: "user-1" }, organization: null, entitlements: { features: ["private-projects"] } } as never);
    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await PATCH(new Request(`http://localhost/api/projects/${projectId}/drawings/${drawingId}`, {
      method: "PATCH",
      body: JSON.stringify({ kind: "rectangle", coordinates: [[6.1, 52.2], [6.2, 52.3]] }),
    }), context);

    expect(response.status).toBe(200);
    expect(query.update).toHaveBeenCalledWith({ geometry: { type: "Polygon", coordinates: [[[6.1, 52.2], [6.2, 52.2], [6.2, 52.3], [6.1, 52.3], [6.1, 52.2]]] } });
    expect(query.eq).toHaveBeenNthCalledWith(1, "id", drawingId);
    expect(query.eq).toHaveBeenNthCalledWith(2, "project_id", projectId);
  });

  it("rejects a patch for an organization outside the active identity before mutation", async () => {
    const from = vi.fn();
    vi.mocked(getCloudIdentity).mockResolvedValue({ user: { id: "user-1" }, organization: { id: organizationId }, entitlements: { features: ["private-projects"] } } as never);
    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await PATCH(new Request(`http://localhost/api/projects/${projectId}/drawings/${drawingId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Nieuw", organizationId: "44444444-4444-4444-8444-444444444444" }),
    }), context);

    expect(response.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects an invalid organization before deleting", async () => {
    const response = await DELETE(new Request(`http://localhost/api/projects/${projectId}/drawings/${drawingId}?organizationId=invalid`), context);
    expect(response.status).toBe(400);
    expect(getCloudIdentity).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });
});
