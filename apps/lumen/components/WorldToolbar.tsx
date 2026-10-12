"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DATA_SOURCE_CATALOG, TASK_PRESETS, assessKnownSuitability, buildEntityFacet, buildNearbyAmenities, buildProximityBaseline, entityId, knownSuitabilityInputs, layerId, measureDrawing, type EntityFacetId, type Provenance, type ScenarioInputs, type WorkspaceTool, type WorldCommandResult } from "@lumen/world";
import { Icon, type IconName } from "./Icon";
import { layerIsAvailable, layerRegistry, useWorldState, worldStore } from "@/lib/world-store";
import { listSavedProjects, openSavedProject, type SavedProjectSummary } from "@/lib/cloud/project-portfolio";

const tools: readonly { id: WorkspaceTool; label: string; icon: IconName }[] = [
  { id: "explore", label: "Verkennen", icon: "cursor" }, { id: "search", label: "Zoeken", icon: "search" },
  { id: "layers", label: "Lagen", icon: "layers" }, { id: "analyze", label: "Analyseren", icon: "chart" },
  { id: "draw", label: "Tekenen", icon: "pencil" }, { id: "compare", label: "Vergelijken", icon: "compare" },
  { id: "projects", label: "Projecten", icon: "folder" },
] as const;

export function WorldToolbar({ onResult, onSaveProject, canPersist = false, organizationId }: { onResult: (result: WorldCommandResult) => void; onSaveProject?: () => Promise<void>; canPersist?: boolean; organizationId?: string }) {
  const state = useWorldState();
  const selected = state.selectedEntityId ? state.entities[state.selectedEntityId] : null;
  const open = (tool: WorkspaceTool) => onResult(worldStore.execute({ type: "set_active_tool", tool }));
  return <div className="worldWorkspaceUi">
    <nav className="worldToolbar" aria-label="Kaartgereedschap">{tools.map((tool) => <button key={tool.id} type="button" className={state.activeTool === tool.id ? "active" : ""} aria-label={tool.label} title={tool.label} onClick={() => open(tool.id)}><Icon name={tool.icon} /></button>)}</nav>
    <aside className="workspacePanel panel" aria-label={`${tools.find((tool) => tool.id === state.activeTool)?.label} paneel`}>
      <header className="workspacePanelHeader"><div><span className="eyebrow">LUMEN WERELD</span><h2>{selected && state.activeTool === "explore" ? selected.name : tools.find((tool) => tool.id === state.activeTool)?.label}</h2></div></header>
      <div className="workspacePanelBody">
        {state.activeTool === "explore" ? selected ? <ObjectDetails key={selected.id} /> : <Empty title="Selecteer een object" text="Kies een gebouw, perceel, buurt of project op de kaart. Details, bronnen en analyses blijven in dit paneel." /> : null}
        {state.activeTool === "search" ? <SearchPanel /> : null}
        {state.activeTool === "layers" ? <LayersPanel onResult={onResult} /> : null}
        {state.activeTool === "analyze" ? <AnalyzePanel /> : null}
        {state.activeTool === "draw" ? <DrawPanel onResult={onResult} /> : null}
        {state.activeTool === "compare" ? <ComparePanel onResult={onResult} /> : null}
        {state.activeTool === "projects" ? <ProjectsPanel onResult={onResult} onSaveProject={onSaveProject} canPersist={canPersist} organizationId={organizationId} /> : null}
      </div>
    </aside>
  </div>;
}

function LayersPanel({ onResult }: { onResult: (result: WorldCommandResult) => void }) {
  const state = useWorldState();
  const sources = new Map(DATA_SOURCE_CATALOG.map((source) => [source.id, source]));
  const definitions = new Map(layerRegistry.map((layer) => [String(layer.id), layer]));
  return <><p className="sectionLabel">TAAKWEERGAVE</p><div className="presetGrid">{TASK_PRESETS.map((preset) => { const unavailableLabels = preset.layerIds.flatMap((id) => { const layer = definitions.get(id); return !layer || !layerIsAvailable(layer) ? [layer?.label ?? id] : []; }); return <button key={preset.id} className={state.taskPreset === preset.id ? "active" : ""} onClick={() => onResult(worldStore.execute({ type: "set_task_preset", preset: preset.id }))}><b>{preset.label}</b><small>{preset.description}</small>{unavailableLabels.length ? <em>Nog niet aangesloten: {unavailableLabels.join(", ")}</em> : null}</button>; })}</div><p className="sectionLabel">LAGEN</p>{layerRegistry.map((layer) => { const runtime = state.layers[layer.id]; const layerSources = layer.sourceIds.flatMap((id) => sources.get(id) ? [sources.get(id)!] : []); const sourceUnavailable = !layerIsAvailable(layer); const rendererUnavailable = !layer.supportedRenderers.includes(state.renderer); const unavailable = sourceUnavailable || rendererUnavailable; return <label className={`layerRow ${unavailable ? "unavailable" : ""}`} key={layer.id}><span className={`layerGlyph ${layer.category}`} /><span><b>{layer.label}</b><small>{runtime?.status === "error" ? runtime.error : sourceUnavailable ? "Bron nog niet aangesloten" : rendererUnavailable ? `Niet beschikbaar in ${state.renderer === "map-2d" ? "2D" : "3D"}` : layer.description}</small><em>{layerSources.length ? layerSources.map((source) => source.label).join(" + ") : "Bron niet geregistreerd"} · {layer.coverage === "national" ? "landelijk" : layer.coverage === "regional" ? "regionaal" : "lokaal"}{layer.minZoom !== undefined ? ` · vanaf zoom ${layer.minZoom}` : ""}</em></span><input type="checkbox" disabled={unavailable} checked={!unavailable && (runtime?.visible ?? false)} onChange={(event) => onResult(worldStore.execute({ type: "set_layer_visibility", layerId: layerId(layer.id), visible: event.target.checked }))} /><i className="toggle" /></label>; })}<details className="sourceCatalog"><summary>Broncatalogus</summary>{DATA_SOURCE_CATALOG.map((source) => <div key={source.id}><b>{source.label}</b><span>{source.authority} · {source.availability === "available" ? "beschikbaar" : source.availability === "planned" ? "gepland" : source.availability === "requires-connection" ? "koppeling vereist" : "niet beschikbaar"} · {source.coverage === "national" ? "landelijk" : source.coverage === "regional" ? "regionaal" : "lokaal"} · {source.freshness}</span>{source.licenseUrl ? <a href={source.licenseUrl} target="_blank" rel="noreferrer">Licentie</a> : <small>Licentie-URL niet geregistreerd</small>}</div>)}</details></>;
}

