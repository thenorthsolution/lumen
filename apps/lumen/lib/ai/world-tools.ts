import { tool, type InferUITools, type UIMessage } from "ai";
import { z } from "zod";
import { ENTITY_TYPES, type EntityType } from "@lumen/world";

export const catalogEntityTypes = ENTITY_TYPES;
export type CatalogEntityType = EntityType;

const toolOutput = z.object({
  status: z.enum(["success", "rejected", "unavailable"]),
  message: z.string(),
});

export const findWorldLocationInputSchema = z.object({
  query: z.string().trim().min(2).max(120),
});

export const findWorldLocationOutputSchema = z.object({
  status: z.enum(["success", "not_found", "unavailable"]),
  message: z.string(),
  locations: z.array(z.object({
    externalId: z.string().min(1),
    name: z.string(),
    kind: z.string(),
    entityType: z.enum(["address", "municipality"]).optional(),
    longitude: z.number().min(-180).max(180),
    latitude: z.number().min(-90).max(90),
    recommendedZoom: z.number().min(1).max(22),
    provenance: z.object({
      sourceId: z.literal("pdok-location-api"),
      sourceLabel: z.literal("PDOK Location API"),
      sourceUrl: z.string().url(),
      retrievedAt: z.string().datetime(),
      confidence: z.literal("verified"),
      methodVersion: z.literal("pdok-location-search-1.0.0"),
    }),
  })).max(5),
});

export const searchWorldCatalogInputSchema = z.object({
  query: z.string().trim().min(2).max(120),
  entityType: z.enum(catalogEntityTypes).optional(),
  limit: z.number().int().min(1).max(10).optional(),
});

const catalogProvenanceSchema = z.object({
  sourceId: z.string().nullable(), sourceLabel: z.string(), authority: z.string().nullable(), sourceUrl: z.string().url().nullable(),
  snapshotVersion: z.string().nullable(), capturedAt: z.string().datetime().nullable(), methodVersion: z.string().nullable(),
  license: z.string().nullable(), confidence: z.enum(["verified", "unknown"]), limitations: z.array(z.string()).max(5),
});

export const searchWorldCatalogOutputSchema = z.object({
  status: z.enum(["success", "not_found", "unavailable"]),
  message: z.string(),
  entities: z.array(z.object({
    id: z.string(), entityType: z.enum(catalogEntityTypes), name: z.string(), description: z.string().nullable(),
    properties: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    provenance: catalogProvenanceSchema,
  })).max(10),
});

const evidenceMetricSchema = z.object({
  key: z.string(), value: z.union([z.string(), z.number(), z.boolean(), z.null()]), unit: z.string().nullable(),
  status: z.enum(["measured", "estimated", "missing"]),
});

export const inspectWorldCatalogEntityInputSchema = z.object({ entityId: z.string().trim().min(1).max(240) });
export const inspectWorldCatalogEntityOutputSchema = z.object({
  status: z.enum(["success", "not_found", "unavailable"]), message: z.string(),
  entity: z.object({
    id: z.string(), entityType: z.enum(catalogEntityTypes), name: z.string(), description: z.string().nullable(), primarySnapshotId: z.string().nullable(), provenance: catalogProvenanceSchema,
    sourceRecords: z.array(z.object({ id: z.string(), snapshotId: z.string(), externalId: z.string(), observedAt: z.string().datetime(), provenance: catalogProvenanceSchema })).max(20),
    relationships: z.array(z.object({
      direction: z.enum(["incoming", "outgoing"]), relationType: z.string(),
      entity: z.object({ id: z.string(), entityType: z.enum(catalogEntityTypes), name: z.string() }),
      methodVersion: z.string(), observedAt: z.string().datetime().nullable(), provenance: catalogProvenanceSchema,
    })).max(30),
    observations: z.array(z.object({
      id: z.string(), theme: z.string(), observedAt: z.string().datetime(), methodVersion: z.string(), snapshotId: z.string(),
      metrics: z.array(evidenceMetricSchema).max(30), limitations: z.array(z.string()).max(5), provenance: catalogProvenanceSchema,
    })).max(20),
    assessments: z.array(z.object({
      id: z.string(), conclusion: z.enum(["promising", "conditional", "blocked", "needs-research"]), assessedAt: z.string().datetime(), methodVersion: z.string(), snapshotIds: z.array(z.string()).max(20),
      dimensions: z.array(z.object({
        dimension: z.enum(["planning", "physical", "environment-safety", "accessibility", "market-program", "deliverability"]),
        status: z.enum(["suitable", "attention", "blocked", "needs-research"]), score: z.number().nullable(), confidence: z.enum(["verified", "high", "medium", "low", "unknown"]), metrics: z.array(evidenceMetricSchema).max(30),
      })).max(6),
      blockers: z.array(z.object({ code: z.string(), label: z.string(), explanation: z.string(), severity: z.enum(["hard", "conditional"]) })).max(30), provenance: z.array(catalogProvenanceSchema).max(20),
    })).max(5),
    limitations: z.array(z.string()).max(5),
  }).nullable(),
});

