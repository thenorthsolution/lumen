import type { ScenarioEstimate, ScenarioInputs } from "./scenario-engine";
import type { EntityType } from "./entity-types";

export { ENTITY_TYPES, type EntityType } from "./entity-types";

export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type EntityId = Brand<string, "EntityId">;
export type LayerId = Brand<string, "LayerId">;
export type AnnotationId = Brand<string, "AnnotationId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type ProjectId = Brand<string, "ProjectId">;
export type ScenarioId = Brand<string, "ScenarioId">;
export type DrawingId = Brand<string, "DrawingId">;

export type Position = readonly [longitude: number, latitude: number, height?: number];
export type Bounds = readonly [west: number, south: number, east: number, north: number];

export interface Provenance {
  sourceId: string;
  sourceLabel: string;
  sourceUrl?: string;
  retrievedAt: string;
  confidence: "verified" | "high" | "medium" | "low" | "unknown";
  assumptions?: readonly string[];
  limitations?: readonly string[];
  methodVersion?: string;
}

export interface GeometryReference {
  kind: "point" | "line" | "polygon" | "multipolygon" | "external";
  center?: Position;
  bounds?: Bounds;
  uri?: string;
  coordinateSystem: "WGS84";
}

export interface WorldEntity {
  id: EntityId;
  type: EntityType;
  name: string;
  description?: string;
  geometry?: GeometryReference;
  provenance: readonly Provenance[];
  properties: Readonly<Record<string, string | number | boolean | null>>;
  relatedEntityIds?: readonly EntityId[];
}

export type OpportunityKind = "vacancy-conversion" | "infill" | "redevelopment" | "transformation";
export type OpportunityTier = "high" | "medium" | "low" | "excluded";

export interface OpportunityProperties extends Readonly<Record<string, string | number | boolean | null>> {
  kind: OpportunityKind;
  tier: OpportunityTier;
  score: number;
  maximumScore: number;
  methodology: string;
  candidate: boolean;
  estimatedHomes: number | null;
}

export interface OpportunityEvidence {
  kind: "vacancy" | "space" | "pipeline";
  label: string;
  score: number;
  weight: number;
  confidence: Provenance["confidence"];
  rationale: string;
  provenance: Provenance;
}

export type OpportunityEntity = WorldEntity & {
  type: "opportunity";
  properties: OpportunityProperties;
  evidence: readonly OpportunityEvidence[];
};

export interface CameraState {
  center: Position;
  zoom: number;
  bearing: number;
  pitch: number;
}

export type RendererMode = "map-2d" | "world-3d";
export type LayerStatus = "idle" | "loading" | "ready" | "error";

export interface LayerDefinition {
  id: LayerId;
  label: string;
  description: string;
  category: "context" | "opportunity" | "constraint" | "project";
  defaultVisible: boolean;
  supportedRenderers: readonly RendererMode[];
  sourceIds: readonly string[];
  coverage: "national" | "regional" | "local";
  minZoom?: number;
  maxZoom?: number;
}

export interface LayerRuntimeState {
  visible: boolean;
  status: LayerStatus;
  error?: string;
}

export interface Annotation {
  id: AnnotationId;
  label: string;
  geometry: GeometryReference;
  provenance: Provenance;
}

export interface WorkspaceReference { id: WorkspaceId; name: string; }
export interface ProjectReference { id: ProjectId; name: string; siteId?: EntityId; persistence?: "session" | "saved"; }
export interface ScenarioReference { id: ScenarioId; projectId: ProjectId; name: string; }

export interface WorldState {
  camera: CameraState;
  renderer: RendererMode;
  selectedEntityId: EntityId | null;
  hoveredEntityId: EntityId | null;
  entities: Readonly<Record<string, WorldEntity>>;
  layers: Readonly<Record<string, LayerRuntimeState>>;
  annotations: readonly Annotation[];
  workspace: WorkspaceReference | null;
  activeProject: ProjectReference | null;
  activeScenario: ScenarioReference | null;
  scenarioEstimate: ScenarioEstimate | null;
  scenarioObjects: readonly import("./projects").ScenarioObject[];
  projectMilestones: readonly import("./data").ProjectMilestone[];
  activeTool: import("./data").WorkspaceTool;
  taskPreset: import("./data").TaskPresetId;
  drawings: readonly import("./data").DrawingFeature[];
  drawingMode: import("./data").DrawingKind | null;
  editingDrawingId: string | null;
  drawingUndoStack: readonly (readonly import("./data").DrawingFeature[])[];
  drawingRedoStack: readonly (readonly import("./data").DrawingFeature[])[];
  comparisonEntityIds: readonly EntityId[];
  execution: { status: "idle" | "running" | "complete" | "error"; message?: string };
}

