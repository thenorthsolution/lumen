import { afterEach, describe, expect, it, vi } from "vitest";

const { getCloudIdentity, reserveUsage, transcribe, transcriptionModel, transcribeWithLocalWhisper } = vi.hoisted(() => ({
  getCloudIdentity: vi.fn(),
  reserveUsage: vi.fn(),
  transcribe: vi.fn(),
  transcriptionModel: vi.fn(() => ({ modelId: "openai/whisper-1" })),
  transcribeWithLocalWhisper: vi.fn(),
}));

vi.mock("@/lib/cloud/session", () => ({ getCloudIdentity }));
vi.mock("@/lib/cloud/usage", () => ({ reserveUsage, settleUsage: vi.fn(), releaseUsage: vi.fn(), recordProviderCost: vi.fn() }));
vi.mock("@ai-sdk/gateway", () => ({ gateway: { transcriptionModel } }));
vi.mock("@/lib/ai/local-whisper", () => ({ transcribeWithLocalWhisper }));
vi.mock("ai", async () => ({ ...(await vi.importActual<Record<string, unknown>>("ai")), experimental_transcribe: transcribe }));

import { POST } from "./route";

function audioRequest() {
  const values = new Map<string, FormDataEntryValue>([["audio", {
    size: 3,
    type: "audio/webm",
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  } as File]]);
  return {
    headers: new Headers(),
    formData: async () => ({ get: (key: string) => values.get(key) ?? null }),
  } as unknown as Request;
}

describe("POST /api/ai/transcribe", () => {
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

  it("requires an account outside local development", async () => {
    getCloudIdentity.mockResolvedValue({ user: null, entitlements: { features: ["public-world"] } });
    const response = await POST(audioRequest());
    expect(response.status).toBe(401);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("transcribes Dutch audio locally without a database reservation", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("AI_GATEWAY_API_KEY", "local-test-key");
    getCloudIdentity.mockResolvedValue({ user: null, entitlements: { subject: { type: "anonymous" }, plan: { id: "public" }, features: ["public-world"] } });
    transcribeWithLocalWhisper.mockResolvedValue({ text: "Breng me naar Amsterdam", language: "nl", durationInSeconds: 2 });

    const response = await POST(audioRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ text: "Breng me naar Amsterdam", language: "nl" });
    expect(transcribeWithLocalWhisper).toHaveBeenCalledWith(expect.any(Uint8Array), "audio/webm");
    expect(transcriptionModel).not.toHaveBeenCalled();
    expect(reserveUsage).not.toHaveBeenCalled();
  });
});
