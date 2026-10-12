"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ChatThread, type ChatThreadMessage } from "@lumen/ui/primitives/ChatComposer";
import PromptBar, { type PromptBarCommand, type PromptBarModel, type PromptBarSource } from "@lumen/ui/primitives/PromptBar";
import type { TaskRow } from "@lumen/ui/primitives/TaskRows";
import { Button } from "@lumen/ui/components/button";
import { Collapsible } from "@lumen/ui/components/collapsible";
import { Separator } from "@lumen/ui/components/separator";
import { executeWorldTool, type WorldCommandResult, type WorldEntity, type WorldToolCall } from "@lumen/world";
import { useWorldSelector, worldStore } from "@/lib/world-store";
import type { LumenAIMessage } from "@/lib/ai/world-tools";
import { shouldContinueWorldToolLoop, waitForWorldContext } from "@/lib/ai/tool-loop";
import { usePushToTalk } from "@/lib/ai/use-push-to-talk";
import { buildWorldAIContext } from "@/lib/ai/world-context";
import { Icon } from "./Icon";

const AgentActivityStack = dynamic(() => import("./AgentActivityStack").then((module) => module.AgentActivityStack), { ssr: false });

interface AgentSidebarProps {
  onResult: (result: WorldCommandResult) => void;
  aiEnabled: boolean;
  organizationId?: string;
}

interface ConversationEntry {
  id: string;
  role: "assistant" | "user";
  text: string;
}

type BuildingSearchResponse = { entities?: WorldEntity[]; error?: string };

const suggestions = ["Breng me naar een Nederlandse locatie", "Selecteer het gebouw", "Open de 3D-weergave"];
const commandItems: PromptBarCommand[] = [
  { key: "navigate-location", name: "/locatie", desc: "Navigeer naar een Nederlands adres of plaats", value: "Breng me naar " },
  { key: "select-building", name: "/gebouw", desc: "Selecteer het eerste geladen BAG-pand", value: "Selecteer het gebouw" },
  { key: "open-3d", name: "/3d", desc: "Schakel naar de open 3D-weergave", value: "Open de 3D-weergave" },
  { key: "create-project", name: "/project", desc: "Maak een lokaal sessieproject", value: "Maak een nieuw project" },
  { key: "rank-opportunities", name: "/kansen", desc: "Rangschik de geladen kansen", value: "Rangschik de beste kansen" },
];
function currentWorldRequestBody(organizationId?: string) {
  const world = worldStore.getState();
  return {
    organizationId,
    context: buildWorldAIContext(world),
  };
}