const detailTabs = {
  address: ["Overzicht", "Omgeving", "Markt", "Bronnen"],
  building: ["Overzicht", "Omgeving", "Energie", "Markt", "Plannen", "Kansen", "Bronnen"],
  site: ["Overzicht", "Bouwbaarheid", "Regels", "Omgeving", "Bereikbaarheid", "Markt", "Realisatie", "Bronnen"],
  parcel: ["Overzicht", "Bouwbaarheid", "Regels", "Omgeving", "Bereikbaarheid", "Markt", "Realisatie", "Bronnen"],
  area: ["Inwoners", "Wonen", "Voorzieningen", "Markt", "Kansen", "Projecten", "Bronnen"],
  project: ["Programma", "Planning", "Vergunningen", "Uitvoering", "Documenten", "Historie", "Bronnen"],
} as const;

function ObjectDetails() {
  const state = useWorldState();
  const selected = state.selectedEntityId ? state.entities[state.selectedEntityId] : null;
  const [activeTab, setActiveTab] = useState(0);
  if (!selected) return null;
  const family = selected.type === "address" || selected.type === "building" || selected.type === "parcel" || selected.type === "site" || selected.type === "project" ? selected.type : selected.type === "municipality" || selected.type === "district" || selected.type === "neighborhood" || selected.type === "region" ? "area" : "building";
  const tabs = detailTabs[family];
  const tab = tabs[Math.min(activeTab, tabs.length - 1)]!;
  const isOverview = activeTab === 0;
  const isSources = tab === "Bronnen";
  const isAccessibility = tab === "Omgeving" || tab === "Voorzieningen" || tab === "Bereikbaarheid";
  const facetId = facetIdForTab(tab);
  return <>
    <div className="detailTabs" role="tablist">{tabs.map((label, index) => <button role="tab" aria-selected={index === activeTab} className={index === activeTab ? "active" : ""} key={label} onClick={() => setActiveTab(index)}>{label}</button>)}</div>
    {isOverview ? <><p className="panelDescription">{selected.description ?? "Geen beschrijving beschikbaar."}</p><FacetStatus facetId="overview" entity={selected} /><EntityRelations entity={selected} entities={state.entities} /></> : isSources ? <SourceList entity={selected} /> : isAccessibility ? <><FacetStatus facetId={facetId} entity={selected} hideWhenMissing /><AccessibilityView entity={selected} entities={state.entities} /></> : <FacetStatus facetId={facetId} entity={selected} />}
    {!state.activeProject ? <button className="primaryButton" onClick={() => worldStore.execute({ type: "create_project", siteId: selected.id, name: selected.name })}><Icon name="folder" /> Maak project</button> : null}
    <button className="panelTextButton" onClick={() => worldStore.execute({ type: "toggle_comparison_entity", entityId: selected.id })}>{state.comparisonEntityIds.includes(selected.id) ? "Verwijder uit vergelijking" : "Voeg toe aan vergelijking"}</button>
    <button className="panelTextButton" onClick={() => worldStore.execute({ type: "deselect_entity" })}>Selectie wissen</button>
  </>;
}

function EntityRelations({ entity, entities }: { entity: NonNullable<ReturnType<typeof worldStore.getState>["entities"][string]>; entities: ReturnType<typeof worldStore.getState>["entities"] }) {
  if (!entity.relatedEntityIds?.length) return null;
  return <section className="entityRelations"><p className="sectionLabel">GERELATEERD</p>{entity.relatedEntityIds.map((id) => { const related = entities[id]; return related ? <button key={id} className="panelTextButton" onClick={() => worldStore.execute({ type: "select_entity", entityId: related.id })}>{related.name}<small>{related.type}</small></button> : <div key={id} className="methodNotice"><b>{String(entity.properties.parentName ?? entity.properties.parentCode ?? "Gerelateerd gebied")}</b><span>{String(id)} · nog niet in de kaart geladen</span></div>; })}</section>;
}

