import { ENTITY_TYPES } from "./entity-types";
import type { EntityType } from "./entity-types";
import type { EntityId, LayerId, WorldCommand, WorldCommandResult } from "./index";

export type WorldToolName =
  | "navigate_world"
  | "orbit_world_camera"
  | "select_world_entity"
  | "find_and_select_world_entity"
  | "clear_world_selection"
  | "set_world_layer"
  | "set_world_renderer"
  | "open_world_tool"
  | "set_world_task_preset"
  | "toggle_world_comparison"
  | "clear_world_comparison"
  | "analyze_world_drawing"
  | "rank_world_opportunities"
  | "create_world_project"
  | "create_world_scenario"
  | "estimate_world_scenario"
  | "generate_world_scenario_geometry"
  | "save_world_workspace"
  | "start_world_voice";

export interface WorldToolDefinition {
  name: WorldToolName;
  description: string;
  command: WorldCommand["type"];
  availability: "available" | "unavailable";
  inputSchema: Readonly<Record<string, unknown>>;
}

export interface WorldToolCall {
  id: string;
  name: WorldToolName | (string & {});
  arguments: unknown;
}

export type WorldToolResult =
  | { status: "executed"; toolCallId: string; result: WorldCommandResult }
  | { status: "invalid" | "unknown_tool"; toolCallId: string; message: string };

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", additionalProperties: false, properties, required });
const number = { type: "number" };
const string = { type: "string" };
const boolean = { type: "boolean" };
const entityTypes: readonly EntityType[] = ENTITY_TYPES;

