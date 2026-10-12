"use client";

import { projectId, type WorldCommand, type WorldCommandResult } from "@lumen/world";
import { worldStore } from "@/lib/world-store";

export async function executeCloudWorldCommand(command: WorldCommand, organizationId?: string): Promise<WorldCommandResult> {
  if (command.type !== "save_workspace") return worldStore.execute(command);
  const activeProject = worldStore.getState().activeProject;
  if (!activeProject) return { status: "rejected", command: command.type, message: "Maak eerst een project." };
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: activeProject.name,
      siteId: activeProject.siteId,
      siteSnapshot: activeProject.siteId ? worldStore.getState().entities[activeProject.siteId] : undefined,
      organizationId,
    }),
  });
  const result = await response.json() as { project?: { id: string }; error?: string };
  if (!response.ok || !result.project) return { status: response.status === 401 || response.status === 403 ? "rejected" : "unavailable", command: command.type, message: result.error ?? "Project kon niet worden opgeslagen." };
  worldStore.markProjectSaved(projectId(result.project.id));
  return { status: "success", command: command.type, message: "Project privé opgeslagen; tekeningen en scenario worden gesynchroniseerd.", affected: ["activeProject", "drawings", "activeScenario"] };
}
