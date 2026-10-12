import "server-only";

import { createClient } from "@/lib/supabase/server";
import { searchSpatialCatalog } from "./catalog-search";
import { inspectCatalogEntity } from "./catalog-evidence";
import type { CatalogEntityType } from "./world-tools";

export function searchAuthorizedSpatialCatalog(query: string, entityType?: CatalogEntityType, limit?: number) {
  // createClient carries the request cookies, so PostgREST evaluates the same
  // RLS policies as the signed-in interface. Never substitute a service client.
  return searchSpatialCatalog(query, createClient, entityType, limit);
}

export function inspectAuthorizedCatalogEntity(entityId: string) {
  return inspectCatalogEntity(entityId, createClient);
}
