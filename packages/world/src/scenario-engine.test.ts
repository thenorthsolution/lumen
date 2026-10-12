import { describe, expect, it } from "vitest";
import { calculateIndicativeScenario, type ScenarioInputs } from "./scenario-engine";

const input: ScenarioInputs = { siteAreaM2: 10_000, coverageRatio: .4, floors: 5, grossToNetRatio: .78, averageHomeAreaM2: 75, constructionCostPerGfaM2: 2_500, preparationMonths: 24, constructionMonthsPer10kGfa: 14 };

describe("indicative scenario engine", () => {
  it("returns reproducible ranges and assumptions", () => {
    const result = calculateIndicativeScenario(input);
    expect(result.status).toBe("calculated");
    if (result.status === "calculated") expect(result.estimate).toMatchObject({ grossFloorAreaM2: 20_000, netFloorAreaM2: 15_600, homes: { expected: 208 }, constructionCostEur: { expected: 50_000_000 }, methodVersion: "indicative-scenario-1.0.0" });
  });

  it("rejects implausible inputs", () => {
    expect(calculateIndicativeScenario({ ...input, floors: 0 }).status).toBe("invalid");
  });
});
