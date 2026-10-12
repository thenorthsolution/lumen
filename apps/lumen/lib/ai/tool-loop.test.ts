import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";
import { worldStore } from "@/lib/world-store";
import { shouldContinueWorldToolLoop, waitForWorldContext } from "./tool-loop";

const userMessage = { id: "user-1", role: "user", parts: [{ type: "text", text: "Ga naar Deventer" }] } as UIMessage;
const clientToolMessage = (index: number) => ({
  id: `assistant-${index}`,
  role: "assistant",
  parts: [
    { type: "step-start" },
    { type: "tool-navigate_world", toolCallId: `tool-${index}`, state: "output-available", input: { longitude: 6.15, latitude: 52.25 }, output: { status: "success", message: "Camera bijgewerkt." } },
  ],
}) as UIMessage;

describe("client world-tool loop", () => {
  beforeEach(() => { vi.useFakeTimers(); worldStore.reset(); });
  afterEach(() => vi.useRealTimers());

  it("continues completed client tools but stops after the configured ceiling", () => {
    expect(shouldContinueWorldToolLoop([userMessage, clientToolMessage(1)])).toBe(true);
    expect(shouldContinueWorldToolLoop([userMessage, clientToolMessage(1), clientToolMessage(2), clientToolMessage(3)])).toBe(true);
    expect(shouldContinueWorldToolLoop([userMessage, clientToolMessage(1), clientToolMessage(2), clientToolMessage(3), clientToolMessage(4)])).toBe(false);
  });

  it("does not continue ordinary assistant text", () => {
    const answer = { id: "answer", role: "assistant", parts: [{ type: "text", text: "Klaar." }] } as UIMessage;
    expect(shouldContinueWorldToolLoop([userMessage, answer])).toBe(false);
  });

  it("waits for a context-changing building load to settle", async () => {
    const waiting = waitForWorldContext("navigate_world");
    worldStore.setLayerStatus("buildings", "loading");
    worldStore.setLayerStatus("buildings", "ready");
    await waiting;
  });

  it("returns after the grace period when no building load starts", async () => {
    const waiting = waitForWorldContext("navigate_world");
    await vi.advanceTimersByTimeAsync(350);
    await waiting;
  });
});
