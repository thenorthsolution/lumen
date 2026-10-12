import type { Provenance, WorldCommand, WorldCommandResult } from "./index";

export type PlanTier = "public" | "personal" | "organization-trial" | "organization" | "enterprise";

export type EntitlementFeature =
  | "public-world"
  | "private-projects"
  | "core-ai"
  | "organization-workspace"
  | "collaboration"
  | "premium-ai"
  | "private-data"
  | "exports"
  | "audit-log"
  | "sso";

export type AiTaskKind =
  | "chat"
  | "site-analysis"
  | "scenario-comparison"
  | "design-study"
  | "image-generation"
  | "report"
  | "voice";

export type UsageKind =
  | "ai-chat"
  | "ai-analysis"
  | "ai-design"
  | "ai-image"
  | "voice-minute"
  | "export"
  | "storage-gib";

export interface UsageAllowance {
  kind: UsageKind;
  units: number | null;
  period: "day" | "month" | "trial" | "contract";
  behavior: "allow" | "queue" | "reject";
}

export interface PlanDefinition {
  id: string;
  tier: PlanTier;
  label: string;
  features: readonly EntitlementFeature[];
  projectLimit: number | null;
  seatLimit: number | null;
  allowances: readonly UsageAllowance[];
  configurable: true;
}

export interface EntitlementSnapshot {
  subject: { type: "anonymous" | "personal" | "organization"; id?: string };
  plan: Pick<PlanDefinition, "id" | "tier" | "label">;
  features: readonly EntitlementFeature[];
  projectLimit: number | null;
  seatLimit: number | null;
  trialEndsAt?: string;
  usage: readonly {
    kind: UsageKind;
    granted: number | null;
    reserved: number;
    consumed: number;
    resetsAt?: string;
    behavior: UsageAllowance["behavior"];
  }[];
}

export type UsageReservationStatus = "reserved" | "settled" | "released";

export interface UsageReservation {
  id: string;
  idempotencyKey: string;
  subject: { type: "personal" | "organization"; id: string };
  kind: UsageKind;
  reservedUnits: number;
  consumedUnits?: number;
  status: UsageReservationStatus;
  createdAt: string;
  settledAt?: string;
  releaseReason?: string;
}

export interface UsageEvent {
  id: string;
  reservationId: string;
  type: "reserved" | "settled" | "released";
  units: number;
  occurredAt: string;
  actorId: string;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface UsageReservationRequest {
  idempotencyKey: string;
  subject: UsageReservation["subject"];
  kind: UsageKind;
  units: number;
}

export type UsageReservationResult =
  | { status: "reserved" | "existing"; reservation: UsageReservation }
  | { status: "rejected"; reason: "invalid" | "unavailable" | "exhausted"; message: string };

export interface UsageLedger {
  reserve(request: UsageReservationRequest): Promise<UsageReservationResult>;
  settle(reservationId: string, consumedUnits: number, metadata?: UsageEvent["metadata"]): Promise<UsageReservation>;
  release(reservationId: string, reason: string): Promise<UsageReservation>;
}

export type AgentActionRisk = "read" | "reversible" | "review" | "external";

export interface AgentActionDecision {
  risk: AgentActionRisk;
  execution: "automatic" | "preview" | "confirmation";
  undoable: boolean;
  reason: string;
}

export function assessWorldCommand(command: WorldCommand): AgentActionDecision {
  if (["save_workspace"].includes(command.type)) {
    return { risk: "external", execution: "confirmation", undoable: false, reason: "Deze actie schrijft buiten de lokale wereldsessie." };
  }
  if (["create_project", "create_scenario", "estimate_scenario", "generate_scenario_geometry", "create_annotation"].includes(command.type)) {
    return { risk: "review", execution: "preview", undoable: true, reason: "Deze actie wijzigt een project of ontwerp en moet zichtbaar beoordeeld kunnen worden." };
  }
  if (["navigate_to", "set_camera", "orbit_camera", "select_entity", "find_and_select_entity", "deselect_entity", "set_layer_visibility", "set_renderer"].includes(command.type)) {
    return { risk: "reversible", execution: "automatic", undoable: true, reason: "De wijziging is lokaal, zichtbaar en direct omkeerbaar." };
  }
  return { risk: "read", execution: "automatic", undoable: false, reason: "De actie leest of analyseert bestaande wereldgegevens." };
}

export type ProjectArtifactKind = "analysis" | "scenario" | "design" | "image" | "report" | "export";

export interface ProjectArtifact {
  schemaVersion: "1.0";
  id: string;
  projectId: string;
  scenarioId?: string;
  kind: ProjectArtifactKind;
  title: string;
  version: number;
  status: "draft" | "ready" | "failed" | "superseded";
  content: Readonly<Record<string, unknown>>;
  provenance: readonly Provenance[];
  assumptions: readonly string[];
  createdBy: string;
  createdAt: string;
}

export interface AiTaskRequest {
  id: string;
  kind: AiTaskKind;
  actorId: string;
  organizationId?: string;
  projectId?: string;
  prompt: string;
  context?: Readonly<Record<string, unknown>>;
}

export interface AiTaskResult {
  status: "success" | "rejected" | "unavailable" | "failed";
  taskId: string;
  message: string;
  worldResults?: readonly WorldCommandResult[];
  artifact?: ProjectArtifact;
  evidence?: readonly Provenance[];
}

export interface AiProviderAdapter {
  readonly id: string;
  supports(kind: AiTaskKind): boolean;
  execute(request: AiTaskRequest, signal?: AbortSignal): Promise<AiTaskResult>;
}

export interface EntitlementProvider {
  getSnapshot(actorId?: string, organizationId?: string): Promise<EntitlementSnapshot>;
  can(snapshot: EntitlementSnapshot, feature: EntitlementFeature): boolean;
}

export const publicPlan: PlanDefinition = {
  id: "public",
  tier: "public",
  label: "Publiek",
  features: ["public-world"],
  projectLimit: 0,
  seatLimit: 0,
  allowances: [],
  configurable: true,
};

export const personalPlan: PlanDefinition = {
  id: "personal",
  tier: "personal",
  label: "Persoonlijk",
  features: ["public-world", "private-projects", "core-ai"],
  projectLimit: 10,
  seatLimit: 1,
  allowances: [
    { kind: "ai-chat", units: null, period: "day", behavior: "queue" },
    { kind: "ai-analysis", units: null, period: "day", behavior: "queue" },
    { kind: "ai-design", units: null, period: "day", behavior: "queue" },
  ],
  configurable: true,
};

export function hasEntitlement(snapshot: EntitlementSnapshot, feature: EntitlementFeature): boolean {
  if (snapshot.trialEndsAt && Date.parse(snapshot.trialEndsAt) <= Date.now()) return false;
  return snapshot.features.includes(feature);
}