function SourceList({ entity }: { entity: NonNullable<ReturnType<typeof worldStore.getState>["entities"][string]> }) {
  return entity.provenance.length ? <>{entity.provenance.map((source) => <div className="sourceBlock" key={`${source.sourceId}-${source.retrievedAt}`}><span className="confidence">{source.confidence}</span><div><b>{source.sourceUrl ? <a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.sourceLabel}</a> : source.sourceLabel}</b><EvidenceMeta source={source} expanded /></div></div>)}</> : <Empty title="Geen bronregistratie" text="Voor dit facet is nog geen herleidbare bron aan het object gekoppeld." />;
}

function EvidenceMeta({ source, expanded = false }: { source?: Provenance; expanded?: boolean }) {
  if (!source) return <small className="evidenceMeta missing">Bron, actualiteit, methode en beperkingen niet geregistreerd.</small>;
  const limitations = source.limitations ?? source.assumptions;
  return <small className="evidenceMeta"><span>{formatEvidenceDate(source.retrievedAt)} · confidence {source.confidence}</span><span>Methode: {source.methodVersion ?? "niet geregistreerd"}</span>{expanded ? <span>Beperkingen: {limitations?.length ? limitations.join("; ") : "niet geregistreerd"}</span> : null}</small>;
}

function formatEvidenceDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleDateString("nl-NL") : "Datum niet geregistreerd";
}

