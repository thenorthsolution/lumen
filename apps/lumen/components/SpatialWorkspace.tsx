"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { type WorldCommandResult } from "@lumen/world";
import { AgentSidebar } from "./AgentSidebar";
import { Icon } from "./Icon";
import { WorldCanvas } from "./WorldCanvas";
import { useWorldState, worldStore } from "@/lib/world-store";
import { WorldToolbar } from "./WorldToolbar";
import type { CloudIdentity } from "@/lib/cloud/session";
import type { CloudConfiguration } from "@/lib/cloud/config";
import { executeCloudWorldCommand } from "@/lib/cloud/world-command";
import { useDrawingSync } from "@/lib/cloud/use-drawing-sync";
import { useScenarioSync } from "@/lib/cloud/use-scenario-sync";
import { useMilestoneSync } from "@/lib/cloud/use-milestone-sync";

const anonymousIdentity: CloudIdentity = { configured: false, user: null, organization: null, entitlements: { subject: { type: "anonymous" }, plan: { id: "public", tier: "public", label: "Publiek" }, features: ["public-world"], projectLimit: 0, seatLimit: 0, usage: [] } };
const disabledServices: CloudConfiguration = { supabase: false, aiGateway: false, aiDevelopmentAccess: false, stripe: false };

export function SpatialWorkspace({ identity = anonymousIdentity, services = disabledServices }: { identity?: CloudIdentity; services?: CloudConfiguration }) {
  const state = useWorldState();
  const [announcement, setAnnouncement] = useState("Wereld gereed.");

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); document.querySelector<HTMLInputElement>('[aria-label="Geef Lumen een opdracht"]')?.focus(); }
      if (event.key === "Escape" && state.selectedEntityId) worldStore.execute({ type: "deselect_entity" });
    };
    window.addEventListener("keydown", handleKey); return () => window.removeEventListener("keydown", handleKey);
  }, [state.selectedEntityId]);

  const report = (result: WorldCommandResult) => setAnnouncement(result.message);
  const saveProject = async () => report(await executeCloudWorldCommand({ type: "save_workspace" }, identity.organization?.id));
  useDrawingSync(state.activeProject, state.drawings, identity.organization?.id, setAnnouncement);
  useScenarioSync(state.activeProject, state.activeScenario, state.scenarioEstimate, state.scenarioObjects, identity.organization?.id, setAnnouncement);
  useMilestoneSync(state.activeProject, state.projectMilestones, identity.organization?.id, setAnnouncement);
  return (
    <main className="workspace">
      <a className="skipLink" href="#world">Ga naar de wereld</a>
      <nav className="cloudNav" aria-label="Hoofdnavigatie">
        <div className="navZone navStart">
          <Link className="brand" href="/" aria-label="Lumen wereld">
            <Image className="brandLogo brandLogoWorld" src="/brand/lumen_world.svg" alt="Lumen World" width={170} height={30} priority />
          </Link>
        </div>
        <div className="navZone navCenter">
          {state.activeProject ? <div className="sessionProject" title={state.activeProject.persistence === "saved" ? "Privé opgeslagen" : "Alleen beschikbaar in deze sessie"}><small>{state.activeScenario ? "SCENARIO" : "PROJECT"}</small><span>{state.activeScenario?.name ?? state.activeProject.name}</span>{state.scenarioEstimate ? <b>{state.scenarioEstimate.homes.low} tot {state.scenarioEstimate.homes.high} woningen</b> : null}<i>{state.activeProject.persistence === "saved" ? "Opgeslagen" : "Sessie"}</i>{state.activeProject.persistence !== "saved" && identity.user ? <button type="button" onClick={() => void saveProject()}>Opslaan</button> : null}</div> : null}
        </div>
        <div className="navZone navEnd">
          <span className="syncStatus"><i /> Wereld gereed</span>
          <span className="navDivider" />
          {identity.user ? <Link className="avatar" aria-label="Open account" href="/account">{identity.user.initials}</Link> : <><Link className="navAction navSecondary" href="/auth/sign-in?intent=register">Account maken</Link><Link className="navAction navPrimary" href="/auth/sign-in">Aanmelden</Link></>}
        </div>
      </nav>

      <section className="world" id="world">
        <WorldCanvas />
        <div className="worldTools"><button className="iconButton" aria-label="Zoeken" onClick={() => document.querySelector<HTMLInputElement>('[aria-label="Geef Lumen een opdracht"]')?.focus()}><Icon name="search" /></button><button className="iconButton" aria-label="Centreer op Deventer" onClick={() => report(worldStore.execute({ type: "navigate_to", position: [6.1552, 52.255], zoom: 14.2, label: "Deventer" }))}><Icon name="location" /></button></div>
        <div className="rendererControls">
          <div className="rendererSwitch" role="group" aria-label="Rendererweergave" data-renderer={state.renderer}>
            <button type="button" className={state.renderer === "map-2d" ? "active" : ""} aria-pressed={state.renderer === "map-2d"} onClick={() => report(worldStore.execute({ type: "set_renderer", renderer: "map-2d" }))}>2D</button>
            <button type="button" className={state.renderer === "world-3d" ? "active" : ""} aria-pressed={state.renderer === "world-3d"} onClick={() => report(worldStore.execute({ type: "set_renderer", renderer: "world-3d" }))}>3D</button>
          </div>
        </div>

        <WorldToolbar onResult={report} onSaveProject={saveProject} canPersist={Boolean(identity.user && identity.entitlements.features.includes("private-projects"))} organizationId={identity.organization?.id} />

        <div className="coordinateBar"><span>52.2550° N</span><span>6.1552° E</span><i /> <span>1 : 12.500</span><span>RD / WGS84</span></div>
      </section>
      <div className="liveRegion" role="status" aria-live="polite">{announcement}</div>
      <AgentSidebar onResult={report} aiEnabled={Boolean(services.aiGateway && (services.aiDevelopmentAccess || identity.user && identity.entitlements.features.includes("core-ai")))} organizationId={identity.organization?.id} />
    </main>
  );
}
