"use client";

import { useEffect, useRef } from "react";
import type { ProjectMilestone } from "@lumen/world";

type Operation = { kind: "create" | "update"; milestone: ProjectMilestone } | { kind: "delete"; milestoneId: string };
type SyncProject = { id: string; persistence?: "session" | "saved" } | null;
const fingerprint = (item: ProjectMilestone) => JSON.stringify({ label: item.label, status: item.status, plannedAt: item.plannedAt ?? null, completedAt: item.completedAt ?? null });

export function planMilestoneSync(previous: readonly ProjectMilestone[], current: readonly ProjectMilestone[]): Operation[] {
  const before = new Map(previous.map((item) => [item.id, item])); const after = new Set(current.map((item) => item.id));
  return [...current.flatMap((item): Operation[] => !before.has(item.id) ? [{ kind: "create", milestone: item }] : fingerprint(before.get(item.id)!) !== fingerprint(item) ? [{ kind: "update", milestone: item }] : []), ...previous.flatMap((item): Operation[] => after.has(item.id) ? [] : [{ kind: "delete", milestoneId: item.id }])];
}

async function execute(projectId: string, operation: Operation, organizationId: string | undefined, signal: AbortSignal) {
  const suffix = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";
  if (operation.kind === "delete") {
    const response = await fetch(`/api/projects/${projectId}/milestones/${operation.milestoneId}${suffix}`, { method: "DELETE", signal });
    if (!response.ok) throw new Error((await response.json().catch(() => ({})) as { error?: string }).error ?? "Mijlpaal verwijderen mislukt.");
    return;
  }
  const item = operation.milestone;
  const response = await fetch(operation.kind === "create" ? `/api/projects/${projectId}/milestones` : `/api/projects/${projectId}/milestones/${item.id}`, { method: operation.kind === "create" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, signal, body: JSON.stringify({ ...(operation.kind === "create" ? { id: item.id } : {}), label: item.label, status: item.status, plannedAt: item.plannedAt ?? null, completedAt: item.completedAt ?? null, organizationId }) });
  if (!response.ok) throw new Error((await response.json().catch(() => ({})) as { error?: string }).error ?? "Mijlpaal opslaan mislukt.");
}

export function useMilestoneSync(project: SyncProject, milestones: readonly ProjectMilestone[], organizationId: string | undefined, onStatus: (message: string) => void) {
  const baseline = useRef<{ projectId: string; items: Map<string, ProjectMilestone> } | null>(null);
  const previousProject = useRef<SyncProject>(project); const status = useRef(onStatus); status.current = onStatus;
  const projectId = project?.persistence === "saved" ? String(project.id) : null;
  useEffect(() => {
    const newlySaved = previousProject.current?.persistence === "session" && project?.persistence === "saved";
    baseline.current = projectId ? { projectId, items: new Map((newlySaved ? [] : milestones).map((item) => [item.id, item])) } : null;
    previousProject.current = project;
  }, [project, projectId]);
  useEffect(() => {
    if (!projectId || baseline.current?.projectId !== projectId) return;
    const operations = planMilestoneSync(Array.from(baseline.current.items.values()), milestones);
    if (!operations.length) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void Promise.allSettled(operations.map((operation) => execute(projectId, operation, organizationId, controller.signal))).then((results) => {
        if (controller.signal.aborted) return;
        const next = new Map(baseline.current?.items ?? []); let failed = 0;
        results.forEach((result, index) => { const operation = operations[index]!; if (result.status === "rejected") { failed += 1; return; } if (operation.kind === "delete") next.delete(operation.milestoneId); else next.set(operation.milestone.id, operation.milestone); });
        baseline.current = { projectId, items: next };
        status.current(failed ? `${failed} mijlpaal${failed === 1 ? "" : "palen"} kon niet worden opgeslagen.` : "Projectplanning opgeslagen.");
      });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [milestones, organizationId, projectId]);
}
