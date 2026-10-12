import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";
import { lumenConfig } from "@/config/lumen";
import { worldStore } from "@/lib/world-store";

function hasClientToolResult(message: UIMessage) {
  return message.parts.some((part) => part.type.startsWith("tool-")
    && (!("providerExecuted" in part) || part.providerExecuted !== true)
    && "state" in part
    && (part.state === "output-available" || part.state === "output-error"));
}

/** Continue completed client tools, while placing a hard ceiling on provider round-trips. */
export function shouldContinueWorldToolLoop(messages: UIMessage[]) {
  if (!lastAssistantMessageIsCompleteWithToolCalls({ messages })) return false;
  let completedClientToolSteps = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role === "user") break;
    if (message.role === "assistant" && hasClientToolResult(message)) completedClientToolSteps += 1;
  }
  return completedClientToolSteps <= lumenConfig.ai.limits.maxAutomaticToolContinuations;
}

const contextChangingTools = new Set(["navigate_world", "set_world_renderer"]);

/** Wait for a renderer-triggered building load without starting any request here. */
export async function waitForWorldContext(toolName: string) {
  if (!contextChangingTools.has(toolName)) return;
  const { worldActionGraceMs, worldActionWaitMs } = lumenConfig.ai.limits;
  await new Promise<void>((resolve) => {
    let settled = false;
    let sawLoading = worldStore.getState().layers.buildings?.status === "loading";
    let unsubscribe = () => {};
    const timers: { grace?: ReturnType<typeof setTimeout>; wait?: ReturnType<typeof setTimeout> } = {};
    const finish = () => {
      if (settled) return;
      settled = true;
      unsubscribe();
      if (timers.grace) clearTimeout(timers.grace);
      if (timers.wait) clearTimeout(timers.wait);
      resolve();
    };
    unsubscribe = worldStore.subscribe(() => {
      const status = worldStore.getState().layers.buildings?.status;
      if (status === "loading") sawLoading = true;
      else if (sawLoading && (status === "ready" || status === "error")) finish();
    });
    timers.grace = setTimeout(() => { if (!sawLoading) finish(); }, worldActionGraceMs);
    timers.wait = setTimeout(finish, worldActionWaitMs);
  });
}
