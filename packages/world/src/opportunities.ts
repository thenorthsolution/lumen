import type { OpportunityEvidence, OpportunityTier } from "./index";

const confidenceFactor = { verified: 1, high: .9, medium: .72, low: .45, unknown: .25 } as const;

export interface OpportunityRanking {
  score: number;
  tier: OpportunityTier;
  evidenceCount: number;
  methodVersion: "opportunity-ranking-1.0.0";
}

export function rankOpportunity(evidence: readonly OpportunityEvidence[]): OpportunityRanking {
  const usable = evidence.filter((item) => Number.isFinite(item.score) && item.weight > 0);
  const totalWeight = usable.reduce((sum, item) => sum + item.weight * confidenceFactor[item.confidence], 0);
  const score = totalWeight === 0 ? 0 : Math.round(usable.reduce((sum, item) => sum + Math.max(0, Math.min(100, item.score)) * item.weight * confidenceFactor[item.confidence], 0) / totalWeight);
  const tier: OpportunityTier = score >= 70 ? "high" : score >= 45 ? "medium" : "low";
  return { score, tier, evidenceCount: usable.length, methodVersion: "opportunity-ranking-1.0.0" };
}