export const lumenWorldTools = {
  inspect_world_catalog_entity: tool({
    description: "Lees het toegankelijke, gestructureerde bewijs van één exact canoniek object: bronrecords, relaties, observaties en geschiktheidsanalyses. Gebruik alleen een ID uit de kaartcontext of search_world_catalog.",
    inputSchema: inspectWorldCatalogEntityInputSchema,
    outputSchema: inspectWorldCatalogEntityOutputSchema,
  }),
  search_world_catalog: tool({
    description: "Doorzoek de tenant-veilige canonieke Lumen-catalogus. Gebruik dit voor objecten, projecten en locaties die niet al in de huidige viewportcontext staan. De resultaten bevatten alleen begrensde displayvelden en herleidbare provenance.",
    inputSchema: searchWorldCatalogInputSchema,
    outputSchema: searchWorldCatalogOutputSchema,
  }),
  find_world_location: tool({
    description: "Zoek een Nederlands adres, woonplaats of gemeente via de officiële PDOK Location API. Gebruik dit voordat je naar een niet-aanwezige locatie navigeert; verzin nooit coördinaten.",
    inputSchema: findWorldLocationInputSchema,
    outputSchema: findWorldLocationOutputSchema,
  }),
  navigate_world: tool({
    description: "Navigeer de Lumen-wereld naar een WGS84-positie.",
    inputSchema: z.object({ longitude: z.number().min(-180).max(180), latitude: z.number().min(-90).max(90), zoom: z.number().min(1).max(22).optional(), label: z.string().optional() }),
    outputSchema: toolOutput,
  }),
  orbit_world_camera: tool({
    description: "Draai, kantel of zoom de 3D-camera begrensd rond het huidige kaartmiddelpunt. Positieve bearingDelta draait met de klok mee.",
    inputSchema: z.object({ bearingDelta: z.number().min(-180).max(180), pitchDelta: z.number().min(-45).max(45).optional(), zoomDelta: z.number().min(-3).max(3).optional() }),
    outputSchema: toolOutput,
  }),
  select_world_entity: tool({
    description: "Selecteer een entiteit die in de huidige wereldcontext aanwezig is.",
    inputSchema: z.object({ entityId: z.string().min(1) }),
    outputSchema: toolOutput,
  }),
  find_and_select_world_entity: tool({
    description: "Zoek deterministisch binnen de entiteiten die al in de viewport geladen zijn en selecteer de beste match. Dit haalt geen extra objectdata op.",
    inputSchema: z.object({
      entityType: z.enum(catalogEntityTypes).optional(),
      query: z.string().trim().min(1).max(120).optional(),
      minimumBuildYear: z.number().int().min(1000).max(2200).optional(),
      maximumBuildYear: z.number().int().min(1000).max(2200).optional(),
      minimumAreaM2: z.number().nonnegative().optional(),
      maximumAreaM2: z.number().nonnegative().optional(),
      candidateOnly: z.boolean().optional(),
    }),
    outputSchema: toolOutput,
  }),
  clear_world_selection: tool({
    description: "Wis de huidige wereldselectie.",
    inputSchema: z.object({}),
    outputSchema: toolOutput,
  }),
  set_world_layer: tool({
    description: "Toon of verberg een geregistreerde wereldlaag.",
    inputSchema: z.object({ layerId: z.string().min(1), visible: z.boolean() }),
    outputSchema: toolOutput,
  }),
  set_world_renderer: tool({
    description: "Schakel tussen de open 2D- en 3D-wereldweergave.",
    inputSchema: z.object({ renderer: z.enum(["map-2d", "world-3d"]) }),
    outputSchema: toolOutput,
  }),
  open_world_tool: tool({
    description: "Open het passende gereedschap in de vaste Lumen-sidebar zonder de kaartpositie te wijzigen.",
    inputSchema: z.object({ tool: z.enum(["explore", "search", "layers", "analyze", "draw", "compare", "projects"]) }),
    outputSchema: toolOutput,
  }),
  set_world_task_preset: tool({
    description: "Activeer Wonen & omgeving, Gebouwen benutten, Ruimte ontwikkelen of Realisatie volgen. Dit past alleen lagen en paneelcontext aan.",
    inputSchema: z.object({ preset: z.enum(["living", "vacancy", "development", "delivery"]) }),
    outputSchema: toolOutput,
  }),
  toggle_world_comparison: tool({
    description: "Voeg een bekende geladen entiteit toe aan of verwijder deze uit de vergelijking. Gebruik uitsluitend een entityId uit de gecontroleerde wereldcontext.",
    inputSchema: z.object({ entityId: z.string().min(1) }),
    outputSchema: toolOutput,
  }),
  clear_world_comparison: tool({
    description: "Wis de huidige vergelijking.",
    inputSchema: z.object({}),
    outputSchema: toolOutput,
  }),
  analyze_world_drawing: tool({
    description: "Open een bestaand getekend vlak of rechthoek als kandidaatlocatie in het analysepaneel.",
    inputSchema: z.object({ drawingId: z.string().min(1) }),
    outputSchema: toolOutput,
  }),
  rank_world_opportunities: tool({
    description: "Rangschik de geladen ruimtelijke kansen met de deterministische Lumen-methodiek.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(20).optional() }),
    outputSchema: toolOutput,
  }),
  create_world_project: tool({
    description: "Maak een lokaal sessieproject, eventueel voor een geladen locatie. Dit schrijft nog niets extern weg.",
    inputSchema: z.object({ name: z.string().min(1).max(120), siteId: z.string().min(1).optional() }),
    outputSchema: toolOutput,
  }),
  create_world_scenario: tool({
    description: "Maak een indicatief scenario binnen het actieve sessieproject.",
    inputSchema: z.object({ name: z.string().min(1).max(120) }),
    outputSchema: toolOutput,
  }),
  estimate_world_scenario: tool({
    description: "Bereken een indicatieve woningcapaciteit, bouwkosten en doorlooptijd met de deterministische Lumen-rekenkern.",
    inputSchema: z.object({
      siteAreaM2: z.number().positive(),
      coverageRatio: z.number().gt(0).lte(1),
      floors: z.number().positive().max(100),
      grossToNetRatio: z.number().gt(0).lte(1),
      averageHomeAreaM2: z.number().positive(),
      constructionCostPerGfaM2: z.number().positive(),
      preparationMonths: z.number().nonnegative(),
      constructionMonthsPer10kGfa: z.number().positive(),
    }),
    outputSchema: toolOutput,
  }),
  generate_world_scenario_geometry: tool({
    description: "Plaats het berekende indicatieve bouwvolume van het actieve scenario in de wereld.",
    inputSchema: z.object({}),
    outputSchema: toolOutput,
  }),
} as const;

export type LumenUITools = InferUITools<typeof lumenWorldTools>;
export type LumenAIMessage = UIMessage<unknown, never, LumenUITools>;
