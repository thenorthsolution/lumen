import { describe, expect, it } from "vitest";
import { calculateIndicativeScenario } from "./scenario-engine";
import { generateIndicativeMassing } from "./scenario-geometry";

describe("scenario geometry", () => {
  it("creates bounded WGS84 massing with provenance", () => {
    const result = calculateIndicativeScenario({ siteAreaM2: 10_000, coverageRatio: .4, floors: 5, grossToNetRatio: .78, averageHomeAreaM2: 75, constructionCostPerGfaM2: 2_500, preparationMonths: 24, constructionMonthsPer10kGfa: 14 });
    if (result.status !== "calculated") throw new Error("Expected estimate");
    const object = generateIndicativeMassing("mass-1", [6.15, 52.25, 6.16, 52.26], result.estimate, "2026-09-10T00:00:00.000Z");
    expect(object).toMatchObject({ kind: "massing", geometry: { bounds: [6.1512, 52.2512, 6.1588, 52.2588], coordinateSystem: "WGS84" }, parameters: { floors: 5, heightM: 16 }, provenance: [{ methodVersion: "indicative-massing-1.0.0" }] });
  });
});
