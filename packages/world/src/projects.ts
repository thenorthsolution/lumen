import type { EntityId, GeometryReference, ProjectId, Provenance, ScenarioId, WorkspaceId } from "./index";

export type ProjectStatus = "draft" | "active" | "archived";
export type ScenarioStatus = "draft" | "calculated" | "archived";
export type ScenarioObjectKind = "building-footprint" | "massing" | "landscape" | "demolition" | "infrastructure" | "phase-boundary";

export interface OrganizationScope {
  organizationId?: string;
  actorId: string;
}

export interface ProjectRecord {
  schemaVersion: "1.0";
  id: ProjectId;
  workspaceId: WorkspaceId;
  siteId?: EntityId;
  name: string;
  status: ProjectStatus;
  scope: OrganizationScope;
  provenance: readonly Provenance[];
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioObject {
  id: string;
  kind: ScenarioObjectKind;
  label: string;
  geometry: GeometryReference;
  parameters: Readonly<Record<string, string | number | boolean | null>>;
  provenance: readonly Provenance[];
}

export interface ScenarioRecord {
  schemaVersion: "1.0";
  id: ScenarioId;
  projectId: ProjectId;
  name: string;
  status: ScenarioStatus;
  objects: readonly ScenarioObject[];
  assumptions: readonly string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRepository {
  getProject(scope: OrganizationScope, id: ProjectId): Promise<ProjectRecord | null>;
  listProjects(scope: OrganizationScope): Promise<readonly ProjectRecord[]>;
  saveProject(scope: OrganizationScope, project: ProjectRecord): Promise<ProjectRecord>;
  saveScenario(scope: OrganizationScope, scenario: ScenarioRecord): Promise<ScenarioRecord>;
}

export type ProjectValidationResult = { valid: true } | { valid: false; issues: readonly string[] };

export function validateProject(project: ProjectRecord, scope: OrganizationScope): ProjectValidationResult {
  const issues: string[] = [];
  if (project.schemaVersion !== "1.0") issues.push("Onbekende projectversie.");
  if (!project.name.trim()) issues.push("Projectnaam is verplicht.");
  if (project.scope.organizationId !== scope.organizationId) issues.push("Project valt buiten de actieve organisatie.");
  if (!Number.isFinite(Date.parse(project.createdAt)) || !Number.isFinite(Date.parse(project.updatedAt))) issues.push("Projectdatums zijn ongeldig.");
  return issues.length ? { valid: false, issues } : { valid: true };
}

export function validateScenario(scenario: ScenarioRecord, project: ProjectRecord): ProjectValidationResult {
  const issues: string[] = [];
  if (scenario.schemaVersion !== "1.0") issues.push("Onbekende scenarioversie.");
  if (scenario.projectId !== project.id) issues.push("Scenario hoort niet bij dit project.");
  if (!scenario.name.trim()) issues.push("Scenarionaam is verplicht.");
  for (const object of scenario.objects) {
    if (object.geometry.coordinateSystem !== "WGS84") issues.push(`Object ${object.id} gebruikt geen WGS84.`);
    if (!object.provenance.length) issues.push(`Object ${object.id} mist provenance.`);
  }
  return issues.length ? { valid: false, issues } : { valid: true };
}
