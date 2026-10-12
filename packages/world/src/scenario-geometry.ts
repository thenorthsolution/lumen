import type { Bounds, Position, Provenance } from "./index";
import type { ScenarioObject } from "./projects";
import type { ScenarioEstimate } from "./scenario-engine";

export function generateIndicativeMassing(id: string, bounds: Bounds, estimate: ScenarioEstimate, createdAt: string): ScenarioObject {
  const inset = .12;
  const width = bounds[2] - bounds[0];
  const height = bounds[3] - bounds[1];
  const massingBounds: Bounds = [bounds[0] + width * inset, bounds[1] + height * inset, bounds[2] - width * inset, bounds[3] - height * inset];
  const center: Position = [(massingBounds[0] + massingBounds[2]) / 2, (massingBounds[1] + massingBounds[3]) / 2, estimate.inputs.floors * 3.2];
  const provenance: Provenance = { sourceId: "lumen-scenario-engine", sourceLabel: "Lumen scenario-engine", retrievedAt: createdAt, confidence: "low", assumptions: ["Rechthoekig volume binnen 12% inset van de bronbounds.", "Verdiepingshoogte indicatief vastgesteld op 3,2 meter."], methodVersion: "indicative-massing-1.0.0" };
  return { id, kind: "massing", label: "Indicatief bouwvolume", geometry: { kind: "polygon", bounds: massingBounds, center, coordinateSystem: "WGS84" }, parameters: { floors: estimate.inputs.floors, heightM: estimate.inputs.floors * 3.2, grossFloorAreaM2: estimate.grossFloorAreaM2, status: "indicative" }, provenance: [provenance] };
}
