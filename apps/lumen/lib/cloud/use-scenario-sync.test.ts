import { describe, expect, it } from "vitest";
import { projectId, scenarioId } from "@lumen/world";
import { scenarioFingerprint } from "./use-scenario-sync";

describe("scenarioFingerprint", () => {
  it("changes for calculation inputs and generated objects", () => {
    const base = { scenario: { id: scenarioId("scenario-1"), projectId: projectId("project-1"), name: "Basis" }, calculation: null, objects: [] };
    const calculated = { ...base, calculation: { methodVersion: "indicative-scenario-1.0.0" as const, grossFloorAreaM2: 1000, netFloorAreaM2: 800, homes: { low: 8, expected: 10, high: 12 }, constructionCostEur: { low: 1, expected: 2, high: 3 }, durationMonths: { low: 12, expected: 15, high: 18 }, riskFlags: [], assumptions: ["Indicatief"], inputs: { siteAreaM2: 1000, coverageRatio: .5, floors: 2, grossToNetRatio: .8, averageHomeAreaM2: 80, constructionCostPerGfaM2: 2000, preparationMonths: 12, constructionMonthsPer10kGfa: 30 } } };
    expect(scenarioFingerprint(base)).not.toBe(scenarioFingerprint(calculated));
    expect(scenarioFingerprint(calculated)).not.toBe(scenarioFingerprint({ ...calculated, objects: [{ id: "massing-1", kind: "massing", label: "Volume", geometry: { kind: "polygon", coordinateSystem: "WGS84" }, parameters: {}, provenance: [{ sourceId: "lumen", sourceLabel: "Lumen", retrievedAt: "2026-09-11T12:00:00.000Z", confidence: "low" }] }] }));
  });
});
