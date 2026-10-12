import { z } from "zod";

export const provenanceSchema = z.object({
  sourceId: z.string().min(1).max(160), sourceLabel: z.string().min(1).max(240), sourceUrl: z.string().url().optional(),
  retrievedAt: z.string().datetime(), confidence: z.enum(["verified", "high", "medium", "low", "unknown"]),
  assumptions: z.array(z.string().max(1000)).max(20).optional(), limitations: z.array(z.string().max(1000)).max(20).optional(), methodVersion: z.string().max(160).optional(),
}).strict();

export const scenarioObjectSchema = z.object({
  id: z.string().min(1).max(240), kind: z.enum(["building-footprint", "massing", "landscape", "demolition", "infrastructure", "phase-boundary"]),
  label: z.string().min(1).max(240),
  geometry: z.object({ kind: z.enum(["point", "line", "polygon", "multipolygon", "external"]), center: z.tuple([z.number(), z.number(), z.number().optional()]).optional(), bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(), uri: z.string().max(1000).optional(), coordinateSystem: z.literal("WGS84") }).strict(),
  parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  provenance: z.array(provenanceSchema).min(1).max(10),
}).strict();

const rangeSchema = z.object({ low: z.number(), expected: z.number(), high: z.number() }).strict();
const inputsSchema = z.object({
  siteAreaM2: z.number(), coverageRatio: z.number(), floors: z.number(), grossToNetRatio: z.number(), averageHomeAreaM2: z.number(),
  constructionCostPerGfaM2: z.number(), preparationMonths: z.number(), constructionMonthsPer10kGfa: z.number(),
}).strict();

export const scenarioCalculationSchema = z.object({
  methodVersion: z.literal("indicative-scenario-1.0.0"), grossFloorAreaM2: z.number(), netFloorAreaM2: z.number(), homes: rangeSchema,
  constructionCostEur: rangeSchema, durationMonths: rangeSchema, riskFlags: z.array(z.string().max(1000)).max(50),
  assumptions: z.array(z.string().max(1000)).max(50), inputs: inputsSchema,
}).strict();

export const scenarioWriteSchema = z.object({
  name: z.string().trim().min(1).max(160), organizationId: z.string().uuid().optional(),
  assumptions: z.array(z.string().max(1000)).max(50).default([]), objects: z.array(scenarioObjectSchema).max(100).default([]),
  calculation: scenarioCalculationSchema.nullable().optional(),
}).strict();
