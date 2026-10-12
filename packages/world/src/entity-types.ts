export type EntityType =
  | "region" | "municipality" | "district" | "neighborhood" | "address" | "building"
  | "parcel" | "site" | "infrastructure" | "planning-area"
  | "environmental-constraint" | "opportunity" | "organization-asset"
  | "project" | "scenario" | "scenario-object" | "permit" | "tender" | "realization";

/** Runtime counterpart of EntityType. Kept in a leaf module to avoid barrel cycles. */
export const ENTITY_TYPES = [
  "region", "municipality", "district", "neighborhood", "address", "building", "parcel", "site",
  "infrastructure", "planning-area", "environmental-constraint", "opportunity", "organization-asset",
  "project", "scenario", "scenario-object", "permit", "tender", "realization",
] as const satisfies readonly EntityType[];
