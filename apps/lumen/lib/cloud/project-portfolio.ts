"use client";

import { projectId, type DrawingFeature, type ProjectMilestone, type ScenarioEstimate, type ScenarioObject } from "@lumen/world";
import { worldStore } from "@/lib/world-store";
import { parseWorldEntity } from "@/lib/world-entity-schema";
import { scenarioCalculationSchema, scenarioObjectSchema } from "@/lib/cloud/scenario-record";

export interface SavedProjectSummary {
  id: string; name: string; status: "draft" | "active" | "archived"; site_entity_id: string | null;
  organization_id: string | null; updated_at: string;
  site_snapshot?: unknown;
}

type DrawingRow = { id: string; project_id: string; name: string; kind: DrawingFeature["kind"]; geometry: GeoJSON.Geometry; color: string; note: string | null; version: number; created_at: string; updated_at: string };
type ScenarioRow = { id: string; project_id: string; name: string; status: string; objects: unknown; calculation: unknown; updated_at: string };
type MilestoneRow = { id: string; project_id: string; label: string; status: ProjectMilestone["status"]; planned_at: string | null; completed_at: string | null };

const query = (organizationId?: string) => organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";

function drawingCoordinates(row: DrawingRow): DrawingFeature["coordinates"] | null {
  const geometry = row.geometry;
  if (geometry.type === "Point") return [[Number(geometry.coordinates[0]), Number(geometry.coordinates[1])]];
  if (geometry.type === "LineString") return geometry.coordinates.map(([longitude, latitude]) => [Number(longitude), Number(latitude)]);
  if (geometry.type !== "Polygon" || !geometry.coordinates[0]?.length) return null;
  const ring = geometry.coordinates[0].slice(0, -1).map(([longitude, latitude]) => [Number(longitude), Number(latitude)] as const);
  if (row.kind !== "rectangle") return ring;
  const longitudes = ring.map(([longitude]) => longitude); const latitudes = ring.map(([, latitude]) => latitude);
  return [[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]];
}

function normalizeDrawing(row: DrawingRow): DrawingFeature | null {
  const coordinates = drawingCoordinates(row);
  if (!coordinates?.length || !["point", "line", "polygon", "rectangle"].includes(row.kind)) return null;
  return { id: row.id, projectId: row.project_id as never, name: row.name, kind: row.kind, coordinates, color: row.color, ...(row.note ? { note: row.note } : {}), version: row.version, createdAt: row.created_at, updatedAt: row.updated_at };
}

function scenarioObjects(value: unknown): ScenarioObject[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ScenarioObject[] => { const parsed = scenarioObjectSchema.safeParse(item); return parsed.success ? [parsed.data] : []; });
}

function scenarioCalculation(value: unknown): ScenarioEstimate | null {
  const parsed = scenarioCalculationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function json<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Projectgegevens konden niet worden geladen.");
  return body;
}

export async function listSavedProjects(organizationId?: string, signal?: AbortSignal) {
  const response = await fetch(`/api/projects${query(organizationId)}`, { signal });
  const projects = (await json<{ projects?: SavedProjectSummary[] }>(response)).projects ?? [];
  return projects.map((project) => ({ ...project, site_snapshot: parseWorldEntity(project.site_snapshot) }));
}

export async function openSavedProject(project: SavedProjectSummary, organizationId?: string, signal?: AbortSignal) {
  const suffix = query(organizationId);
  const [drawingPayload, scenarioPayload, milestonePayload] = await Promise.all([
    fetch(`/api/projects/${project.id}/drawings${suffix}`, { signal }).then((response) => json<{ drawings?: DrawingRow[] }>(response)),
    fetch(`/api/projects/${project.id}/scenarios${suffix}`, { signal }).then((response) => json<{ scenarios?: ScenarioRow[] }>(response)),
    fetch(`/api/projects/${project.id}/milestones${suffix}`, { signal }).then((response) => json<{ milestones?: MilestoneRow[] }>(response)),
  ]);
  const drawings = (drawingPayload.drawings ?? []).flatMap((row) => { const drawing = normalizeDrawing(row); return drawing ? [drawing] : []; });
  const scenario = scenarioPayload.scenarios?.[0];
  const milestones = (milestonePayload.milestones ?? []).filter((item) => ["planned", "active", "complete", "blocked"].includes(item.status)).map((item): ProjectMilestone => ({ id: item.id, projectId: projectId(item.project_id), label: item.label, status: item.status, ...(item.planned_at ? { plannedAt: item.planned_at } : {}), ...(item.completed_at ? { completedAt: item.completed_at } : {}) }));
  worldStore.openSavedProject({
    project: { id: project.id, name: project.name, siteId: project.site_entity_id, site: parseWorldEntity(project.site_snapshot) }, drawings, milestones,
    scenario: scenario ? { id: scenario.id, name: scenario.name, objects: scenarioObjects(scenario.objects), calculation: scenarioCalculation(scenario.calculation) } : null,
  });
  return { drawings: drawings.length, milestones: milestones.length, scenario: scenario?.name ?? null };
}
