import { DATA_SOURCE_CATALOG, assessKnownSuitability, buildEntityFacet, buildProximityBaseline, knownSuitabilityInputs, measureDrawing, type EntityFacetId, type Provenance, type WorldEntity, type WorldState } from "@lumen/world";
import { layerRegistry } from "@/lib/world-store";

const AI_PROPERTY_ALLOWLIST = [
  "identificatie", "status", "bouwjaar", "oppervlakte", "areaM2", "perimeterM",
  "gebruiksdoel", "score", "candidate", "estimatedHomes", "poiCategory", "amenity",
  "permittedUse", "buildProhibition", "contaminated", "floodRisk", "accessAvailable",
  "ownershipCount", "methodology", "measurementMethod",
  "code", "areaKind", "municipality", "municipalityCode", "districtCode", "parentCode", "parentName", "residents", "year",
] as const;

function relevantFacetIds(entity: WorldEntity): readonly EntityFacetId[] {
  if (entity.type === "building") return ["overview", "energy", "market", "planning", "opportunities"];
  if (entity.type === "parcel" || entity.type === "site") return ["overview", "buildability", "planning", "environment", "accessibility", "delivery"];
  if (["region", "municipality", "district", "neighborhood"].includes(entity.type)) return ["population", "housing", "amenities", "market", "projects"];
  if (entity.type === "project") return ["program", "planning", "delivery", "documents", "history"];
  return ["overview"];
}

function sourceContext({ sourceId, sourceLabel, sourceUrl, retrievedAt, confidence, methodVersion, assumptions, limitations }: Provenance) {
  const boundedLimitations = Array.from(new Set([...(limitations ?? []), ...(assumptions ?? [])])).slice(0, 5);
  return { sourceId, sourceLabel, ...(sourceUrl ? { sourceUrl } : {}), retrievedAt: Number.isFinite(Date.parse(retrievedAt)) ? retrievedAt : null, confidence, ...(methodVersion ? { methodVersion } : {}), ...(boundedLimitations.length ? { limitations: boundedLimitations } : { limitationsMissing: true as const }) };
}

