"use client";

import { useEffect, useRef } from "react";
import { scenarioId, type ScenarioEstimate, type ScenarioObject, type ScenarioReference } from "@lumen/world";
import { worldStore } from "@/lib/world-store";

interface ScenarioSnapshot {
  scenario: ScenarioReference;
  calculation: ScenarioEstimate | null;
  objects: readonly ScenarioObject[];
}

export function scenarioFingerprint(snapshot: ScenarioSnapshot) {
  return JSON.stringify({ name: snapshot.scenario.name, calculation: snapshot.calculation, objects: snapshot.objects });
}

const isLocalScenario = (scenario: ScenarioReference) => String(scenario.id).startsWith("session-");

async function errorMessage(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error ?? `Scenario opslaan mislukte (${response.status}).`;
}

export function useScenarioSync(
  project: { id: string; persistence?: "session" | "saved" } | null,
  scenario: ScenarioReference | null,
  calculation: ScenarioEstimate | null,
  objects: readonly ScenarioObject[],
  organizationId: string | undefined,
  onStatus: (message: string) => void,
) {
  const baseline = useRef<{ scenarioId: string; fingerprint: string } | null>(null);
  const status = useRef(onStatus); status.current = onStatus;
  const projectId = project?.persistence === "saved" ? String(project.id) : null;
  const current = scenario ? { scenario, calculation, objects } : null;
  const fingerprint = current ? scenarioFingerprint(current) : null;

  useEffect(() => {
    if (!projectId || !current || !fingerprint) { baseline.current = null; return; }
    const local = isLocalScenario(current.scenario);
    if (!local && baseline.current?.scenarioId !== String(current.scenario.id)) {
      baseline.current = { scenarioId: String(current.scenario.id), fingerprint };
      return;
    }
    if (!local && baseline.current?.fingerprint === fingerprint) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const payload = { name: current.scenario.name, calculation: current.calculation, assumptions: current.calculation?.assumptions ?? [], objects: current.objects, organizationId };
      const target = local ? `/api/projects/${projectId}/scenarios` : `/api/projects/${projectId}/scenarios/${current.scenario.id}`;
      void fetch(target, { method: local ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(await errorMessage(response));
          const body = await response.json() as { scenario?: { id?: string } };
          if (controller.signal.aborted) return;
          const savedId = body.scenario?.id;
          if (local && !savedId) throw new Error("De scenario-opslag gaf geen scenario-id terug.");
          baseline.current = { scenarioId: savedId ?? String(current.scenario.id), fingerprint };
          if (local) worldStore.markScenarioSaved(scenarioId(savedId!));
          status.current("Scenario privé opgeslagen.");
        })
        .catch((error) => { if (!(error instanceof Error && error.name === "AbortError")) status.current(error instanceof Error ? error.message : "Scenario kon niet worden opgeslagen."); });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [current, fingerprint, organizationId, projectId]);
}