function facetIdForTab(label: string): EntityFacetId { const ids: Readonly<Record<string, EntityFacetId>> = { Overzicht: "overview", Omgeving: "environment", Energie: "energy", Markt: "market", Plannen: "planning", Kansen: "opportunities", Bouwbaarheid: "buildability", Regels: "planning", Bereikbaarheid: "accessibility", Realisatie: "delivery", Inwoners: "population", Wonen: "housing", Voorzieningen: "amenities", Projecten: "projects", Programma: "program", Planning: "planning", Vergunningen: "planning", Uitvoering: "delivery", Documenten: "documents", Historie: "history" }; return ids[label] ?? "overview"; }
const emptyFacetCopy: Partial<Record<EntityFacetId, { title: string; text: string }>> = {
  energy: { title: "Energiebron nog niet aangesloten", text: "Voor dit pand is nog geen geautoriseerde energielabelbron gekoppeld." },
  market: { title: "Marktdata nog niet gekoppeld", text: "WOZ-, transactie- en aanboddata worden pas getoond via een openbare of geautoriseerde connector." },
  planning: { title: "Planregels nog niet aangesloten", text: "De DSO-koppeling voor omgevingsplan en vergunninginformatie is nog in ontwikkeling." },
  opportunities: { title: "Geen kansanalyse beschikbaar", text: "Voor dit object is nog geen herleidbaar leegstands- of transformatiesignaal berekend." },
  documents: { title: "Geen documenten gekoppeld", text: "Er zijn nog geen officiële publicaties of projectdocumenten aan dit object gekoppeld." },
  delivery: { title: "Realisatiedata nog niet gekoppeld", text: "Vergunningen, eigendom, planning en uitvoeringsinformatie zijn voor dit object nog niet aangesloten." },
};
function FacetStatus({ facetId, entity, hideWhenMissing = false }: { facetId: EntityFacetId; entity: NonNullable<ReturnType<typeof worldStore.getState>["entities"][string]>; hideWhenMissing?: boolean }) {
  const facet = buildEntityFacet(entity, facetId);
  if (facet.availability === "missing") {
    if (hideWhenMissing) return null;
    const copy = emptyFacetCopy[facetId] ?? { title: "Geen brongegevens beschikbaar", text: "De benodigde bron levert voor dit onderdeel nog geen herleidbare gegevens. Lumen gebruikt geen voorbeelddata." };
    return <Empty title={copy.title} text={copy.text} />;
  }
  return <><dl className="facts">{facet.values.map((item) => <div key={item.key}><dt>{item.label}</dt><dd><strong>{String(item.value)}</strong><span className="evidenceSource">{item.provenance[0]?.sourceLabel ?? "Bron niet geregistreerd"}</span><EvidenceMeta source={item.provenance[0]} expanded /></dd></div>)}</dl>{facet.missing.length ? <p className="panelHint">Nog niet beschikbaar: {facet.missing.map((item) => item.label).join(", ")}.</p> : null}</>;
}
function SearchPanel() {
  const state = useWorldState();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [locations, setLocations] = useState<readonly { externalId: string; name: string; kind: string; entityType?: "address" | "municipality"; longitude: number; latitude: number; recommendedZoom: number; provenance: Provenance }[]>([]);
  const requestRef = useRef<AbortController | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase("nl-NL");
  const objectResults = useMemo(() => {
    if (normalizedQuery.length < 2) return [];
    return Object.values(state.entities).filter((entity) => {
      const searchable = [entity.name, entity.description, entity.type, entity.properties.identificatie, entity.properties.status, entity.properties.gebruiksdoel]
        .filter((value) => value !== null && value !== undefined)
        .join(" ").toLocaleLowerCase("nl-NL");
      return searchable.includes(normalizedQuery);
    }).slice(0, 8);
  }, [normalizedQuery, state.entities]);
  useEffect(() => () => requestRef.current?.abort(), []);
  const search = async (event: React.FormEvent) => {
    event.preventDefault(); if (query.trim().length < 2) return;
    requestRef.current?.abort();
    const controller = new AbortController(); requestRef.current = controller;
    setStatus("Zoeken…"); setLocations([]);
    try {
      const response = await fetch(`/api/world/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
      const data = await response.json() as { message?: string; locations?: typeof locations };
      if (!response.ok) throw new Error(data.message ?? "Locatiezoeken is tijdelijk niet beschikbaar.");
      if (!controller.signal.aborted) { setStatus(data.message ?? "Zoeken afgerond."); setLocations(data.locations ?? []); }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) setStatus(error instanceof Error ? error.message : "Locatiezoeken is tijdelijk niet beschikbaar.");
    }
  };
  return <><form className="workspaceSearch" onSubmit={search}><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Zoek locatie of object" placeholder="Adres, buurt, gebouw of project" /><button aria-label="Zoek">Zoek</button></form>{status ? <p className="panelHint" role="status">{status}</p> : <p className="panelHint">Doorzoek geladen kaartobjecten en landelijke locaties via de officiële PDOK Locatieserver.</p>}{objectResults.length ? <><p className="sectionLabel">KAARTOBJECTEN</p><div className="searchResults">{objectResults.map((entity) => <button key={entity.id} onClick={() => { if (entity.geometry?.center) worldStore.execute({ type: "navigate_to", position: entity.geometry.center, zoom: entity.type === "building" || entity.type === "parcel" ? 17 : 13, label: entity.name }); worldStore.execute({ type: "select_entity", entityId: entity.id }); }}><b>{entity.name}</b><small>{entity.type} · {entity.provenance[0]?.sourceLabel ?? "bron niet geregistreerd"}</small></button>)}</div></> : normalizedQuery.length >= 2 ? <p className="panelHint">Geen geladen kaartobjecten gevonden.</p> : null}{locations.length ? <><p className="sectionLabel">LOCATIES</p><div className="searchResults">{locations.map((location) => <button key={location.externalId} onClick={() => { worldStore.execute({ type: "navigate_to", position: [location.longitude, location.latitude], zoom: location.recommendedZoom, label: location.name }); if (location.entityType) { const id = entityId(`pdok-${location.entityType}-${location.externalId}`); worldStore.replaceEntities([...Object.values(worldStore.getState().entities), { id, type: location.entityType, name: location.name, description: `${location.kind} gevonden via de officiële PDOK Location API.`, geometry: { kind: "point", center: [location.longitude, location.latitude], coordinateSystem: "WGS84" }, properties: { identificatie: location.externalId, locationKind: location.kind }, provenance: [location.provenance] }]); worldStore.execute({ type: "select_entity", entityId: id }); worldStore.execute({ type: "set_active_tool", tool: "explore" }); } }}><b>{location.name}</b><small>PDOK Locatieserver · geverifieerd</small></button>)}</div></> : null}</>;
}
function AccessibilityView({ entity, entities }: { entity: NonNullable<ReturnType<typeof worldStore.getState>["entities"][string]>; entities: ReturnType<typeof worldStore.getState>["entities"] }) {
  const profile = useMemo(() => buildProximityBaseline(entity, Object.values(entities)), [entity, entities]);
  const nearby = useMemo(() => buildNearbyAmenities(entity, Object.values(entities)), [entity, entities]);
  if (!profile?.measures.length) return <Empty title="Geen voorzieningen geladen" text="Zoom eventueel in met de voorzieningenlaag actief. Lumen berekent pas iets wanneer er herleidbare voorzieningen beschikbaar zijn." />;
  return <><div className="methodNotice"><b>Indicatieve nabijheid · geen bereikbaarheidsscore</b><span>Hemelsbreed · looptijd geschat met 80 m/min · geen route over wegennet of dienstregeling</span></div><p className="sectionLabel">BEREIK</p><div className="accessibilityList">{profile.measures.toSorted((left, right) => (left.distanceMeters ?? Number.POSITIVE_INFINITY) - (right.distanceMeters ?? Number.POSITIVE_INFINITY)).map((measure) => <div key={measure.destinationType}><span><b>{measure.destinationType.replaceAll("_", " ")}</b><small>{measure.count5} / {measure.count10} / {measure.count15} binnen circa 400 / 800 / 1.200 meter</small><EvidenceMeta source={measure.provenance} expanded /></span><strong>{measure.distanceMeters?.toLocaleString("nl-NL") ?? "–"} m · ca. {measure.minutes ?? "–"} min</strong></div>)}</div>{nearby.length ? <><p className="sectionLabel">DICHTSTBIJZIJND VIA OSM</p><div className="accessibilityList">{nearby.map((amenity) => <div key={amenity.entityId}><span><b>{amenity.name}</b><small>{amenity.category}</small><EvidenceMeta source={amenity.provenance} /></span><strong>{amenity.distanceMeters.toLocaleString("nl-NL")} m</strong></div>)}</div></> : null}</>;
}
const dimensionLabels = { planning: "Planologisch", physical: "Fysiek", "environment-safety": "Milieu & veiligheid", accessibility: "Bereikbaarheid", "market-program": "Markt & programma", deliverability: "Uitvoerbaarheid" } as const;
const statusLabels = { suitable: "Geschikt", attention: "Aandacht nodig", blocked: "Geblokkeerd", "needs-research": "Nader onderzoek nodig" } as const;
function AnalyzePanel() {
  const state = useWorldState();
  const selected = state.selectedEntityId ? state.entities[state.selectedEntityId] : null;
  const assessment = useMemo(() => {
    if (!selected) return null;
    const provenance = selected.provenance[0] ?? { sourceId: "missing", sourceLabel: "Geen bron gekoppeld", retrievedAt: "", confidence: "unknown" as const, limitations: ["Objecteigenschappen hebben geen herleidbare bron en zijn daarom niet beoordeeld."] };
    return assessKnownSuitability(selected.provenance.length ? knownSuitabilityInputs(selected) : {}, provenance);
  }, [selected]);
  if (!selected || !assessment) return <Empty title="Kies een locatie" text="Selecteer een gebouw, perceel of getekend vlak om de beschikbare analyses te zien." />;
  const source = selected.provenance[0];
  return <>
    <p className="panelDescription">Beoordelingen blijven gescheiden; harde blokkades worden nooit weggemiddeld.</p>
    {assessment.blockers.length ? <div className="analysisSection"><p className="sectionLabel">BLOKKADES & VOORWAARDEN</p>{assessment.blockers.map((blocker) => <div className="methodNotice" key={blocker.code}><b>{blocker.label}</b><span>{blocker.explanation}</span><EvidenceMeta source={blocker.provenance} expanded /></div>)}</div> : null}
    {assessment.dimensions.map((dimension) => <div className="analysisRow" key={dimension.dimension}><span>{dimensionLabels[dimension.dimension]}<small>{dimension.status === "needs-research" ? "Geen beoordeelbare bronwaarde" : `Confidence ${dimension.confidence}`}</small></span><b>{statusLabels[dimension.status]}</b></div>)}
    <div className="methodNotice"><b>Analyseverantwoording</b><span>{formatEvidenceDate(assessment.assessedAt)} · methode {assessment.methodVersion}</span>{source ? <EvidenceMeta source={source} expanded /> : <small className="evidenceMeta missing">Geen herleidbare objectbron; alle dimensies blijven nader onderzoek nodig.</small>}</div>
    <div className="analysisSection"><p className="sectionLabel">BEREIKBAARHEIDSBASELINE</p><AccessibilityView entity={selected} entities={state.entities} /></div>
  </>;
}
function DrawPanel({ onResult }: { onResult: (result: WorldCommandResult) => void }) { const state = useWorldState(); return <><p className="panelDescription">Teken en meet in 2D. Opgeslagen geometrie blijft ook zichtbaar in 3D.</p><div className="drawTools">{(["point","line","polygon","rectangle"] as const).map((mode) => <button key={mode} disabled={state.renderer !== "map-2d"} className={state.drawingMode === mode ? "active" : ""} onClick={() => onResult(worldStore.execute({ type: "set_drawing_mode", mode: state.drawingMode === mode ? null : mode }))}>{({ point: "Punt", line: "Lijn", polygon: "Vlak", rectangle: "Rechthoek" })[mode]}</button>)}</div><div className="drawingActions"><button disabled={!state.drawingUndoStack.length} onClick={() => onResult(worldStore.execute({ type: "undo_drawing_change" }))}>Ongedaan</button><button disabled={!state.drawingRedoStack.length} onClick={() => onResult(worldStore.execute({ type: "redo_drawing_change" }))}>Opnieuw</button>{state.drawingMode ? <button onClick={() => onResult(worldStore.execute({ type: "set_drawing_mode", mode: null }))}>Annuleer tekenen</button> : null}{state.editingDrawingId ? <button onClick={() => onResult(worldStore.execute({ type: "set_editing_drawing", drawingId: null }))}>Vorm afronden</button> : null}</div>{state.renderer !== "map-2d" ? <p className="panelHint">Schakel naar 2D om geometrie te tekenen of bewerken.</p> : <p className="panelHint">{state.drawingMode ? "Klik om punten te plaatsen. Dubbelklik om een lijn of vlak af te ronden." : state.editingDrawingId ? "Versleep de gemarkeerde hoekpunten op de kaart. Iedere drag is apart ongedaan te maken." : "Kies een tekentool of bewerk een bestaande vorm."}</p>}{state.drawings.map((drawing) => <DrawingRow key={drawing.id} drawing={drawing} editingShape={state.editingDrawingId === drawing.id} onResult={onResult} />)}</>; }
const drawingColors = [{ value: "#315df0", label: "Lumen blauw" }, { value: "#d9ad63", label: "Warm geel" }, { value: "#6f7b94", label: "Leigrijs" }, { value: "#b75c55", label: "Signaalrood" }, { value: "#5f8c72", label: "Groen" }] as const;
function DrawingRow({ drawing, editingShape, onResult }: { drawing: ReturnType<typeof worldStore.getState>["drawings"][number]; editingShape: boolean; onResult: (result: WorldCommandResult) => void }) {
  const [editing, setEditing] = useState(false); const [name, setName] = useState(drawing.name); const [note, setNote] = useState(drawing.note ?? ""); const [color, setColor] = useState(drawing.color);
  useEffect(() => { if (!editing) { setName(drawing.name); setNote(drawing.note ?? ""); setColor(drawing.color); } }, [drawing.color, drawing.name, drawing.note, editing]);
  const measurement = useMemo(() => measureDrawing(drawing), [drawing]);
  const measurementLabel = measurement.areaSquareMeters > 0 ? `${Math.round(measurement.areaSquareMeters).toLocaleString("nl-NL")} m² · ${Math.round(measurement.lengthMeters).toLocaleString("nl-NL")} m omtrek` : `${Math.round(measurement.lengthMeters).toLocaleString("nl-NL")} m`;
  return <div className={`drawingRow ${editing || editingShape ? "editing" : ""}`}><span><b><i className="drawingColor" style={{ backgroundColor: drawing.color }} />{drawing.name}</b><small>{drawing.kind} · {measurementLabel} · versie {drawing.version}</small></span>{editing ? <div className="drawingEditor"><input aria-label="Naam tekening" value={name} onChange={(event) => setName(event.target.value)} /><textarea aria-label="Notitie tekening" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Notitie" /><fieldset className="drawingPalette"><legend>Kleur</legend>{drawingColors.map((option) => <button type="button" key={option.value} aria-label={`Kleur ${option.label}`} aria-pressed={color === option.value} className={color === option.value ? "active" : ""} style={{ backgroundColor: option.value }} onClick={() => setColor(option.value)} />)}</fieldset><button onClick={() => { onResult(worldStore.execute({ type: "update_drawing", drawingId: drawing.id, changes: { name: name.trim() || drawing.name, note: note.trim() || undefined, color } })); setEditing(false); }}>Bewaar</button><button onClick={() => { setName(drawing.name); setNote(drawing.note ?? ""); setColor(drawing.color); setEditing(false); }}>Annuleer</button></div> : <div className="drawingActions">{drawing.kind === "polygon" || drawing.kind === "rectangle" ? <button onClick={() => onResult(worldStore.execute({ type: "analyze_drawing", drawingId: drawing.id }))}>Analyseer</button> : null}<button className={editingShape ? "active" : ""} onClick={() => onResult(worldStore.execute({ type: "set_editing_drawing", drawingId: editingShape ? null : drawing.id }))}>{editingShape ? "Vorm afronden" : "Vorm bewerken"}</button><button onClick={() => setEditing(true)}>Details</button><button onClick={() => onResult(worldStore.execute({ type: "delete_drawing", drawingId: drawing.id }))}>Verwijder</button></div>}</div>;
}
const comparisonFields: readonly { id: string; label: string; value: (entity: NonNullable<ReturnType<typeof worldStore.getState>["entities"][string]>) => string | number | boolean | null }[] = [
  { id: "type", label: "Objecttype", value: (entity) => entity.type },
  { id: "area", label: "Oppervlakte", value: (entity) => entity.properties.kadastraleOppervlakteM2 ?? entity.properties.areaM2 ?? entity.properties.oppervlakte ?? null },
  { id: "buildYear", label: "Bouwjaar", value: (entity) => entity.properties.bouwjaar ?? null },
  { id: "status", label: "Status", value: (entity) => entity.properties.status ?? null },
  { id: "use", label: "Gebruiksdoel", value: (entity) => entity.properties.gebruiksdoel ?? null },
];

function ComparePanel({ onResult }: { onResult: (result: WorldCommandResult) => void }) {
  const state = useWorldState();
  const entities = state.comparisonEntityIds.flatMap((id) => state.entities[id] ? [state.entities[id]!] : []);
  if (!entities.length) return <Empty title="Nog geen objecten" text="Voeg vanuit Verkennen maximaal vier gebouwen of locaties toe. Ontbrekende waarden blijven zichtbaar als onbekend." />;
  const gridTemplateColumns = `82px repeat(${entities.length}, minmax(112px, 1fr))`;
  return <>
    <div className="comparisonHeader"><p>{entities.length} van maximaal 4 objecten</p><button onClick={() => onResult(worldStore.execute({ type: "clear_comparison" }))}>Wis alles</button></div>
    <div className="comparisonMatrix" role="table" aria-label="Objectvergelijking">
      <div className="comparisonRow comparisonObjects" style={{ gridTemplateColumns }} role="row"><b role="columnheader">Kenmerk</b>{entities.map((entity) => <div role="columnheader" key={entity.id}><strong>{entity.name}</strong><small>{entity.provenance[0]?.sourceLabel ?? "Bron niet geregistreerd"}</small><span><button onClick={() => onResult(worldStore.execute({ type: "select_entity", entityId: entity.id }))}>Open</button><button aria-label={`Verwijder ${entity.name}`} onClick={() => onResult(worldStore.execute({ type: "toggle_comparison_entity", entityId: entity.id }))}>×</button></span></div>)}</div>
      {comparisonFields.map((field) => <div className="comparisonRow" style={{ gridTemplateColumns }} role="row" key={field.id}><b role="rowheader">{field.label}</b>{entities.map((entity) => { const value = field.value(entity); const source = entity.provenance[0]; return <div role="cell" className={value === null ? "unknown" : "known"} key={entity.id}>{value === null ? <><span>Onbekend</span><small>Niet geleverd door de geladen bron.</small></> : <><strong>{`${String(value)}${field.id === "area" ? " m²" : ""}`}</strong><EvidenceMeta source={source} expanded /></>}</div>; })}</div>)}
    </div>
    <p className="panelHint">Waarden blijven gekoppeld aan de geregistreerde objectbron. “Onbekend” betekent dat de geladen bron dit gegeven niet levert.</p>
  </>;
}
const scenarioInputFields: readonly { key: keyof ScenarioInputs; label: string; min: number; max: number; step: number; suffix: string }[] = [
  { key: "siteAreaM2", label: "Terrein", min: 100, max: 2_000_000, step: 100, suffix: "m²" },
  { key: "coverageRatio", label: "Bebouwing", min: .05, max: .9, step: .05, suffix: "ratio" },
  { key: "floors", label: "Bouwlagen", min: 1, max: 80, step: 1, suffix: "lagen" },
  { key: "grossToNetRatio", label: "Bruto-netto", min: .5, max: .95, step: .01, suffix: "ratio" },
  { key: "averageHomeAreaM2", label: "Gem. woning", min: 25, max: 250, step: 5, suffix: "m²" },
  { key: "constructionCostPerGfaM2", label: "Bouwkosten", min: 500, max: 10_000, step: 100, suffix: "€/m² bvo" },
  { key: "preparationMonths", label: "Voorbereiding", min: 0, max: 240, step: 1, suffix: "mnd" },
  { key: "constructionMonthsPer10kGfa", label: "Bouwtempo", min: 1, max: 120, step: 1, suffix: "mnd/10k m²" },
] as const;

const defaultScenarioInputs: ScenarioInputs = { siteAreaM2: 10_000, coverageRatio: .4, floors: 5, grossToNetRatio: .78, averageHomeAreaM2: 75, constructionCostPerGfaM2: 2_500, preparationMonths: 24, constructionMonthsPer10kGfa: 14 };

function ProjectsPanel({ onResult, onSaveProject, canPersist, organizationId }: { onResult: (result: WorldCommandResult) => void; onSaveProject?: () => Promise<void>; canPersist: boolean; organizationId?: string }) {
  const state = useWorldState();
  const [scenarioName, setScenarioName] = useState("Basisscenario");
  const [inputs, setInputs] = useState<ScenarioInputs>(() => ({ ...defaultScenarioInputs }));
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<readonly SavedProjectSummary[]>([]);
  const [portfolioStatus, setPortfolioStatus] = useState(canPersist ? "Projecten laden…" : "");
  const [reloadKey, setReloadKey] = useState(0);
  const openController = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!canPersist) return;
    const controller = new AbortController(); setPortfolioStatus("Projecten laden…");
    void listSavedProjects(organizationId, controller.signal).then((items) => { setProjects(items); setPortfolioStatus(items.length ? "" : "Nog geen opgeslagen projecten."); }).catch((error) => { if (error instanceof Error && error.name !== "AbortError") setPortfolioStatus(error.message); });
    return () => controller.abort();
  }, [canPersist, organizationId, reloadKey]);
  useEffect(() => () => openController.current?.abort(), []);
  const portfolio = canPersist ? <section className="projectPortfolio"><div className="portfolioHeading"><span><b>Opgeslagen projecten</b><small>{organizationId ? "Organisatiewerkruimte" : "Persoonlijke werkruimte"}</small></span><button aria-label="Ververs projecten" onClick={() => setReloadKey((key) => key + 1)}>↻</button></div>{portfolioStatus ? <p className="panelHint" role="status">{portfolioStatus}</p> : null}<div className="portfolioList">{projects.map((project) => <button key={project.id} className={state.activeProject?.id === project.id ? "active" : ""} onClick={async () => { openController.current?.abort(); const controller = new AbortController(); openController.current = controller; setPortfolioStatus(`${project.name} openen…`); try { const loaded = await openSavedProject(project, organizationId, controller.signal); if (!controller.signal.aborted) setPortfolioStatus(`${project.name} geopend · ${loaded.drawings} tekening${loaded.drawings === 1 ? "" : "en"} · ${loaded.milestones} mijlpa${loaded.milestones === 1 ? "al" : "len"}${loaded.scenario ? ` · scenario ${loaded.scenario}` : ""}.`); } catch (error) { if (!(error instanceof Error && error.name === "AbortError")) setPortfolioStatus(error instanceof Error ? error.message : "Project kon niet worden geopend."); } }}><span><b>{project.name}</b><small>{project.status} · bijgewerkt {formatEvidenceDate(project.updated_at)}</small></span><i>Open</i></button>)}</div></section> : null;
  if (!state.activeProject) return <>{portfolio}<Empty title="Nog geen actief project" text="Open een opgeslagen project of selecteer een locatie en maak vanuit Verkennen een nieuw project." /></>;
  const site = state.activeProject.siteId ? state.entities[state.activeProject.siteId] : null;
  const estimate = state.scenarioEstimate;
  return <>
    {portfolio}
    <p className="sectionLabel">ACTIEF PROJECT</p><h3 className="panelProjectTitle">{state.activeProject.name}</h3>
    <p className="panelHint">{site ? `Locatie: ${site.name}` : state.activeProject.siteId ? `Locatieobject ${state.activeProject.siteId} is nog niet in de kaart geladen` : "Geen projectlocatie gekoppeld"} · {state.activeProject.persistence === "saved" ? "privé opgeslagen" : "alleen deze sessie"}</p>
    {state.activeProject.persistence !== "saved" ? canPersist && onSaveProject ? <button className="panelTextButton" disabled={saving} onClick={async () => { setSaving(true); try { await onSaveProject(); setReloadKey((key) => key + 1); } finally { setSaving(false); } }}>{saving ? "Opslaan…" : "Project privé opslaan"}</button> : <p className="panelHint">Meld je aan met projectopslag om dit project, tekeningen en scenario’s privé te bewaren.</p> : null}
    <MilestonePlanner onResult={onResult} />
    {!state.activeScenario ? <form className="scenarioCreate" onSubmit={(event) => { event.preventDefault(); onResult(worldStore.execute({ type: "create_scenario", name: scenarioName.trim() })); }}><label htmlFor="scenario-name">Nieuw scenario</label><div><input id="scenario-name" value={scenarioName} onChange={(event) => setScenarioName(event.target.value)} minLength={2} maxLength={80} required /><button type="submit">Maak scenario</button></div></form> : <>
      <div className="scenarioHeading"><span><small>SCENARIO</small><b>{state.activeScenario.name}</b></span><em>Indicatief</em></div>
      <form className="scenarioForm" onSubmit={(event) => { event.preventDefault(); onResult(worldStore.execute({ type: "estimate_scenario", inputs })); }}>
        {scenarioInputFields.map((field) => <label key={field.key}><span>{field.label}<small>{field.suffix}</small></span><input aria-label={field.label} type="number" value={inputs[field.key]} min={field.min} max={field.max} step={field.step} onChange={(event) => setInputs((current) => ({ ...current, [field.key]: Number(event.target.value) }))} /></label>)}
        <button className="primaryButton" type="submit">Bereken indicatie</button>
      </form>
      {estimate ? <div className="scenarioResult"><div className="scenarioMetrics"><div><small>WONINGEN</small><strong>{estimate.homes.low}–{estimate.homes.high}</strong></div><div><small>BVO</small><strong>{estimate.grossFloorAreaM2.toLocaleString("nl-NL")} m²</strong></div><div><small>BOUWKOSTEN</small><strong>€{Math.round(estimate.constructionCostEur.low / 1_000_000)}–{Math.round(estimate.constructionCostEur.high / 1_000_000)} mln</strong></div><div><small>DOORLOOPTIJD</small><strong>{estimate.durationMonths.low}–{estimate.durationMonths.high} mnd</strong></div></div>{estimate.riskFlags.length ? <div className="scenarioNotes"><b>Aandachtspunten</b>{estimate.riskFlags.map((flag) => <p key={flag}>{flag}</p>)}</div> : null}<details className="scenarioMethod"><summary>Methode en beperkingen</summary><span>{estimate.methodVersion}</span>{estimate.assumptions.map((assumption) => <p key={assumption}>{assumption}</p>)}</details><button className="panelTextButton" disabled={!site?.geometry?.bounds} onClick={() => onResult(worldStore.execute({ type: "generate_scenario_geometry" }))}>Toon indicatief volume in 2D en 3D</button>{!site?.geometry?.bounds ? <p className="panelHint">Voor massing is een projectlocatie met geometrische bounds nodig.</p> : null}</div> : null}
    </>}
  </>;
}

function MilestonePlanner({ onResult }: { onResult: (result: WorldCommandResult) => void }) {
  const state = useWorldState(); const [label, setLabel] = useState(""); const [date, setDate] = useState("");
  if (!state.activeProject) return null;
  return <section className="milestonePlanner"><p className="sectionLabel">PLANNING</p><form className="scenarioCreate" onSubmit={(event) => { event.preventDefault(); const value = label.trim(); if (!value) return; onResult(worldStore.execute({ type: "add_project_milestone", milestone: { id: crypto.randomUUID(), projectId: state.activeProject!.id, label: value, status: "planned", ...(date ? { plannedAt: new Date(`${date}T12:00:00.000Z`).toISOString() } : {}) } })); setLabel(""); setDate(""); }}><label htmlFor="milestone-label">Nieuwe mijlpaal</label><div><input id="milestone-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Bijv. vergunning indienen" maxLength={240} required /><input aria-label="Geplande datum" type="date" value={date} onChange={(event) => setDate(event.target.value)} /><button type="submit">Voeg toe</button></div></form><div className="milestoneList">{state.projectMilestones.map((milestone) => <div className="milestoneRow" key={milestone.id}><span><b>{milestone.label}</b><small>{milestone.plannedAt ? `Gepland ${new Date(milestone.plannedAt).toLocaleDateString("nl-NL")}` : "Geen datum"}</small></span><select aria-label={`Status van ${milestone.label}`} value={milestone.status} onChange={(event) => { const status = event.target.value as typeof milestone.status; onResult(worldStore.execute({ type: "update_project_milestone", milestoneId: milestone.id, changes: { status, completedAt: status === "complete" ? new Date().toISOString() : undefined } })); }}><option value="planned">Gepland</option><option value="active">Actief</option><option value="complete">Afgerond</option><option value="blocked">Geblokkeerd</option></select><button aria-label={`Verwijder ${milestone.label}`} onClick={() => onResult(worldStore.execute({ type: "delete_project_milestone", milestoneId: milestone.id }))}>×</button></div>)}</div>{!state.projectMilestones.length ? <p className="panelHint">Nog geen projectmijlpalen. Vergunningen en aanbestedingen verschijnen pas na een herleidbare bronkoppeling.</p> : null}</section>;
}
function Empty({ title, text }: { title: string; text: string }) { return <div className="panelEmpty"><Icon name="spark" /><b>{title}</b><p>{text}</p></div>; }
