/**
 * Product policy belongs in source control. Environment variables are reserved
 * for credentials and deployment bindings.
 */
export const lumenConfig = {
  ai: {
    enabled: true,
    allowLocalDevelopmentAccess: true,
    model: "openai/gpt-5-nano",
    transcriptionModel: "openai/whisper-1",
    local: {
      chatModel: "qwen3:4b-instruct-2507-q4_K_M",
      maxOutputTokens: 360,
      requestTimeoutMs: 30_000,
      ollamaBaseUrl: "http://127.0.0.1:11434/v1",
      whisperCommand: "whisper",
      whisperModel: "small",
      whisperTimeoutMs: 90_000,
    },
    limits: {
      maxRequestBytes: 128_000,
      maxMessages: 50,
      maxOutputTokens: 1_200,
      maxAudioBytes: 8 * 1024 * 1024,
      maxRecordingSeconds: 60,
      localChatsPerHour: 30,
      localTranscriptionsPerHour: 20,
      maxAutomaticToolContinuations: 3,
      worldActionGraceMs: 350,
      worldActionWaitMs: 5_000,
    },
  },
  world: {
    locationSearch: {
      endpoint: "https://api.pdok.nl/kadaster/location-api/v1/search",
      maxResults: 5,
      timeoutMs: 4_500,
      cacheSeconds: 86_400,
    },
  },
} as const;

/** Local AI bypasses account/usage persistence, never deployed authorization. */
export function isLocalAiDevelopmentAccess() {
  return lumenConfig.ai.enabled
    && lumenConfig.ai.allowLocalDevelopmentAccess
    && process.env.NODE_ENV === "development"
    && !process.env.VERCEL;
}
