import { z } from "zod";

export const milestoneWriteSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(240),
  status: z.enum(["planned", "active", "complete", "blocked"]),
  plannedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  organizationId: z.string().uuid().optional(),
}).strict();
