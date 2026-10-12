import type { UIMessage } from "ai";
import type { lumenServerWorldTools } from "./server-world-tools";

type LumenToolName = keyof typeof lumenServerWorldTools;

const CORE_LOCAL_TOOLS: LumenToolName[] = [
  "find_world_location", "navigate_world", "search_world_catalog",
  "inspect_world_catalog_entity", "find_and_select_world_entity",
  "select_world_entity", "clear_world_selection", "set_world_renderer",
  "open_world_tool",
];

function latestUserText(messages: UIMessage[]) {
  const message = [...messages].reverse().find((entry) => entry.role === "user");
  return message?.parts.flatMap((part) => part.type === "text" ? [part.text] : []).join(" ").toLocaleLowerCase("nl") ?? "";
}

/** Only expose intent-relevant tools to small local models. */
export function localActiveTools(messages: UIMessage[]): LumenToolName[] {
  const text = latestUserText(messages);
  const tools = new Set<LumenToolName>(CORE_LOCAL_TOOLS);
  if (/laag|toon|verberg|preset|wonen|leegstand|ontwikkel|realisatie/.test(text)) {
    tools.add("set_world_layer"); tools.add("set_world_task_preset");
  }
  if (/vergelijk/.test(text)) {
    tools.add("toggle_world_comparison"); tools.add("clear_world_comparison");
  }
  if (/teken|vlak|analyse/.test(text)) tools.add("analyze_world_drawing");
  if (/kans|rangschik/.test(text)) tools.add("rank_world_opportunities");
  if (/project|scenario|volume|capaciteit|bouwkosten/.test(text)) {
    tools.add("create_world_project"); tools.add("create_world_scenario");
    tools.add("estimate_world_scenario"); tools.add("generate_world_scenario_geometry");
  }
  if (/draai|roteer|kantel|orbit/.test(text)) tools.add("orbit_world_camera");
  return Array.from(tools);
}

/** Keep complete recent UI messages; catalog tools recover older factual context. */
export function boundedConversation<T extends UIMessage>(messages: T[], maximum = 8): T[] {
  if (messages.length <= maximum) return messages;
  const tail = messages.slice(-maximum);
  const firstUser = tail.findIndex((message) => message.role === "user");
  return firstUser < 0 ? messages.slice(-1) : tail.slice(firstUser);
}

type ParsedWorldContext = {
  renderer: string;
  camera: unknown;
  selectedEntityId: string | null;
  activeTool: string;
  taskPreset: string;
  comparisonEntityIds: string[];
  entities: Array<{ id: string; type: string; name: string; relatedEntityIds: string[]; properties: Record<string, unknown>; sources: unknown[] }>;
  entityCounts: Record<string, number>;
  layers: Array<{ id: string; visible: boolean; status: string; error?: string }>;
  drawings: Array<{ id: string; name: string; kind: string; areaSquareMeters: number; lengthMeters: number }>;
  selectedAnalysis?: { suitability: { conclusion: string; dimensions: Array<{ dimension: string; status: string; confidence: string }>; blockers: Array<{ code: string; label: string; severity: string }> } } | null;
  project: unknown;
  milestones: unknown[];
  scenario: unknown;
};

/** Minimal operational snapshot for models with a 4k context window. */
export function compactLocalWorldContext(context: ParsedWorldContext) {
  return {
    renderer: context.renderer, camera: context.camera, selectedEntityId: context.selectedEntityId,
    activeTool: context.activeTool, taskPreset: context.taskPreset,
    comparisonEntityIds: context.comparisonEntityIds,
    entities: context.entities.slice(0, 3).map(({ id, type, name, relatedEntityIds, properties, sources }) => ({
      id, type, name, relatedEntityIds: relatedEntityIds.slice(0, 10), properties,
      sources: sources.slice(0, 1),
    })),
    entityCounts: context.entityCounts,
    layers: context.layers.map(({ id, visible, status, error }) => ({ id, visible, status, ...(error ? { error } : {}) })),
    drawings: context.drawings.slice(0, 3),
    selectedAnalysis: context.selectedAnalysis ? {
      conclusion: context.selectedAnalysis.suitability.conclusion,
      dimensions: context.selectedAnalysis.suitability.dimensions.map(({ dimension, status, confidence }) => ({ dimension, status, confidence })),
      blockers: context.selectedAnalysis.suitability.blockers.map(({ code, label, severity }) => ({ code, label, severity })).slice(0, 5),
    } : null,
    project: context.project,
    milestones: context.milestones.slice(0, 5),
    scenario: context.scenario,
  };
}
