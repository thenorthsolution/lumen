import { describe, expect, it } from "vitest";
import { entityId, type ProjectId, type ScenarioId, type WorkspaceId } from "./index";
import { validateProject, validateScenario, type OrganizationScope, type ProjectRecord, type ScenarioRecord } from "./projects";

const scope: OrganizationScope = { organizationId: "north", actorId: "user-1" };
const project: ProjectRecord = { schemaVersion: "1.0", id: "project-1" as ProjectId, workspaceId: "workspace-1" as WorkspaceId, siteId: entityId("site-1"), name: "Deventer", status: "draft", scope, provenance: [], createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z" };

describe("project contracts", () => {
  it("rejects cross-organization access", () => {
    expect(validateProject(project, { organizationId: "other", actorId: "user-2" })).toEqual({ valid: false, issues: ["Project valt buiten de actieve organisatie."] });
  });

  it("requires provenance for generated scenario geometry", () => {
    const scenario: ScenarioRecord = { schemaVersion: "1.0", id: "scenario-1" as ScenarioId, projectId: project.id, name: "Basis", status: "draft", assumptions: [], createdAt: project.createdAt, updatedAt: project.updatedAt, objects: [{ id: "mass-1", kind: "massing", label: "Volume", geometry: { kind: "polygon", coordinateSystem: "WGS84" }, parameters: {}, provenance: [] }] };
    expect(validateScenario(scenario, project)).toEqual({ valid: false, issues: ["Object mass-1 mist provenance."] });
  });
});
