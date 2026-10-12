import type { WorldToolCall, WorldToolResult } from "./tools";

export type InteractionSource = "direct-ui" | "text" | "voice";
export type VoiceSessionStatus = "idle" | "connecting" | "listening" | "processing" | "unavailable" | "error";

export interface InteractionContext {
  workspaceId?: string;
  renderer: "map-2d" | "world-3d";
  selectedEntityId?: string;
  locale: string;
}

export interface VoiceSessionSnapshot {
  status: VoiceSessionStatus;
  provider: string | null;
  message?: string;
  transcript?: string;
}

export type VoiceSessionEvent =
  | { type: "status"; snapshot: VoiceSessionSnapshot }
  | { type: "transcript"; text: string; final: boolean }
  | { type: "tool_call"; call: WorldToolCall }
  | { type: "tool_result"; result: WorldToolResult };

export interface RealtimeVoiceAdapter {
  readonly name: string;
  readonly available: boolean;
  connect(context: InteractionContext, emit: (event: VoiceSessionEvent) => void): Promise<void>;
  sendToolResult(result: WorldToolResult): void | Promise<void>;
  disconnect(): void | Promise<void>;
}

export const unavailableVoiceSession = (message = "Realtime spraak is nog niet verbonden."): VoiceSessionSnapshot => ({ status: "unavailable", provider: null, message });
export const acceptsVoiceInput = (snapshot: VoiceSessionSnapshot) => snapshot.status === "listening";
