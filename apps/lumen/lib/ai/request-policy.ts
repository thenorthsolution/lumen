import { APICallError } from "ai";
import { isLocalAiDevelopmentAccess, lumenConfig } from "@/config/lumen";

type LocalAction = "chat" | "transcription";

const localWindows = new Map<LocalAction, { startedAt: number; count: number }>();

export function hasAiGatewayCredentials() {
  return Boolean(process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY);
}

export function useLocalAiDevelopmentAccess() {
  return isLocalAiDevelopmentAccess();
}

export function consumeLocalAiAllowance(action: LocalAction, now = Date.now()) {
  const maximum = action === "chat"
    ? lumenConfig.ai.limits.localChatsPerHour
    : lumenConfig.ai.limits.localTranscriptionsPerHour;
  const current = localWindows.get(action);
  if (!current || now - current.startedAt >= 60 * 60 * 1_000) {
    localWindows.set(action, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= maximum) return false;
  current.count += 1;
  return true;
}

export function providerErrorResponse(error: unknown, localProvider = false) {
  if (localProvider) {
    return Response.json({ error: "De lokale AI-provider is niet bereikbaar. Controleer of Ollama of Whisper lokaal draait en het geconfigureerde model beschikbaar is." }, { status: 503 });
  }
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 402) {
      return Response.json({ error: "De AI-capaciteit is tijdelijk op. Er worden geen extra kosten gemaakt." }, { status: 402 });
    }
    if (error.statusCode === 429) {
      return Response.json({ error: "Lumen AI is tijdelijk te druk. Probeer het straks opnieuw." }, { status: 429 });
    }
  }
  return Response.json({ error: "Lumen AI is tijdelijk niet beschikbaar." }, { status: 503 });
}

export function providerErrorMessage(error: unknown, localProvider = false) {
  if (localProvider) return "De lokale Ollama-provider is niet bereikbaar of het lokale model ontbreekt.";
  if (APICallError.isInstance(error) && error.statusCode === 402) {
    return "De AI-capaciteit is tijdelijk op. Er worden geen extra kosten gemaakt.";
  }
  if (APICallError.isInstance(error) && error.statusCode === 429) {
    return "Lumen AI is tijdelijk te druk. Probeer het straks opnieuw.";
  }
  return "Lumen AI is tijdelijk niet beschikbaar.";
}
