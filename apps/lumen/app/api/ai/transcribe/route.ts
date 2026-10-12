import { gateway } from "@ai-sdk/gateway";
import { experimental_transcribe as transcribe } from "ai";
import { hasEntitlement } from "@lumen/world";
import { lumenConfig } from "@/config/lumen";
import { consumeLocalAiAllowance, hasAiGatewayCredentials, providerErrorResponse, useLocalAiDevelopmentAccess } from "@/lib/ai/request-policy";
import { getCloudIdentity } from "@/lib/cloud/session";
import { recordProviderCost, releaseUsage, reserveUsage, settleUsage } from "@/lib/cloud/usage";
import { transcribeWithLocalWhisper } from "@/lib/ai/local-whisper";

export const maxDuration = 60;

const supportedAudioTypes = new Set([
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "video/webm",
]);

function isUploadedAudio(value: FormDataEntryValue | null): value is File {
  return typeof value === "object"
    && value !== null
    && "size" in value
    && typeof value.size === "number"
    && "arrayBuffer" in value
    && typeof value.arrayBuffer === "function";
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio") ?? null;
  const organizationId = form?.get("organizationId");
  if (!isUploadedAudio(audio) || audio.size === 0) return Response.json({ error: "Geen bruikbare audio ontvangen." }, { status: 400 });
  if (audio.size > lumenConfig.ai.limits.maxAudioBytes) return Response.json({ error: "De opname is te groot." }, { status: 413 });
  if (audio.type && !supportedAudioTypes.has(audio.type)) return Response.json({ error: "Dit audioformaat wordt niet ondersteund." }, { status: 415 });

  const identity = await getCloudIdentity(typeof organizationId === "string" ? organizationId : undefined);
  const localDevelopment = useLocalAiDevelopmentAccess();
  if (!identity.user && !localDevelopment) return Response.json({ error: "Log in om spraakbediening te gebruiken." }, { status: 401 });
  if (identity.user && !localDevelopment && !hasEntitlement(identity.entitlements, "core-ai")) return Response.json({ error: "Spraakbediening is niet beschikbaar binnen dit plan." }, { status: 403 });
  if (!localDevelopment && !hasAiGatewayCredentials()) return Response.json({ error: "De beheerde spraakprovider is nog niet geconfigureerd." }, { status: 503 });

  let reservationId: string | undefined;
  if (localDevelopment) {
    if (!consumeLocalAiAllowance("transcription")) return Response.json({ error: "De lokale spraaklimiet is bereikt. Probeer het later opnieuw." }, { status: 429 });
  } else {
    const subject = identity.entitlements.subject;
    if (!subject.id || subject.type === "anonymous") return Response.json({ error: "Geen usage-subject beschikbaar." }, { status: 403 });
    const reservation = await reserveUsage({ type: subject.type, id: subject.id }, "voice-minute", 1, request.headers.get("x-lumen-request-id") ?? crypto.randomUUID());
    if (reservation.status === "rejected" || !reservation.reservation_id) return Response.json({ error: "De beschikbare spraakcapaciteit is bereikt." }, { status: reservation.reason === "exhausted" ? 429 : 503 });
    reservationId = reservation.reservation_id;
  }

  const startedAt = Date.now();
  try {
    const audioBytes = new Uint8Array(await audio.arrayBuffer());
    const result = localDevelopment
      ? await transcribeWithLocalWhisper(audioBytes, audio.type)
      : await transcribe({
        model: gateway.transcriptionModel(lumenConfig.ai.transcriptionModel),
        audio: audioBytes,
        providerOptions: { openai: { language: "nl" } },
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(45_000),
      });
    const text = result.text.trim();
    if (!text) throw new Error("empty transcript");
    if (reservationId) {
      await settleUsage(reservationId, 1, { durationSeconds: result.durationInSeconds ?? null, language: result.language ?? "nl" });
      await recordProviderCost({ reservationId, provider: "vercel-ai-gateway", model: lumenConfig.ai.transcriptionModel, latencyMs: Date.now() - startedAt, status: "completed" });
    }
    return Response.json({ text, language: result.language ?? "nl", durationSeconds: result.durationInSeconds ?? null });
  } catch (error) {
    if (reservationId) {
      await releaseUsage(reservationId, error instanceof Error ? error.message : "transcription failure");
      await recordProviderCost({ reservationId, provider: "vercel-ai-gateway", model: lumenConfig.ai.transcriptionModel, latencyMs: Date.now() - startedAt, status: "failed" });
    }
    return providerErrorResponse(error, localDevelopment);
  }
}