export type WorldCommand =
  | { type: "navigate_to"; position: Position; zoom?: number; label?: string }
  | { type: "set_camera"; camera: CameraState }
  | { type: "orbit_camera"; bearingDelta: number; pitchDelta?: number; zoomDelta?: number }
  | { type: "select_entity"; entityId: EntityId }
  | { type: "find_and_select_entity"; entityType?: EntityType; query?: string; minimumBuildYear?: number; maximumBuildYear?: number; minimumAreaM2?: number; maximumAreaM2?: number; candidateOnly?: boolean }
  | { type: "deselect_entity" }
  | { type: "set_layer_visibility"; layerId: LayerId; visible: boolean }
  | { type: "set_renderer"; renderer: RendererMode }
  | { type: "set_active_tool"; tool: import("./data").WorkspaceTool }
  | { type: "set_task_preset"; preset: import("./data").TaskPresetId }
  | { type: "set_drawing_mode"; mode: import("./data").DrawingKind | null }
  | { type: "set_editing_drawing"; drawingId: string | null }
  | { type: "add_drawing"; drawing: import("./data").DrawingFeature }
  | { type: "update_drawing"; drawingId: string; changes: Partial<Pick<import("./data").DrawingFeature, "name" | "note" | "color" | "coordinates">> }
  | { type: "delete_drawing"; drawingId: string }
  | { type: "undo_drawing_change" }
  | { type: "redo_drawing_change" }
  | { type: "analyze_drawing"; drawingId: string }
  | { type: "toggle_comparison_entity"; entityId: EntityId }
  | { type: "clear_comparison" }
  | { type: "create_annotation"; annotation: Annotation }
  | { type: "create_project"; siteId?: EntityId; name: string }
  | { type: "create_scenario"; name: string }
  | { type: "estimate_scenario"; inputs: ScenarioInputs }
  | { type: "generate_scenario_geometry" }
  | { type: "add_project_milestone"; milestone: import("./data").ProjectMilestone }
  | { type: "update_project_milestone"; milestoneId: string; changes: Partial<Pick<import("./data").ProjectMilestone, "label" | "status" | "plannedAt" | "completedAt">> }
  | { type: "delete_project_milestone"; milestoneId: string }
  | { type: "rank_opportunities"; limit?: number }
  | { type: "save_workspace" }
  | { type: "voice_start" };

export interface WorldCommandResult {
  status: "success" | "rejected" | "unavailable";
  command: WorldCommand["type"];
  message: string;
  affected?: readonly (keyof WorldState)[];
  evidence?: readonly Provenance[];
}

export interface RendererCapabilities {
  selection: boolean;
  annotations: boolean;
  terrain: boolean;
  threeDimensional: boolean;
}

export interface RendererAdapter {
  readonly mode: RendererMode;
  readonly capabilities: RendererCapabilities;
  mount(container: HTMLElement): void | Promise<void>;
  unmount(): void;
  resize(): void;
  applyCamera(camera: CameraState): void;
  readCamera(): CameraState;
  applySelection(entity: WorldEntity | null): void;
  applyLayers(layers: Readonly<Record<string, LayerRuntimeState>>): void;
  applyAnnotations(annotations: readonly Annotation[]): void;
  applyScenarioObjects(objects: readonly import("./projects").ScenarioObject[]): void;
}

export const entityId = (value: string) => value as EntityId;
export const layerId = (value: string) => value as LayerId;
export const projectId = (value: string) => value as ProjectId;
export const scenarioId = (value: string) => value as ScenarioId;
export const drawingId = (value: string) => value as DrawingId;

export * from "./tools";
export * from "./interaction";
export * from "./opportunities";
export * from "./projects";
export * from "./scenario-engine";
export * from "./scenario-geometry";
export * from "./platform";
export * from "./data";
export * from "./analysis";
export * from "./facets";
