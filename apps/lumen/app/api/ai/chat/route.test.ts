import { afterEach, describe, expect, it, vi } from "vitest";
import type * as AiSdk from "ai";

const { getCloudIdentity, reserveUsage, streamText } = vi.hoisted(() => ({ getCloudIdentity: vi.fn(), reserveUsage: vi.fn(), streamText: vi.fn() }));
vi.mock("@/lib/cloud/session", () => ({ getCloudIdentity }));
vi.mock("@/lib/cloud/usage", () => ({ reserveUsage, settleUsage: vi.fn(), releaseUsage: vi.fn(), recordProviderCost: vi.fn() }));
vi.mock("@/lib/ai/catalog-search-server", () => ({ searchAuthorizedSpatialCatalog: vi.fn(), inspectAuthorizedCatalogEntity: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({ ...await importOriginal<typeof AiSdk>(), streamText }));

import { POST } from "./route";

const request = () => new Request("http://localhost/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Hallo" }] }] }) });

describe("POST /api/ai/chat", () => {
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

  it("requires an account before reserving provider usage", async () => {
    getCloudIdentity.mockResolvedValue({ user: null, entitlements: { features: ["public-world"] } });
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(reserveUsage).not.toHaveBeenCalled();
  });

  it("reports missing provider configuration truthfully", async () => {
    getCloudIdentity.mockResolvedValue({ user: { id: "user-1" }, entitlements: { subject: { type: "personal", id: "user-1" }, plan: { id: "personal" }, features: ["core-ai"] } });
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("niet geconfigureerd");
    expect(reserveUsage).not.toHaveBeenCalled();
  });

  it("preserves controlled canonical relationships in the model context", async () => {
    getCloudIdentity.mockResolvedValue({ user: { id: "user-1" }, entitlements: { subject: { type: "personal", id: "user-1" }, plan: { id: "personal" }, features: ["core-ai"] } });
    reserveUsage.mockResolvedValue({ status: "reserved", reservation_id: "reservation-1" });
    streamText.mockReturnValue({ toUIMessageStreamResponse: () => new Response("ok"), totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }) });
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    const context = {
      renderer: "map-2d", camera: { longitude: 6.15, latitude: 52.25, zoom: 12 }, selectedEntityId: "cbs-district-WK015005", activeTool: "explore", taskPreset: "living", comparisonEntityIds: [],
      entities: [{ id: "cbs-district-WK015005", type: "district", name: "Keizerslanden", relatedEntityIds: ["cbs-municipality-GM0150"], properties: { code: "WK015005" }, facets: [], sources: [] }],
      entityCounts: { district: 1 }, layers: [], drawings: [], project: null, milestones: [], scenario: null,
      selectedAnalysis: { subjectId: "cbs-district-WK015005", suitability: { conclusion: "needs-research", assessedAt: "2026-09-11T00:00:00.000Z", methodVersion: "known-input-suitability-1.0.0", dimensions: ["planning", "physical", "environment-safety", "accessibility", "market-program", "deliverability"].map((dimension) => ({ dimension, status: "needs-research", score: null, confidence: "unknown", metrics: [] })), blockers: [] }, accessibility: null },
    };
    const response = await POST(new Request("http://localhost/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context, messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "Welke gemeente hoort hierbij?" }] }] }) }));

    expect(response.status).toBe(200);
    expect(streamText).toHaveBeenCalledOnce();
    expect(String(streamText.mock.calls[0]?.[0]?.system)).toContain('"relatedEntityIds":["cbs-municipality-GM0150"]');
    expect(String(streamText.mock.calls[0]?.[0]?.system)).toContain('"selectedAnalysis":{"subjectId":"cbs-district-WK015005"');
    expect(String(streamText.mock.calls[0]?.[0]?.system)).toContain("search_world_catalog");
    expect(streamText.mock.calls[0]?.[0]?.tools).toHaveProperty("search_world_catalog");
    expect(streamText.mock.calls[0]?.[0]?.tools).toHaveProperty("inspect_world_catalog_entity");
  });
});