export function AgentSidebar({ onResult, aiEnabled, organizationId }: AgentSidebarProps) {
  const [open, setOpen] = useState(false);
  const [atLatest, setAtLatest] = useState(true);
  const [conversation, setConversation] = useState<ConversationEntry[]>([
    { id: "welcome", role: "assistant", text: aiEnabled ? "Waar wil je naar kijken?" : "Klaar voor een lokale wereldopdracht." },
  ]);
  const messageId = useRef(0);
  const historyRoot = useRef<HTMLDivElement>(null);
  const organizationIdRef = useRef(organizationId);
  organizationIdRef.current = organizationId;
  const [aiTransport] = useState(() => new DefaultChatTransport<LumenAIMessage>({
    api: "/api/ai/chat",
    prepareSendMessagesRequest: ({ messages, body, headers }) => {
      const requestHeaders = new Headers(headers);
      requestHeaders.set("x-lumen-request-id", crypto.randomUUID());
      return { headers: requestHeaders, body: { ...body, ...currentWorldRequestBody(organizationIdRef.current), messages } };
    },
    fetch: async (input, init) => {
      const response = await globalThis.fetch(input, init);
      if (response.ok) return response;
      const payload = await response.clone().json().catch(() => null) as { error?: string } | null;
      if (!payload?.error) return response;
      return new Response(payload.error, { status: response.status, statusText: response.statusText });
    },
  }));
  const renderer = useWorldSelector((world) => world.renderer);
  const selectedEntityId = useWorldSelector((world) => world.selectedEntityId);
  const selectedEntityName = useWorldSelector((world) => world.selectedEntityId ? world.entities[world.selectedEntityId]?.name ?? null : null);
  const activeProjectName = useWorldSelector((world) => world.activeProject?.name ?? null);
  const contextItems = useMemo<PromptBarSource[]>(() => {
    const items: PromptBarSource[] = [
      { key: "current-world", name: "Huidige kaart", desc: renderer === "world-3d" ? "Open 3D-weergave" : "Open 2D-weergave", value: "@huidige-kaart", glyph: "globe" },
    ];
    if (selectedEntityId && selectedEntityName) items.push({ key: "selected-entity", name: selectedEntityName, desc: "Geselecteerd object", value: `@${selectedEntityName.replace(/\s+/g, "-")}`, glyph: "layers" });
    if (activeProjectName) items.push({ key: "active-project", name: activeProjectName, desc: "Actief project", value: `@${activeProjectName.replace(/\s+/g, "-")}`, glyph: "chart" });
    return items;
  }, [activeProjectName, renderer, selectedEntityId, selectedEntityName]);
  const models = useMemo<PromptBarModel[]>(() => [
    aiEnabled
      ? { key: "lumen-ai", name: "Lumen AI", tag: "Actief" }
      : { key: "local", name: "Lokaal", tag: "Opdrachten" },
  ], [aiEnabled]);
  const chat = useChat<LumenAIMessage>({
    transport: aiTransport,
    sendAutomaticallyWhen: ({ messages }) => shouldContinueWorldToolLoop(messages),
    async onToolCall({ toolCall }) {
      if (toolCall.dynamic) return;
      // PDOK location lookup executes on the server. Its validated result is streamed
      // back before the model emits the client-side navigation command.
      if (toolCall.toolName === "find_world_location" || toolCall.toolName === "search_world_catalog" || toolCall.toolName === "inspect_world_catalog_entity") return;
      if (toolCall.toolName === "find_and_select_world_entity" && toolCall.input.entityType === "building") {
        const { camera } = worldStore.getState();
        const [longitude, latitude] = camera.center;
        const bbox = [longitude - .012, latitude - .009, longitude + .012, latitude + .009].map((value) => value.toFixed(6)).join(",");
        try {
          const response = await fetch(`/api/world/buildings?bbox=${bbox}`, { signal: AbortSignal.timeout(8_000) });
          const data = await response.json() as BuildingSearchResponse;
          if (response.ok && data.entities?.length) worldStore.replaceEntitiesOfType("building", data.entities);
        } catch {
          // The deterministic selector below will return a truthful unavailable
          // result when the on-demand BAG enrichment cannot be completed.
        }
      }
      const outcome = executeWorldTool({ id: toolCall.toolCallId, name: toolCall.toolName, arguments: toolCall.input }, worldStore.execute);
      const output = outcome.status === "executed"
        ? { status: outcome.result.status, message: outcome.result.message }
        : { status: "rejected" as const, message: outcome.message };
      if (outcome.status === "executed") onResult(outcome.result);
      await waitForWorldContext(toolCall.toolName);
      chat.addToolOutput({ tool: toolCall.toolName, toolCallId: toolCall.toolCallId, output });
    },
  });

  const streamedConversation: ConversationEntry[] = chat.messages.flatMap((entry) => {
    const lines = entry.parts.flatMap((part) => {
      if (part.type === "text" && part.text.trim()) return [part.text];
      if (part.type.startsWith("tool-") && "state" in part && part.state === "output-available" && part.output && typeof part.output === "object" && "message" in part.output) return [String(part.output.message)];
      return [];
    });
    return lines.length ? [{ id: entry.id, role: entry.role === "user" ? "user" as const : "assistant" as const, text: lines.join("\n") }] : [];
  });
  const visibleConversation = [...conversation, ...streamedConversation];
  const chatBusy = chat.status === "submitted" || chat.status === "streaming";
  const threadMessages: ChatThreadMessage[] = visibleConversation.map((entry) => ({
    id: entry.id,
    role: entry.role,
    body: entry.text,
  }));
  const taskRows: TaskRow[] = chatBusy ? [{
    key: "active-analysis",
    label: chat.status === "submitted" ? "Opdracht voorbereiden" : "Wereld analyseren",
    amount: "Bezig",
    status: "running",
    step: 1,
    details: [
      { label: "Kaartcontext en bronnen verwerken", meta: renderer === "world-3d" ? "3D" : "2D" },
      { label: "Antwoord samenstellen", meta: "live" },
    ],
  }] : [];

  const viewport = () => historyRoot.current;
  const scrollToLatest = () => {
    const element = viewport();
    if (!element) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollTo({ top: element.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
    setAtLatest(true);
  };
  const append = (role: ConversationEntry["role"], text: string, dedupeAdjacent = false) => {
    messageId.current += 1;
    const id = `local-${messageId.current}`;
    setConversation((entries) => {
      const latest = entries.at(-1);
      if (dedupeAdjacent && latest?.role === role && latest.text === text) return entries;
      return [...entries, { id, role, text }];
    });
  };

  useEffect(() => {
    if (!open) return;
    const element = viewport();
    if (!element) return;
    const updatePosition = () => setAtLatest(element.scrollHeight - element.scrollTop - element.clientHeight < 28);
    element.addEventListener("scroll", updatePosition, { passive: true });
    updatePosition();
    return () => element.removeEventListener("scroll", updatePosition);
  }, [open]);

  useEffect(() => {
    if (!open || !atLatest) return;
    const frame = requestAnimationFrame(scrollToLatest);
    return () => cancelAnimationFrame(frame);
  }, [conversation, streamedConversation.length, open, atLatest]);

  const finish = (text: string, result?: WorldCommandResult, dedupeAdjacent = false) => {
    append("assistant", text, dedupeAdjacent);
    if (result) onResult(result);
  };

  const run = (prompt: string) => {
    append("user", prompt);
    let call: WorldToolCall | null = null;
    if (/select|gebouw|pand/i.test(prompt)) {
      call = { id: crypto.randomUUID(), name: "find_and_select_world_entity", arguments: { entityType: "building" } };
    }
    else if (/beste kans|beste kansen|rangschik|rank/i.test(prompt)) call = { id: crypto.randomUUID(), name: "rank_world_opportunities", arguments: { limit: 5 } };
    else if (/maak.*project|nieuw project|project aan/i.test(prompt)) call = { id: crypto.randomUUID(), name: "create_world_project", arguments: { name: "Nieuw ruimtelijk project", ...(worldStore.getState().selectedEntityId ? { siteId: worldStore.getState().selectedEntityId } : {}) } };
    else if (/maak.*scenario|nieuw scenario|scenario aan/i.test(prompt)) call = { id: crypto.randomUUID(), name: "create_world_scenario", arguments: { name: "Basisscenario" } };
    else if (/bereken.*scenario|scenario bereken|capaciteit|bouwkosten/i.test(prompt)) {
      const selected = worldStore.getState().selectedEntityId ? worldStore.getState().entities[worldStore.getState().selectedEntityId!] : null;
      const rawArea = selected?.properties.areaM2 ?? selected?.properties.kadastraleOppervlakteM2 ?? selected?.properties.oppervlakte;
      const siteAreaM2 = Number(rawArea);
      if (rawArea === null || rawArea === undefined || rawArea === "" || !Number.isFinite(siteAreaM2) || siteAreaM2 <= 0) {
        finish("Ik kan nog niet rekenen: voor het geselecteerde object ontbreekt een herleidbare oppervlakte. Selecteer een perceel met oppervlakte of analyseer eerst een getekend vlak.");
        return;
      }
      call = { id: crypto.randomUUID(), name: "estimate_world_scenario", arguments: { siteAreaM2, coverageRatio: .4, floors: 5, grossToNetRatio: .78, averageHomeAreaM2: 75, constructionCostPerGfaM2: 2_500, preparationMonths: 24, constructionMonthsPer10kGfa: 14 } };
    }
    else if (/genereer.*volume|plaats.*volume|toon.*volume|massing/i.test(prompt)) call = { id: crypto.randomUUID(), name: "generate_world_scenario_geometry", arguments: {} };
    else if (/3d/i.test(prompt)) call = { id: crypto.randomUUID(), name: "set_world_renderer", arguments: { renderer: "world-3d" } };
    if (!call) { finish("Opdracht niet herkend. Probeer een locatie, gebouw of weergave."); return; }
    const outcome = executeWorldTool(call, worldStore.execute);
    if (outcome.status !== "executed") { finish(outcome.message); return; }
    finish(outcome.result.message, outcome.result);
  };

  const submit = (value: string) => {
    const prompt = value.trim();
    if (!prompt) return;
    if (/^(hallo|hoi|hey|goedemorgen|goedemiddag|goedenavond)[!.?\s]*$/i.test(prompt)) {
      append("user", prompt);
      append("assistant", "Hallo! Waar kan ik je mee helpen?");
      return;
    }
    if (aiEnabled) { void chat.sendMessage({ text: prompt }); return; }
    run(prompt);
  };

  const voice = usePushToTalk({
    enabled: aiEnabled,
    organizationId,
    onTranscript: submit,
    onError: (message) => { setOpen(true); finish(message, undefined, true); },
  });
  const assistantBusy = chatBusy || voice.state === "processing";
  const visibleTasks: TaskRow[] = voice.state === "processing" ? [{
    key: "voice-transcription",
    label: "Nederlandse spraak verwerken",
    amount: "Bezig",
    status: "running",
    step: 1,
    details: [{ label: "Opname omzetten naar een wereldopdracht", meta: "nl-NL" }],
  }] : taskRows;

  return (
    <Collapsible className="agentDock" open={open} onOpenChange={setOpen} aria-label="Lumen AI">
      <div className="agentAssistantSurface" data-expanded={open}>
        <div className="agentChatExpansion" aria-hidden={!open} inert={open ? undefined : true}>
          <div className="agentChatExpansionInner">
            <header className="agentDockHeader">
              <div className="agentDockTitle">
                <span className="agentDockMark" aria-hidden="true" />
                <div>
                  <strong>{aiEnabled ? "Lumen AI" : "Lumen"}</strong>
                  <span>Ruimtelijke assistent · Nederland</span>
                </div>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Sluit gesprek"><Icon name="close" /></Button>
            </header>
            <Separator />
            <div className="agentHistoryRoot">
              <div className="agentDockHistory" ref={historyRoot}>
                <ChatThread className="agentMessages" messages={threadMessages}>
                  <AgentActivityStack tasks={visibleTasks} />
                  {chat.error ? <div className="agentInlineError">{chat.error.message || "De beheerde assistent is tijdelijk niet beschikbaar."}</div> : null}
                </ChatThread>
              </div>
              {!atLatest ? <Button className="jumpLatest" variant="secondary" size="sm" onClick={scrollToLatest}>Naar nieuwste</Button> : null}
            </div>
            <div className="agentSuggestions" aria-label="Voorbeeldopdrachten">
              {suggestions.map((prompt) => <Button key={prompt} variant="outline" size="sm" onClick={() => { if (aiEnabled) { setOpen(true); void chat.sendMessage({ text: prompt }); } else run(prompt); }}>{prompt}</Button>)}
            </div>
          </div>
        </div>
        <div className="agentComposerStage">
          {!open && visibleTasks.length ? <AgentActivityStack tasks={visibleTasks} /> : null}
          <PromptBar
            demo={false}
            variant="Rounded"
            placeholder="Vraag Lumen of voer een opdracht uit"
            ariaLabel="Geef Lumen een opdracht"
            onSend={submit}
            onDictation={() => void voice.toggle()}
            dictationState={voice.state}
            onToggleHistory={() => setOpen((value) => !value)}
            historyOpen={open}
            effects={false}
            busy={assistantBusy}
            sources={contextItems}
            commands={commandItems}
            models={models}
          />
        </div>
      </div>
    </Collapsible>
  );
}
