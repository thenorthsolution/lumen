export interface ScenarioInputs {
  siteAreaM2: number;
  coverageRatio: number;
  floors: number;
  grossToNetRatio: number;
  averageHomeAreaM2: number;
  constructionCostPerGfaM2: number;
  preparationMonths: number;
  constructionMonthsPer10kGfa: number;
}

export interface EstimateRange {
  low: number;
  expected: number;
  high: number;
}

export interface ScenarioEstimate {
  methodVersion: "indicative-scenario-1.0.0";
  grossFloorAreaM2: number;
  netFloorAreaM2: number;
  homes: EstimateRange;
  constructionCostEur: EstimateRange;
  durationMonths: EstimateRange;
  riskFlags: readonly string[];
  assumptions: readonly string[];
  inputs: Readonly<ScenarioInputs>;
}

export type ScenarioCalculationResult = { status: "calculated"; estimate: ScenarioEstimate } | { status: "invalid"; issues: readonly string[] };

const range = (expected: number, spread: number): EstimateRange => ({ low: Math.round(expected * (1 - spread)), expected: Math.round(expected), high: Math.round(expected * (1 + spread)) });

export function calculateIndicativeScenario(input: ScenarioInputs): ScenarioCalculationResult {
  const issues: string[] = [];
  if (!Number.isFinite(input.siteAreaM2) || input.siteAreaM2 < 100 || input.siteAreaM2 > 2_000_000) issues.push("Terreinoppervlak moet tussen 100 en 2.000.000 m² liggen.");
  if (input.coverageRatio <= 0 || input.coverageRatio > .9) issues.push("Bebouwingspercentage moet tussen 0 en 0,9 liggen.");
  if (!Number.isInteger(input.floors) || input.floors < 1 || input.floors > 80) issues.push("Aantal bouwlagen moet een geheel getal tussen 1 en 80 zijn.");
  if (input.grossToNetRatio < .5 || input.grossToNetRatio > .95) issues.push("Bruto-nettoverhouding moet tussen 0,5 en 0,95 liggen.");
  if (input.averageHomeAreaM2 < 25 || input.averageHomeAreaM2 > 250) issues.push("Gemiddelde woninggrootte moet tussen 25 en 250 m² liggen.");
  if (input.constructionCostPerGfaM2 < 500 || input.constructionCostPerGfaM2 > 10_000) issues.push("Bouwkosten moeten tussen €500 en €10.000 per m² bvo liggen.");
  if (input.preparationMonths < 0 || input.constructionMonthsPer10kGfa <= 0) issues.push("Planninginvoer is ongeldig.");
  if (issues.length) return { status: "invalid", issues };

  const grossFloorAreaM2 = Math.round(input.siteAreaM2 * input.coverageRatio * input.floors);
  const netFloorAreaM2 = Math.round(grossFloorAreaM2 * input.grossToNetRatio);
  const expectedHomes = netFloorAreaM2 / input.averageHomeAreaM2;
  const expectedCost = grossFloorAreaM2 * input.constructionCostPerGfaM2;
  const expectedDuration = input.preparationMonths + grossFloorAreaM2 / 10_000 * input.constructionMonthsPer10kGfa;
  const riskFlags = [
    ...(input.coverageRatio > .65 ? ["Hoge terreinbedekking vraagt extra toetsing op buitenruimte en klimaatadaptatie."] : []),
    ...(input.floors >= 8 ? ["Hoogbouw vergroot constructieve, brandveiligheids- en procedurele complexiteit."] : []),
    ...(grossFloorAreaM2 >= 50_000 ? ["Projectomvang vraagt waarschijnlijk fasering en aanvullende marktopnameanalyse."] : []),
  ];
  return { status: "calculated", estimate: { methodVersion: "indicative-scenario-1.0.0", grossFloorAreaM2, netFloorAreaM2, homes: range(expectedHomes, .18), constructionCostEur: range(expectedCost, .2), durationMonths: range(expectedDuration, .2), riskFlags, assumptions: ["Capaciteit volgt uit geometrische kengetallen en is geen ontwerp.", "Kosten zijn exclusief grond, btw, financiering, adviseurs en locatiegebonden risico's.", "Planning bevat geen projectspecifieke vergunning- of bezwaarprocedure."], inputs: { ...input } } };
}