export const worldToolRegistry: readonly WorldToolDefinition[] = [
  { name: "navigate_world", description: "Navigeer naar een WGS84-positie.", command: "navigate_to", availability: "available", inputSchema: objectSchema({ longitude: number, latitude: number, zoom: number, label: string }, ["longitude", "latitude"]) },
  { name: "orbit_world_camera", description: "Draai en kantel de 3D-camera rond het huidige kaartmiddelpunt.", command: "orbit_camera", availability: "available", inputSchema: objectSchema({ bearingDelta: number, pitchDelta: number, zoomDelta: number }, ["bearingDelta"]) },
  { name: "select_world_entity", description: "Selecteer een geladen wereldentiteit.", command: "select_entity", availability: "available", inputSchema: objectSchema({ entityId: string }, ["entityId"]) },
  { name: "find_and_select_world_entity", description: "Vind en selecteer deterministisch een passende geladen wereldentiteit.", command: "find_and_select_entity", availability: "available", inputSchema: objectSchema({ entityType: { enum: entityTypes }, query: string, minimumBuildYear: number, maximumBuildYear: number, minimumAreaM2: number, maximumAreaM2: number, candidateOnly: boolean }) },
  { name: "clear_world_selection", description: "Wis de huidige selectie.", command: "deselect_entity", availability: "available", inputSchema: objectSchema({}) },
  { name: "set_world_layer", description: "Wijzig de zichtbaarheid van een geregistreerde laag.", command: "set_layer_visibility", availability: "available", inputSchema: objectSchema({ layerId: string, visible: boolean }, ["layerId", "visible"]) },
  { name: "set_world_renderer", description: "Schakel tussen de 2D- en 3D-renderer.", command: "set_renderer", availability: "available", inputSchema: objectSchema({ renderer: { enum: ["map-2d", "world-3d"] } }, ["renderer"]) },
  { name: "open_world_tool", description: "Open een gereedschap in de vaste Lumen-sidebar.", command: "set_active_tool", availability: "available", inputSchema: objectSchema({ tool: { enum: ["explore", "search", "layers", "analyze", "draw", "compare", "projects"] } }, ["tool"]) },
  { name: "set_world_task_preset", description: "Activeer een taakweergave zonder camera of renderer te wijzigen.", command: "set_task_preset", availability: "available", inputSchema: objectSchema({ preset: { enum: ["living", "vacancy", "development", "delivery"] } }, ["preset"]) },
  { name: "toggle_world_comparison", description: "Voeg een geladen object toe aan of verwijder het uit de vergelijking.", command: "toggle_comparison_entity", availability: "available", inputSchema: objectSchema({ entityId: string }, ["entityId"]) },
  { name: "clear_world_comparison", description: "Wis de huidige objectvergelijking.", command: "clear_comparison", availability: "available", inputSchema: objectSchema({}) },
  { name: "analyze_world_drawing", description: "Open een bestaand getekend vlak als kandidaatlocatie in Analyse.", command: "analyze_drawing", availability: "available", inputSchema: objectSchema({ drawingId: string }, ["drawingId"]) },
  { name: "rank_world_opportunities", description: "Rangschik geladen kansen en selecteer de hoogst scorende.", command: "rank_opportunities", availability: "available", inputSchema: objectSchema({ limit: number }) },
  { name: "create_world_project", description: "Maak een sessieproject voor een geladen locatie.", command: "create_project", availability: "available", inputSchema: objectSchema({ name: string, siteId: string }, ["name"]) },
  { name: "create_world_scenario", description: "Maak een indicatief scenario binnen het actieve sessieproject.", command: "create_scenario", availability: "available", inputSchema: objectSchema({ name: string }, ["name"]) },
  { name: "estimate_world_scenario", description: "Bereken indicatieve capaciteit, bouwkosten en doorlooptijd.", command: "estimate_scenario", availability: "available", inputSchema: objectSchema({ siteAreaM2: number, coverageRatio: number, floors: number, grossToNetRatio: number, averageHomeAreaM2: number, constructionCostPerGfaM2: number, preparationMonths: number, constructionMonthsPer10kGfa: number }, ["siteAreaM2", "coverageRatio", "floors", "grossToNetRatio", "averageHomeAreaM2", "constructionCostPerGfaM2", "preparationMonths", "constructionMonthsPer10kGfa"]) },
  { name: "generate_world_scenario_geometry", description: "Genereer een indicatief WGS84-volume voor het actieve scenario.", command: "generate_scenario_geometry", availability: "available", inputSchema: objectSchema({}) },
  { name: "save_world_workspace", description: "Sla de actieve werkruimte op.", command: "save_workspace", availability: "unavailable", inputSchema: objectSchema({}) },
  { name: "start_world_voice", description: "Start een realtime spraaksessie.", command: "voice_start", availability: "unavailable", inputSchema: objectSchema({}) },
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
// Keep this module runtime-independent from the public barrel. `index.ts` re-exports
// the tool registry, so importing runtime helpers back from it creates an ESM cycle
// that can expose ENTITY_TYPES before its leaf module has initialized.
const entityId = (value: string) => value as EntityId;
const layerId = (value: string) => value as LayerId;

export function worldToolCommand(call: WorldToolCall): WorldCommand | string {
  if (!worldToolRegistry.some((tool) => tool.name === call.name)) return `Onbekende tool: ${call.name}.`;
  if (!isRecord(call.arguments)) return "Toolargumenten moeten een object zijn.";
  const args = call.arguments;
  if (call.name === "navigate_world") {
    if (!finite(args.longitude) || !finite(args.latitude) || args.longitude < -180 || args.longitude > 180 || args.latitude < -90 || args.latitude > 90) return "Ongeldige WGS84-positie.";
    if (args.zoom !== undefined && (!finite(args.zoom) || args.zoom < 1 || args.zoom > 22)) return "Zoom moet tussen 1 en 22 liggen.";
    return { type: "navigate_to", position: [args.longitude, args.latitude], ...(finite(args.zoom) ? { zoom: args.zoom } : {}), ...(text(args.label) ? { label: args.label } : {}) };
  }
  if (call.name === "orbit_world_camera") {
    if (!finite(args.bearingDelta) || Math.abs(args.bearingDelta) > 180) return "Rotatie moet tussen -180 en 180 graden liggen.";
    if (args.pitchDelta !== undefined && (!finite(args.pitchDelta) || Math.abs(args.pitchDelta) > 45)) return "Kanteling moet tussen -45 en 45 graden liggen.";
    if (args.zoomDelta !== undefined && (!finite(args.zoomDelta) || Math.abs(args.zoomDelta) > 3)) return "Zoomwijziging moet tussen -3 en 3 liggen.";
    return { type: "orbit_camera", bearingDelta: args.bearingDelta, ...(finite(args.pitchDelta) ? { pitchDelta: args.pitchDelta } : {}), ...(finite(args.zoomDelta) ? { zoomDelta: args.zoomDelta } : {}) };
  }
  if (call.name === "select_world_entity") return text(args.entityId) ? { type: "select_entity", entityId: entityId(args.entityId) } : "Een entityId is verplicht.";
  if (call.name === "find_and_select_world_entity") {
    if (args.entityType !== undefined && (typeof args.entityType !== "string" || !entityTypes.includes(args.entityType as EntityType))) return "Onbekend entiteitstype.";
    if (args.query !== undefined && (!text(args.query) || args.query.length > 120)) return "Zoektekst moet tussen 1 en 120 tekens bevatten.";
    const numericKeys = ["minimumBuildYear", "maximumBuildYear", "minimumAreaM2", "maximumAreaM2"] as const;
    if (numericKeys.some((key) => args[key] !== undefined && !finite(args[key]))) return "Numerieke zoekfilters zijn ongeldig.";
    if (args.candidateOnly !== undefined && typeof args.candidateOnly !== "boolean") return "candidateOnly moet waar of onwaar zijn.";
    if (finite(args.minimumBuildYear) && finite(args.maximumBuildYear) && args.minimumBuildYear > args.maximumBuildYear) return "Minimum bouwjaar mag niet na maximum bouwjaar liggen.";
    if (finite(args.minimumAreaM2) && finite(args.maximumAreaM2) && args.minimumAreaM2 > args.maximumAreaM2) return "Minimum oppervlakte mag niet groter zijn dan maximum oppervlakte.";
    if (args.entityType === undefined && args.query === undefined && numericKeys.every((key) => args[key] === undefined) && args.candidateOnly === undefined) return "Geef minimaal één zoekcriterium op.";
    return {
      type: "find_and_select_entity",
      ...(typeof args.entityType === "string" ? { entityType: args.entityType as EntityType } : {}),
      ...(text(args.query) ? { query: args.query.trim() } : {}),
      ...(finite(args.minimumBuildYear) ? { minimumBuildYear: args.minimumBuildYear } : {}),
      ...(finite(args.maximumBuildYear) ? { maximumBuildYear: args.maximumBuildYear } : {}),
      ...(finite(args.minimumAreaM2) ? { minimumAreaM2: args.minimumAreaM2 } : {}),
      ...(finite(args.maximumAreaM2) ? { maximumAreaM2: args.maximumAreaM2 } : {}),
      ...(typeof args.candidateOnly === "boolean" ? { candidateOnly: args.candidateOnly } : {}),
    };
  }
  if (call.name === "clear_world_selection") return { type: "deselect_entity" };
  if (call.name === "set_world_layer") return text(args.layerId) && typeof args.visible === "boolean" ? { type: "set_layer_visibility", layerId: layerId(args.layerId), visible: args.visible } : "layerId en visible zijn verplicht.";
  if (call.name === "set_world_renderer") return args.renderer === "map-2d" || args.renderer === "world-3d" ? { type: "set_renderer", renderer: args.renderer } : "Renderer moet map-2d of world-3d zijn.";
  if (call.name === "open_world_tool") return ["explore", "search", "layers", "analyze", "draw", "compare", "projects"].includes(String(args.tool)) ? { type: "set_active_tool", tool: args.tool as Extract<WorldCommand, { type: "set_active_tool" }>["tool"] } : "Onbekend sidebar-gereedschap.";
  if (call.name === "set_world_task_preset") return ["living", "vacancy", "development", "delivery"].includes(String(args.preset)) ? { type: "set_task_preset", preset: args.preset as Extract<WorldCommand, { type: "set_task_preset" }>["preset"] } : "Onbekende taakweergave.";
  if (call.name === "toggle_world_comparison") return text(args.entityId) ? { type: "toggle_comparison_entity", entityId: entityId(args.entityId) } : "Een entityId is verplicht.";
  if (call.name === "clear_world_comparison") return { type: "clear_comparison" };
  if (call.name === "analyze_world_drawing") return text(args.drawingId) ? { type: "analyze_drawing", drawingId: args.drawingId } : "Een drawingId is verplicht.";
  if (call.name === "rank_world_opportunities") return args.limit === undefined || finite(args.limit) && args.limit >= 1 && args.limit <= 20 ? { type: "rank_opportunities", ...(finite(args.limit) ? { limit: Math.floor(args.limit) } : {}) } : "Limit moet tussen 1 en 20 liggen.";
  if (call.name === "create_world_project") return text(args.name) ? { type: "create_project", name: args.name.trim(), ...(text(args.siteId) ? { siteId: entityId(args.siteId) } : {}) } : "Een projectnaam is verplicht.";
  if (call.name === "create_world_scenario") return text(args.name) ? { type: "create_scenario", name: args.name.trim() } : "Een scenarionaam is verplicht.";
  if (call.name === "estimate_world_scenario") {
    const keys = ["siteAreaM2", "coverageRatio", "floors", "grossToNetRatio", "averageHomeAreaM2", "constructionCostPerGfaM2", "preparationMonths", "constructionMonthsPer10kGfa"] as const;
    if (!keys.every((key) => finite(args[key]))) return "Alle scenario-invoer moet numeriek zijn.";
    return { type: "estimate_scenario", inputs: Object.fromEntries(keys.map((key) => [key, args[key]])) as unknown as Extract<WorldCommand, { type: "estimate_scenario" }>["inputs"] };
  }
  if (call.name === "generate_world_scenario_geometry") return { type: "generate_scenario_geometry" };
  if (call.name === "save_world_workspace") return { type: "save_workspace" };
  return { type: "voice_start" };
}

export function executeWorldTool(call: WorldToolCall, execute: (command: WorldCommand) => WorldCommandResult): WorldToolResult {
  const command = worldToolCommand(call);
  if (typeof command === "string") return { status: worldToolRegistry.some((tool) => tool.name === call.name) ? "invalid" : "unknown_tool", toolCallId: call.id, message: command };
  return { status: "executed", toolCallId: call.id, result: execute(command) };
}
