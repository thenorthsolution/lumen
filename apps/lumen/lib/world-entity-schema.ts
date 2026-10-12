import { z } from "zod";
import { ENTITY_TYPES, type WorldEntity } from "@lumen/world";

const finite = z.number().finite();
const position = z.union([z.tuple([finite, finite]), z.tuple([finite, finite, finite])]);
const bounds = z.tuple([finite, finite, finite, finite]);
const scalar = z.union([z.string().max(2_000), finite, z.boolean(), z.null()]);

const provenanceSchema = z.object({
  sourceId: z.string().min(1).max(160),
  sourceLabel: z.string().min(1).max(240),
  sourceUrl: z.string().url().max(2_000).optional(),
  retrievedAt: z.string().datetime(),
  confidence: z.enum(["verified", "high", "medium", "low", "unknown"]),
  assumptions: z.array(z.string().max(1_000)).max(40).optional(),
  limitations: z.array(z.string().max(1_000)).max(40).optional(),
  methodVersion: z.string().max(160).optional(),
}).strict();

export const worldEntitySchema = z.object({
  id: z.string().min(1).max(240),
  type: z.enum(ENTITY_TYPES),
  name: z.string().min(1).max(240),
  description: z.string().max(4_000).optional(),
  geometry: z.object({
    kind: z.enum(["point", "line", "polygon", "multipolygon", "external"]),
    center: position.optional(), bounds: bounds.optional(), uri: z.string().url().max(2_000).optional(),
    coordinateSystem: z.literal("WGS84"),
  }).strict().optional(),
  provenance: z.array(provenanceSchema).max(40),
  properties: z.record(z.string().max(160), scalar).refine((value) => Object.keys(value).length <= 100, "Te veel objecteigenschappen."),
  relatedEntityIds: z.array(z.string().min(1).max(240)).max(200).optional(),
}).strict();

export function parseWorldEntity(value: unknown): WorldEntity | null {
  const parsed = worldEntitySchema.safeParse(value);
  return parsed.success ? parsed.data as unknown as WorldEntity : null;
}
