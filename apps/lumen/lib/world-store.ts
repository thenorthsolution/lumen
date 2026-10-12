"use client";

import { useSyncExternalStore } from "react";
import {
  entityId,
  layerId,
  projectId,
  scenarioId,
  DATA_SOURCE_CATALOG,
  TASK_PRESETS,
  calculateIndicativeScenario,
  generateIndicativeMassing,
  measureDrawing,
  type LayerDefinition,
  type WorldCommand,
  type WorldCommandResult,
  type WorldEntity,
  type WorldState,
} from "@lumen/world";

export const layerRegistry: readonly LayerDefinition[] = [
  { id: layerId("buildings"), label: "Gebouwen", description: "BAG-panden; details worden pas na selectie geladen", category: "context", defaultVisible: true, supportedRenderers: ["map-2d", "world-3d"], sourceIds: ["bag"], coverage: "national", minZoom: 14.5 },
  { id: layerId("parcels"), label: "Percelen", description: "Open kadastrale perceelgrenzen", category: "context", defaultVisible: true, supportedRenderers: ["map-2d", "world-3d"], sourceIds: ["brk"], coverage: "national", minZoom: 14 },
  { id: layerId("vegetation"), label: "Bomen", description: "BGT-vegetatieobjecten", category: "context", defaultVisible: true, supportedRenderers: ["world-3d"], sourceIds: ["bgt"], coverage: "national", minZoom: 15 },
  { id: layerId("amenities"), label: "Voorzieningen", description: "Gebouwen met een herleidbare voorzieningsfunctie", category: "context", defaultVisible: true, supportedRenderers: ["map-2d"], sourceIds: ["openstreetmap"], coverage: "national", minZoom: 13 },
  { id: layerId("vacancy"), label: "Leegstand", description: "Brongebonden transformatiesignalen", category: "opportunity", defaultVisible: true, supportedRenderers: ["map-2d", "world-3d"], sourceIds: ["bag"], coverage: "national", minZoom: 14 },
  { id: layerId("mobility"), label: "Mobiliteit", description: "Stations en bereikbaarheid", category: "context", defaultVisible: false, supportedRenderers: ["map-2d"], sourceIds: ["cbs"], coverage: "national", minZoom: 10 },
  { id: layerId("constraints"), label: "Randvoorwaarden", description: "Planologische en fysieke beperkingen", category: "constraint", defaultVisible: false, supportedRenderers: ["map-2d", "world-3d"], sourceIds: ["dso"], coverage: "national", minZoom: 10 },
];

const availableSourceIds = new Set(DATA_SOURCE_CATALOG.filter((source) => source.availability === "available").map((source) => source.id));
export const layerIsAvailable = (layer: LayerDefinition) => layer.sourceIds.length > 0 && layer.sourceIds.every((sourceId) => availableSourceIds.has(sourceId));

const initialState: WorldState = {
  camera: { center: [6.1552, 52.255], zoom: 14.2, bearing: -8, pitch: 0 },
  renderer: "map-2d",
  selectedEntityId: null,
  hoveredEntityId: null,
  entities: {},
  layers: Object.fromEntries(layerRegistry.map((layer) => [layer.id, { visible: layer.defaultVisible && layerIsAvailable(layer) && layer.supportedRenderers.includes("map-2d"), status: layer.id === "buildings" ? "idle" as const : "ready" as const }])),
  annotations: [], workspace: { id: "public-world-session" as never, name: "Nederlandse verkenning" },
  activeProject: null, activeScenario: null, scenarioEstimate: null, scenarioObjects: [], projectMilestones: [], execution: { status: "idle" },
  activeTool: "layers", taskPreset: "living", drawings: [], drawingMode: null, editingDrawingId: null, drawingUndoStack: [], drawingRedoStack: [],
  comparisonEntityIds: [],
};

let state = initialState;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const update = (next: WorldState) => { state = next; emit(); };

const normalizeSearchText = (value: unknown) => String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("nl-NL");

