"use client";

import { useEffect, useRef } from "react";
import type { DrawingFeature } from "@lumen/world";

export type DrawingOperation = { kind: "create" | "update"; drawing: DrawingFeature } | { kind: "delete"; drawingId: string };
type SyncProject = { id: string; persistence?: "session" | "saved" } | null;

const fingerprint = (drawing: DrawingFeature) => JSON.stringify({ name: drawing.name, kind: drawing.kind, coordinates: drawing.coordinates, color: drawing.color, note: drawing.note ?? null, version: drawing.version });

export function planDrawingSync(previous: readonly DrawingFeature[], current: readonly DrawingFeature[]): DrawingOperation[] {
  const before = new Map(previous.map((drawing) => [drawing.id, drawing]));
  const after = new Map(current.map((drawing) => [drawing.id, drawing]));
  return [
    ...current.flatMap((drawing): DrawingOperation[] => !before.has(drawing.id) ? [{ kind: "create", drawing }] : fingerprint(before.get(drawing.id)!) !== fingerprint(drawing) ? [{ kind: "update", drawing }] : []),
    ...previous.flatMap((drawing): DrawingOperation[] => after.has(drawing.id) ? [] : [{ kind: "delete", drawingId: drawing.id }]),
  ];
}

export function initialDrawingBaseline(previousProject: SyncProject, project: SyncProject, drawings: readonly DrawingFeature[]) {
  const wasJustPersisted = previousProject?.persistence === "session" && project?.persistence === "saved";
  return wasJustPersisted ? [] : drawings;
}

async function responseError(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error ?? `Opslaan mislukte (${response.status}).`;
}

async function executeOperation(projectId: string, operation: DrawingOperation, organizationId: string | undefined, signal: AbortSignal) {
  const query = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";
  if (operation.kind === "delete") {
    const response = await fetch(`/api/projects/${projectId}/drawings/${operation.drawingId}${query}`, { method: "DELETE", signal });
    if (!response.ok) throw new Error(await responseError(response));
    return;
  }
  const drawing = operation.drawing;
  const target = operation.kind === "create" ? `/api/projects/${projectId}/drawings` : `/api/projects/${projectId}/drawings/${drawing.id}`;
  const response = await fetch(target, {
    method: operation.kind === "create" ? "POST" : "PATCH",
    headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ id: drawing.id, name: drawing.name, kind: drawing.kind, coordinates: drawing.coordinates.map(([longitude, latitude]) => [longitude, latitude]), color: drawing.color, ...(operation.kind === "update" || drawing.note !== undefined ? { note: drawing.note ?? null } : {}), organizationId }),
  });
  if (!response.ok) throw new Error(await responseError(response));
}

export function useDrawingSync(project: SyncProject, drawings: readonly DrawingFeature[], organizationId: string | undefined, onStatus: (message: string) => void) {
  const baseline = useRef<{ projectId: string; drawings: Map<string, DrawingFeature> } | null>(null);
  const previousProject = useRef<SyncProject>(project);
  const status = useRef(onStatus); status.current = onStatus;
  const projectId = project?.persistence === "saved" ? String(project.id) : null;

  useEffect(() => {
    const initial = initialDrawingBaseline(previousProject.current, project, drawings);
    baseline.current = projectId ? { projectId, drawings: new Map(initial.map((drawing) => [drawing.id, drawing])) } : null;
    previousProject.current = project;
    // Opening or initially saving a project establishes the server baseline.
    // Drawing mutations are handled by the separate effect below.
  }, [project, projectId]);

  useEffect(() => {
    if (!projectId || baseline.current?.projectId !== projectId) return;
    const operations = planDrawingSync(Array.from(baseline.current.drawings.values()), drawings);
    if (!operations.length) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void Promise.allSettled(operations.map((operation) => executeOperation(projectId, operation, organizationId, controller.signal))).then((results) => {
        if (controller.signal.aborted) return;
        const nextBaseline = new Map(baseline.current?.drawings ?? []);
        let firstError: unknown;
        results.forEach((result, index) => {
          const operation = operations[index];
          if (result.status === "rejected") { firstError ??= result.reason; return; }
          if (operation.kind === "delete") nextBaseline.delete(operation.drawingId);
          else nextBaseline.set(operation.drawing.id, operation.drawing);
        });
        baseline.current = { projectId, drawings: nextBaseline };
        const saved = results.filter((result) => result.status === "fulfilled").length;
        const failed = results.length - saved;
        if (failed) {
          const detail = firstError instanceof Error ? firstError.message : "Opslaan mislukt.";
          status.current(`${failed} projecttekening${failed === 1 ? "" : "en"} niet opgeslagen. ${detail}`);
        } else status.current(saved === 1 ? "Projecttekening opgeslagen." : `${saved} projecttekeningen opgeslagen.`);
      });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [drawings, organizationId, projectId]);
}
