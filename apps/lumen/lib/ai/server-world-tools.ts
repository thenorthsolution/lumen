import { tool } from "ai";
import { findPdokLocations } from "./pdok-location";
import { inspectAuthorizedCatalogEntity, searchAuthorizedSpatialCatalog } from "./catalog-search-server";
import { findWorldLocationInputSchema, findWorldLocationOutputSchema, inspectWorldCatalogEntityInputSchema, inspectWorldCatalogEntityOutputSchema, lumenWorldTools, searchWorldCatalogInputSchema, searchWorldCatalogOutputSchema } from "./world-tools";

export const lumenServerWorldTools = {
  ...lumenWorldTools,
  inspect_world_catalog_entity: tool({
    description: lumenWorldTools.inspect_world_catalog_entity.description,
    inputSchema: inspectWorldCatalogEntityInputSchema,
    outputSchema: inspectWorldCatalogEntityOutputSchema,
    execute: async ({ entityId }) => inspectWorldCatalogEntityOutputSchema.parse(await inspectAuthorizedCatalogEntity(entityId)),
  }),
  search_world_catalog: tool({
    description: lumenWorldTools.search_world_catalog.description,
    inputSchema: searchWorldCatalogInputSchema,
    outputSchema: searchWorldCatalogOutputSchema,
    execute: async ({ query, entityType, limit }) => searchAuthorizedSpatialCatalog(query, entityType, limit),
  }),
  find_world_location: tool({
    description: lumenWorldTools.find_world_location.description,
    inputSchema: findWorldLocationInputSchema,
    outputSchema: findWorldLocationOutputSchema,
    execute: async ({ query }) => findPdokLocations(query),
  }),
} as const;
