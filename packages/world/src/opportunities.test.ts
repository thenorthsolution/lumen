import { describe, expect, it } from "vitest";
import { rankOpportunity } from "./opportunities";
import type { OpportunityEvidence, Provenance } from "./index";

const provenance: Provenance = { sourceId: "test", sourceLabel: "Test", retrievedAt: "2026-09-10T00:00:00.000Z", confidence: "verified", methodVersion: "test-1" };
const evidence = (score: number, weight: number, confidence: OpportunityEvidence["confidence"]): OpportunityEvidence => ({ kind: "vacancy", label: "Signaal", score, weight, confidence, rationale: "Test", provenance: { ...provenance, confidence } });

describe("opportunity ranking", () => {
  it("produces a transparent confidence-weighted score", () => {
    expect(rankOpportunity([evidence(80, .7, "verified"), evidence(40, .3, "low")])).toMatchObject({ score: 74, tier: "high", evidenceCount: 2 });
  });

  it("returns a low zero score without evidence", () => {
    expect(rankOpportunity([])).toEqual({ score: 0, tier: "low", evidenceCount: 0, methodVersion: "opportunity-ranking-1.0.0" });
  });
});