function entityArea(entity: WorldEntity) {
  for (const key of ["oppervlakte", "areaM2", "siteAreaM2", "estimatedAreaM2"]) {
    const raw = entity.properties[key];
    if (raw === null || raw === undefined || raw === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function matchingEntities(command: Extract<WorldCommand, { type: "find_and_select_entity" }>) {
  const tokens = normalizeSearchText(command.query).split(/\s+/).filter(Boolean);
  const [longitude, latitude] = state.camera.center;
  return Object.values(state.entities).flatMap((entity) => {
    if (command.entityType && entity.type !== command.entityType) return [];
    const buildYear = Number(entity.properties.bouwjaar);
    if (command.minimumBuildYear !== undefined && (!Number.isFinite(buildYear) || buildYear < command.minimumBuildYear)) return [];
    if (command.maximumBuildYear !== undefined && (!Number.isFinite(buildYear) || buildYear > command.maximumBuildYear)) return [];
    const area = entityArea(entity);
    if (command.minimumAreaM2 !== undefined && (area === null || area < command.minimumAreaM2)) return [];
    if (command.maximumAreaM2 !== undefined && (area === null || area > command.maximumAreaM2)) return [];
    if (command.candidateOnly && entity.properties.candidate !== true) return [];
    const haystack = normalizeSearchText([entity.name, entity.description, ...Object.values(entity.properties)].join(" "));
    if (tokens.some((token) => !haystack.includes(token))) return [];
    const center = entity.geometry?.center ?? (entity.geometry?.bounds ? [(entity.geometry.bounds[0] + entity.geometry.bounds[2]) / 2, (entity.geometry.bounds[1] + entity.geometry.bounds[3]) / 2] as const : null);
    const distance = center ? (center[0] - longitude) ** 2 + (center[1] - latitude) ** 2 : Number.POSITIVE_INFINITY;
    const score = tokens.reduce((total, token) => total + (normalizeSearchText(entity.name).includes(token) ? 4 : 1), 0);
    return [{ entity, score, distance }];
  }).sort((left, right) => right.score - left.score || left.distance - right.distance || left.entity.name.localeCompare(right.entity.name, "nl") || String(left.entity.id).localeCompare(String(right.entity.id)));
}

function camerasEqual(left: WorldState["camera"], right: WorldState["camera"]) {
  return Math.abs(left.center[0] - right.center[0]) < 0.000001
    && Math.abs(left.center[1] - right.center[1]) < 0.000001
    && Math.abs(left.zoom - right.zoom) < 0.001
    && Math.abs(left.bearing - right.bearing) < 0.01
    && Math.abs(left.pitch - right.pitch) < 0.01;
}

export const worldStore = {
  getState: () => state,
  subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
  reset() { update(initialState); },
  markProjectSaved(id: ReturnType<typeof projectId>) {
    if (!state.activeProject) return;
    const previousId = state.activeProject.id;
    update({
      ...state,
      activeProject: { ...state.activeProject, id, persistence: "saved" },
      activeScenario: state.activeScenario ? { ...state.activeScenario, projectId: id } : null,
      drawings: state.drawings.map((drawing) => drawing.projectId === previousId ? { ...drawing, projectId: id } : drawing),
      projectMilestones: state.projectMilestones.map((milestone) => milestone.projectId === previousId ? { ...milestone, projectId: id } : milestone),
      execution: { status: "complete", message: "Project privé opgeslagen." },
    });
  },
  markScenarioSaved(id: ReturnType<typeof scenarioId>) {
    if (!state.activeScenario) return;
    update({ ...state, activeScenario: { ...state.activeScenario, id }, execution: { status: "complete", message: "Scenario privé opgeslagen." } });
  },
  openSavedProject(input: {
    project: { id: string; name: string; siteId?: string | null; site?: WorldEntity | null };
    drawings: WorldState["drawings"];
    milestones?: WorldState["projectMilestones"];
    scenario?: { id: string; name: string; objects: WorldState["scenarioObjects"]; calculation?: WorldState["scenarioEstimate"] } | null;
  }) {
    const id = projectId(input.project.id);
    const site = input.project.site;
    const center = site?.geometry?.center ?? (site?.geometry?.bounds ? [(site.geometry.bounds[0] + site.geometry.bounds[2]) / 2, (site.geometry.bounds[1] + site.geometry.bounds[3]) / 2] as const : null);
    update({
      ...state,
      camera: center ? { ...state.camera, center, zoom: Math.max(state.camera.zoom, 15) } : state.camera,
      entities: site ? { ...state.entities, [site.id]: site } : state.entities,
      activeProject: { id, name: input.project.name, ...(input.project.siteId ? { siteId: entityId(input.project.siteId) } : {}), persistence: "saved" },
      activeScenario: input.scenario ? { id: scenarioId(input.scenario.id), projectId: id, name: input.scenario.name } : null,
      scenarioEstimate: input.scenario?.calculation ?? null,
      scenarioObjects: input.scenario?.objects ?? [],
      drawings: input.drawings,
      projectMilestones: input.milestones ?? [],
      drawingUndoStack: [], drawingRedoStack: [], drawingMode: null, editingDrawingId: null,
      execution: { status: "complete", message: `${input.project.name} geopend.` },
    });
  },
  setHovered(entity: string | null) {
    const next = entity ? entityId(entity) : null;
    if (state.hoveredEntityId === next) return;
    update({ ...state, hoveredEntityId: next });
  },
  replaceEntities(entities: readonly WorldEntity[]) {
    const pinnedIds = new Set([state.selectedEntityId, state.activeProject?.siteId, ...state.comparisonEntityIds].filter((id): id is NonNullable<typeof id> => id !== null && id !== undefined));
    const pinned = Object.values(state.entities).filter((entity) => pinnedIds.has(entity.id));
    const nextEntities = Object.fromEntries([...pinned, ...entities].map((entity) => [entity.id, entity]));
    update({ ...state, entities: nextEntities, selectedEntityId: state.selectedEntityId && nextEntities[state.selectedEntityId] ? state.selectedEntityId : null });
  },
  replaceEntitiesOfType(type: WorldEntity["type"], entities: readonly WorldEntity[]) {
    const pinnedIds = new Set([state.selectedEntityId, state.activeProject?.siteId, ...state.comparisonEntityIds].filter((id): id is NonNullable<typeof id> => id !== null && id !== undefined));
    const retained = Object.values(state.entities).filter((entity) => entity.type !== type || pinnedIds.has(entity.id));
    const nextEntities = Object.fromEntries([...retained, ...entities].map((entity) => [entity.id, entity]));
    update({ ...state, entities: nextEntities, selectedEntityId: state.selectedEntityId && nextEntities[state.selectedEntityId] ? state.selectedEntityId : null });
  },
  linkEntities(leftId: WorldEntity["id"], rightId: WorldEntity["id"]) {
    const left = state.entities[leftId]; const right = state.entities[rightId];
    if (!left || !right || leftId === rightId) return false;
    const leftRelated = new Set(left.relatedEntityIds ?? []); const rightRelated = new Set(right.relatedEntityIds ?? []);
    if (leftRelated.has(rightId) && rightRelated.has(leftId)) return true;
    leftRelated.add(rightId); rightRelated.add(leftId);
    update({ ...state, entities: { ...state.entities, [leftId]: { ...left, relatedEntityIds: Array.from(leftRelated) }, [rightId]: { ...right, relatedEntityIds: Array.from(rightRelated) } } });
    return true;
  },
  setLayerStatus(id: string, status: "idle" | "loading" | "ready" | "error", error?: string) {
    const current = state.layers[id];
    if (!current) return;
    if (current.status === status && current.error === error) return;
    const nextRuntime = error ? { ...current, status, error } : { visible: current.visible, status };
    update({ ...state, layers: { ...state.layers, [id]: nextRuntime } });
  },
  execute(command: WorldCommand): WorldCommandResult {
    const success = (message: string, affected: readonly (keyof WorldState)[]): WorldCommandResult => ({ status: "success", command: command.type, message, affected });
    if (command.type === "navigate_to") {
      update({ ...state, camera: { ...state.camera, center: command.position, zoom: command.zoom ?? state.camera.zoom }, execution: { status: "complete", message: `Genavigeerd naar ${command.label ?? "locatie"}.` } });
      return success("Camera bijgewerkt.", ["camera"]);
    }
    if (command.type === "set_camera") {
      if (!camerasEqual(state.camera, command.camera)) update({ ...state, camera: command.camera });
      return success("Camera bijgewerkt.", ["camera"]);
    }
    if (command.type === "orbit_camera") {
      if (state.renderer !== "world-3d") return { status: "rejected", command: command.type, message: "Camera-orbit is alleen beschikbaar in de 3D-weergave." };
      const bearing = ((state.camera.bearing + command.bearingDelta + 180) % 360 + 360) % 360 - 180;
      const pitch = Math.max(25, Math.min(82, state.camera.pitch + (command.pitchDelta ?? 0)));
      const zoom = Math.max(14, Math.min(20, state.camera.zoom + (command.zoomDelta ?? 0)));
      update({ ...state, camera: { ...state.camera, bearing, pitch, zoom }, execution: { status: "complete", message: "3D-camera gedraaid." } });
      return success("3D-camera rond het huidige middelpunt gedraaid.", ["camera"]);
    }
    if (command.type === "select_entity") {
      if (!state.entities[command.entityId]) return { status: "rejected", command: command.type, message: "Dit object bestaat niet in de huidige wereld." };
      update({ ...state, selectedEntityId: command.entityId, activeTool: "explore" }); return success("Object geselecteerd.", ["selectedEntityId", "activeTool"]);
    }
    if (command.type === "find_and_select_entity") {
      const match = matchingEntities(command)[0]?.entity;
      if (!match) return { status: "rejected", command: command.type, message: "Geen passend object gevonden binnen de geladen kaartdata." };
      update({ ...state, selectedEntityId: match.id, activeTool: "explore", execution: { status: "complete", message: `${match.name} geselecteerd.` } });
      return success(`${match.name} gevonden en geselecteerd op basis van de geladen kaartdata.`, ["selectedEntityId"]);
    }
    if (command.type === "deselect_entity") { update({ ...state, selectedEntityId: null }); return success("Selectie gewist.", ["selectedEntityId"]); }
    if (command.type === "set_layer_visibility") {
      const definition = layerRegistry.find((layer) => layer.id === command.layerId);
      if (!state.layers[command.layerId] || !definition) return { status: "rejected", command: command.type, message: "Onbekende laag." };
      if (command.visible && !layerIsAvailable(definition)) return { status: "rejected", command: command.type, message: `${definition.label} is nog niet aangesloten op een beschikbare bron.` };
      if (command.visible && !definition.supportedRenderers.includes(state.renderer)) return { status: "rejected", command: command.type, message: `${definition.label} is niet beschikbaar in de huidige weergave.` };
      update({ ...state, layers: { ...state.layers, [command.layerId]: { ...state.layers[command.layerId], visible: command.visible } } });
      return success(command.visible ? "Laag zichtbaar." : "Laag verborgen.", ["layers"]);
    }
    if (command.type === "set_renderer") {
      const camera = command.renderer === "world-3d"
        ? { ...state.camera, zoom: Math.max(16.1, state.camera.zoom), bearing: state.camera.pitch < 35 ? -22 : state.camera.bearing, pitch: Math.max(55, state.camera.pitch) }
        : { ...state.camera, pitch: 0 };
      update({ ...state, renderer: command.renderer, camera, execution: { status: "complete", message: command.renderer === "world-3d" ? "3D-weergave actief." : "2D-weergave actief." } });
      return success("Renderer gewijzigd.", ["renderer", "camera"]);
    }
    if (command.type === "set_active_tool") {
      update({ ...state, activeTool: command.tool });
      return success("Werktool geopend.", ["activeTool"]);
    }
    if (command.type === "set_task_preset") {
      const preset = TASK_PRESETS.find((candidate) => candidate.id === command.preset);
      if (!preset) return { status: "rejected", command: command.type, message: "Onbekende taakweergave." };
      const visible = new Set(preset.layerIds);
      const definitions = new Map(layerRegistry.map((layer) => [String(layer.id), layer]));
      const skipped = preset.layerIds.flatMap((id) => {
        const definition = definitions.get(id);
        if (!definition || !layerIsAvailable(definition)) return [definition?.label ?? id];
        if (!definition.supportedRenderers.includes(state.renderer)) return [`${definition.label} (${state.renderer === "map-2d" ? "alleen 3D" : "alleen 2D"})`];
        return [];
      });
      const layers = Object.fromEntries(Object.entries(state.layers).map(([id, runtime]) => {
        const definition = definitions.get(id);
        return [id, { ...runtime, visible: Boolean(definition && visible.has(id) && layerIsAvailable(definition) && definition.supportedRenderers.includes(state.renderer)) }];
      }));
      const message = skipped.length ? `${preset.label} actief. Niet geactiveerd: ${skipped.join(", ")}.` : `${preset.label} actief.`;
      update({ ...state, taskPreset: command.preset, layers, execution: { status: "complete", message } });
      return success(message, ["taskPreset", "layers"]);
    }
    if (command.type === "set_drawing_mode") {
      if (command.mode && state.renderer !== "map-2d") return { status: "rejected", command: command.type, message: "Tekenen is voorlopig alleen beschikbaar in 2D." };
      update({ ...state, drawingMode: command.mode, editingDrawingId: command.mode ? null : state.editingDrawingId, activeTool: "draw" });
      return success(command.mode ? `${command.mode} tekenen actief.` : "Tekenen gestopt.", ["drawingMode", "activeTool"]);
    }
    if (command.type === "set_editing_drawing") {
      if (command.drawingId && state.renderer !== "map-2d") return { status: "rejected", command: command.type, message: "Geometrie bewerken is alleen beschikbaar in 2D." };
      if (command.drawingId && !state.drawings.some((drawing) => drawing.id === command.drawingId)) return { status: "rejected", command: command.type, message: "Tekening niet gevonden." };
      update({ ...state, editingDrawingId: command.drawingId, drawingMode: command.drawingId ? null : state.drawingMode, activeTool: "draw" });
      return success(command.drawingId ? "Versleep de hoekpunten op de kaart." : "Geometriebewerking afgerond.", ["editingDrawingId", "drawingMode", "activeTool"]);
    }
    if (command.type === "add_drawing") {
      update({ ...state, drawingUndoStack: [...state.drawingUndoStack, state.drawings], drawingRedoStack: [], drawings: [...state.drawings, command.drawing], drawingMode: null, execution: { status: "complete", message: `${command.drawing.name} toegevoegd.` } });
      return success("Tekening toegevoegd.", ["drawings", "drawingMode"]);
    }
    if (command.type === "update_drawing") {
      const existing = state.drawings.find((drawing) => drawing.id === command.drawingId);
      if (!existing) return { status: "rejected", command: command.type, message: "Tekening niet gevonden." };
      const now = new Date().toISOString();
      update({ ...state, drawingUndoStack: [...state.drawingUndoStack, state.drawings], drawingRedoStack: [], drawings: state.drawings.map((drawing) => drawing.id === command.drawingId ? { ...drawing, ...command.changes, version: drawing.version + 1, updatedAt: now } : drawing) });
      return success("Tekening bijgewerkt.", ["drawings"]);
    }
    if (command.type === "delete_drawing") {
      update({ ...state, drawingUndoStack: [...state.drawingUndoStack, state.drawings], drawingRedoStack: [], drawings: state.drawings.filter((drawing) => drawing.id !== command.drawingId), editingDrawingId: state.editingDrawingId === command.drawingId ? null : state.editingDrawingId });
      return success("Tekening verwijderd.", ["drawings"]);
    }
    if (command.type === "undo_drawing_change") {
      const previous = state.drawingUndoStack.at(-1);
      if (!previous) return { status: "rejected", command: command.type, message: "Er is geen tekenwijziging om ongedaan te maken." };
      update({ ...state, drawings: previous, drawingUndoStack: state.drawingUndoStack.slice(0, -1), drawingRedoStack: [...state.drawingRedoStack, state.drawings] });
      return success("Tekenwijziging ongedaan gemaakt.", ["drawings", "drawingUndoStack", "drawingRedoStack"]);
    }
    if (command.type === "redo_drawing_change") {
      const next = state.drawingRedoStack.at(-1);
      if (!next) return { status: "rejected", command: command.type, message: "Er is geen tekenwijziging om opnieuw toe te passen." };
      update({ ...state, drawings: next, drawingUndoStack: [...state.drawingUndoStack, state.drawings], drawingRedoStack: state.drawingRedoStack.slice(0, -1) });
      return success("Tekenwijziging opnieuw toegepast.", ["drawings", "drawingUndoStack", "drawingRedoStack"]);
    }
    if (command.type === "analyze_drawing") {
      const drawing = state.drawings.find((candidate) => candidate.id === command.drawingId);
      if (!drawing || !["polygon", "rectangle"].includes(drawing.kind)) return { status: "rejected", command: command.type, message: "Alleen een vlak of rechthoek kan als bouwlocatie worden geanalyseerd." };
      const points = drawing.kind === "rectangle" && drawing.coordinates.length >= 2 ? [drawing.coordinates[0]!, drawing.coordinates[1]!] : drawing.coordinates;
      const longitudes = points.map((point) => point[0]); const latitudes = points.map((point) => point[1]);
      const bounds = [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)] as const;
      const id = entityId(`drawing-site-${drawing.id}`);
      const measurement = measureDrawing(drawing);
      const entity: WorldEntity = { id, type: "site", name: drawing.name, description: drawing.note ?? "Getekende kandidaatlocatie.", geometry: { kind: "polygon", bounds, center: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2], coordinateSystem: "WGS84" }, properties: { drawingId: drawing.id, areaM2: Math.round(measurement.areaSquareMeters), perimeterM: Math.round(measurement.lengthMeters), measurementMethod: measurement.methodVersion }, provenance: [{ sourceId: "user-drawing", sourceLabel: "Gebruikerstekening", retrievedAt: drawing.updatedAt, confidence: "low", assumptions: ["Geometrie is door een gebruiker getekend en niet officieel ingemeten.", ...measurement.limitations], methodVersion: measurement.methodVersion }] };
      update({ ...state, entities: { ...state.entities, [id]: entity }, selectedEntityId: id, activeTool: "analyze" });
      return success("Getekend vlak geopend voor analyse.", ["entities", "selectedEntityId", "activeTool"]);
    }
    if (command.type === "toggle_comparison_entity") {
      if (!state.entities[command.entityId]) return { status: "rejected", command: command.type, message: "Dit object bestaat niet in de huidige wereld." };
      const exists = state.comparisonEntityIds.includes(command.entityId);
      if (!exists && state.comparisonEntityIds.length >= 4) return { status: "rejected", command: command.type, message: "Vergelijk maximaal vier objecten tegelijk." };
      update({ ...state, comparisonEntityIds: exists ? state.comparisonEntityIds.filter((id) => id !== command.entityId) : [...state.comparisonEntityIds, command.entityId] });
      return success(exists ? "Object uit vergelijking verwijderd." : "Object aan vergelijking toegevoegd.", ["comparisonEntityIds"]);
    }
    if (command.type === "clear_comparison") { update({ ...state, comparisonEntityIds: [] }); return success("Vergelijking gewist.", ["comparisonEntityIds"]); }
    if (command.type === "create_annotation") { update({ ...state, annotations: [...state.annotations, command.annotation] }); return success("Annotatie toegevoegd.", ["annotations"]); }
    if (command.type === "rank_opportunities") {
      const opportunities = Object.values(state.entities).filter((entity) => entity.type === "opportunity" && entity.properties.candidate !== false).sort((a, b) => Number(b.properties.score ?? 0) - Number(a.properties.score ?? 0)).slice(0, command.limit ?? 5);
      if (!opportunities.length) return { status: "rejected", command: command.type, message: "Er zijn geen geladen kansen om te rangschikken." };
      update({ ...state, selectedEntityId: opportunities[0]!.id, execution: { status: "complete", message: `${opportunities.length} kansen gerangschikt.` } });
      return success(`${opportunities.length} kansen gerangschikt. ${opportunities[0]!.name} staat bovenaan.`, ["selectedEntityId"]);
    }
    if (command.type === "create_project") {
      if (command.siteId && !state.entities[command.siteId]) return { status: "rejected", command: command.type, message: "De gekozen locatie bestaat niet in de huidige wereld." };
      const activeProject = { id: projectId(`session-${command.siteId ?? "untitled"}`), name: command.name.trim() || "Nieuw project", ...(command.siteId ? { siteId: command.siteId } : {}), persistence: "session" as const };
      update({ ...state, activeProject, activeScenario: null, scenarioEstimate: null, scenarioObjects: [], projectMilestones: [], execution: { status: "complete", message: `${activeProject.name} is als sessieproject aangemaakt.` } });
      return success(`${activeProject.name} is aangemaakt. Opslaan is nog niet beschikbaar.`, ["activeProject"]);
    }
    if (command.type === "create_scenario") {
      if (!state.activeProject) return { status: "rejected", command: command.type, message: "Maak eerst een project voor deze locatie." };
      const activeScenario = { id: scenarioId(`session-${state.activeProject.id}-${command.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`), projectId: state.activeProject.id, name: command.name };
      update({ ...state, activeScenario, scenarioEstimate: null, scenarioObjects: [], execution: { status: "complete", message: `${activeScenario.name} is als indicatief sessiescenario aangemaakt.` } });
      return success(`${activeScenario.name} is aangemaakt. Berekeningen zijn indicatief en nog niet opgeslagen.`, ["activeScenario"]);
    }
    if (command.type === "estimate_scenario") {
      if (!state.activeScenario) return { status: "rejected", command: command.type, message: "Maak eerst een scenario." };
      const calculated = calculateIndicativeScenario(command.inputs);
      if (calculated.status === "invalid") return { status: "rejected", command: command.type, message: calculated.issues.join(" ") };
      update({ ...state, scenarioEstimate: calculated.estimate, execution: { status: "complete", message: "Indicatief scenario berekend." } });
      return success(`Indicatie: ${calculated.estimate.homes.low} tot ${calculated.estimate.homes.high} woningen, circa €${Math.round(calculated.estimate.constructionCostEur.expected / 1_000_000)} miljoen bouwkosten.`, ["scenarioEstimate"]);
    }
    if (command.type === "generate_scenario_geometry") {
      if (!state.activeProject || !state.activeScenario || !state.scenarioEstimate) return { status: "rejected", command: command.type, message: "Maak en bereken eerst een scenario." };
      const site = state.activeProject.siteId ? state.entities[state.activeProject.siteId] : null;
      if (!site?.geometry?.bounds) return { status: "rejected", command: command.type, message: "De projectlocatie heeft geen bruikbare bounds." };
      const object = generateIndicativeMassing(`massing-${state.activeScenario.id}`, site.geometry.bounds, state.scenarioEstimate, new Date().toISOString());
      update({ ...state, scenarioObjects: [object], execution: { status: "complete", message: "Indicatief bouwvolume gegenereerd." } });
      return success("Indicatief bouwvolume is in de wereld geplaatst.", ["scenarioObjects"]);
    }
    if (command.type === "add_project_milestone") {
      if (!state.activeProject || command.milestone.projectId !== state.activeProject.id) return { status: "rejected", command: command.type, message: "De mijlpaal hoort niet bij het actieve project." };
      update({ ...state, projectMilestones: [...state.projectMilestones, command.milestone] });
      return success("Mijlpaal toegevoegd.", ["projectMilestones"]);
    }
    if (command.type === "update_project_milestone") {
      if (!state.projectMilestones.some((milestone) => milestone.id === command.milestoneId)) return { status: "rejected", command: command.type, message: "Mijlpaal niet gevonden." };
      update({ ...state, projectMilestones: state.projectMilestones.map((milestone) => milestone.id === command.milestoneId ? { ...milestone, ...command.changes } : milestone) });
      return success("Mijlpaal bijgewerkt.", ["projectMilestones"]);
    }
    if (command.type === "delete_project_milestone") {
      update({ ...state, projectMilestones: state.projectMilestones.filter((milestone) => milestone.id !== command.milestoneId) });
      return success("Mijlpaal verwijderd.", ["projectMilestones"]);
    }
    const messages: Record<"save_workspace" | "voice_start", string> = {
      save_workspace: "Opslaan vereist nog organisatie-autorisatie en een projectrepository.", voice_start: "Realtime spraak is nog niet verbonden met een provider.",
    };
    update({ ...state, execution: { status: "complete", message: messages[command.type] } });
    return { status: "unavailable", command: command.type, message: messages[command.type] };
  },
};

export function useWorldState() {
  return useSyncExternalStore(worldStore.subscribe, worldStore.getState, worldStore.getState);
}

export function useWorldSelector<T>(selector: (state: WorldState) => T) {
  return useSyncExternalStore(
    worldStore.subscribe,
    () => selector(worldStore.getState()),
    () => selector(worldStore.getState()),
  );
}