/** Builds the same bounded, source-aware view of the world for every AI provider. */
export function buildWorldAIContext(world: WorldState) {
  const layerDefinitions = new Map(layerRegistry.map((layer) => [String(layer.id), layer]));
  const sourceDefinitions = new Map(DATA_SOURCE_CATALOG.map((source) => [source.id, source]));
  const priority = (entity: WorldEntity) => entity.id === world.selectedEntityId ? 0 : entity.id === world.activeProject?.siteId ? 1 : world.comparisonEntityIds.includes(entity.id) ? 2 : 3;
  const allEntities = Object.values(world.entities).sort((left, right) => {
    return priority(left) - priority(right) || left.name.localeCompare(right.name, "nl");
  });
  const entityCounts = allEntities.reduce<Record<string, number>>((counts, entity) => {
    counts[entity.type] = (counts[entity.type] ?? 0) + 1;
    return counts;
  }, {});
  // The viewport can contain thousands of renderable objects. The model gets a
  // small relevance-ranked index; exact facts remain available through the
  // catalog tools instead of being duplicated into every prompt.
  const contextualEntities = allEntities.slice(0, 8);
  const selected = world.selectedEntityId ? world.entities[world.selectedEntityId] : null;
  const analysisProvenance: Provenance = selected?.provenance[0] ?? { sourceId: "missing", sourceLabel: "Geen bron gekoppeld", retrievedAt: "", confidence: "unknown", limitations: ["Objecteigenschappen hebben geen herleidbare bron en zijn daarom niet beoordeeld."] };
  const suitability = selected ? assessKnownSuitability(selected.provenance.length ? knownSuitabilityInputs(selected) : {}, analysisProvenance) : null;
  const accessibility = selected ? buildProximityBaseline(selected, contextualEntities) : null;
  return {
    renderer: world.renderer,
    camera: { longitude: world.camera.center[0], latitude: world.camera.center[1], zoom: world.camera.zoom },
    selectedEntityId: world.selectedEntityId,
    activeTool: world.activeTool,
    taskPreset: world.taskPreset,
    comparisonEntityIds: world.comparisonEntityIds,
    entities: contextualEntities.map((entity, index) => ({
      id: entity.id, type: entity.type, name: entity.name, ...(entity.description ? { description: entity.description } : {}),
      relatedEntityIds: (entity.relatedEntityIds ?? []).slice(0, 20),
      properties: Object.fromEntries(AI_PROPERTY_ALLOWLIST.flatMap((key) => entity.properties[key] === undefined ? [] : [[key, entity.properties[key]]])),
      facets: index < 3 ? relevantFacetIds(entity).map((id) => { const facet = buildEntityFacet(entity, id); return { id, availability: facet.availability, values: Object.fromEntries(facet.values.map((value) => [value.key, value.value])), missing: facet.missing.map((value) => value.key) }; }) : [],
      sources: entity.provenance.slice(0, 2).map(sourceContext),
    })),
    entityCounts,
    layers: Object.entries(world.layers).map(([id, runtime]) => {
      const definition = layerDefinitions.get(id);
      const sources = definition?.sourceIds.map((sourceId) => sourceDefinitions.get(sourceId)).filter((source) => source !== undefined) ?? [];
      return {
        id, visible: runtime.visible, status: runtime.status, ...(runtime.error ? { error: runtime.error } : {}),
        ...(definition ? {
          label: definition.label,
          coverage: definition.coverage,
          supportedRenderers: definition.supportedRenderers,
          minZoom: definition.minZoom ?? null,
          maxZoom: definition.maxZoom ?? null,
          sources: sources.map(({ id: sourceId, label, authority, availability, access, freshness }) => ({ sourceId, label, authority, availability, access, freshness })),
        } : { metadataMissing: true as const }),
      };
    }),
    drawings: world.drawings.slice(0, 5).map((drawing) => {
      const measurement = measureDrawing(drawing);
      return { id: drawing.id, name: drawing.name, kind: drawing.kind, projectId: drawing.projectId, areaSquareMeters: Math.round(measurement.areaSquareMeters), lengthMeters: Math.round(measurement.lengthMeters), methodVersion: measurement.methodVersion, limitations: measurement.limitations };
    }),
    selectedAnalysis: selected && suitability ? {
      subjectId: selected.id,
      suitability: {
        conclusion: suitability.conclusion,
        assessedAt: suitability.assessedAt,
        methodVersion: suitability.methodVersion,
        dimensions: suitability.dimensions.map((dimension) => ({ dimension: dimension.dimension, status: dimension.status, score: dimension.score, confidence: dimension.confidence, metrics: dimension.metrics.map((item) => ({ key: item.key, value: item.value, unit: item.unit, status: item.status, source: sourceContext(item.provenance) })) })),
        blockers: suitability.blockers.map((blocker) => ({ code: blocker.code, label: blocker.label, severity: blocker.severity, explanation: blocker.explanation, source: sourceContext(blocker.provenance) })),
      },
      accessibility: accessibility ? { computedAt: accessibility.computedAt, methodVersion: accessibility.methodVersion, themes: accessibility.themes, measures: accessibility.measures.slice(0, 25).map((measure) => ({ destinationType: measure.destinationType, mode: measure.mode, minutes: measure.minutes, distanceMeters: measure.distanceMeters, status: measure.status, count5: measure.count5, count10: measure.count10, count15: measure.count15, source: sourceContext(measure.provenance) })) } : null,
    } : null,
    project: world.activeProject ? { id: world.activeProject.id, name: world.activeProject.name, siteId: world.activeProject.siteId ?? null, saved: world.activeProject.persistence === "saved" } : null,
    milestones: world.projectMilestones.slice(0, 12).map(({ id, projectId, label, status, plannedAt, completedAt }) => ({ id, projectId, label, status, plannedAt: plannedAt ?? null, completedAt: completedAt ?? null })),
    scenario: world.activeScenario ? {
      id: world.activeScenario.id, name: world.activeScenario.name,
      calculation: world.scenarioEstimate ? {
        methodVersion: world.scenarioEstimate.methodVersion, inputs: world.scenarioEstimate.inputs,
        grossFloorAreaM2: world.scenarioEstimate.grossFloorAreaM2, netFloorAreaM2: world.scenarioEstimate.netFloorAreaM2,
        homes: world.scenarioEstimate.homes, constructionCostEur: world.scenarioEstimate.constructionCostEur,
        durationMonths: world.scenarioEstimate.durationMonths, riskFlags: world.scenarioEstimate.riskFlags,
        assumptions: world.scenarioEstimate.assumptions,
      } : null,
      objects: world.scenarioObjects.slice(0, 10).map((object) => ({ id: object.id, kind: object.kind, label: object.label, parameters: object.parameters, sources: object.provenance.slice(0, 2).map(({ sourceId, sourceLabel, retrievedAt, confidence, methodVersion, limitations, assumptions }) => ({ sourceId, sourceLabel, retrievedAt, confidence, ...(methodVersion ? { methodVersion } : {}), limitations: Array.from(new Set([...(limitations ?? []), ...(assumptions ?? [])])).slice(0, 3) })) })),
    } : null,
  };
}
