import type { DrawingFeature, DrawingKind } from "@lumen/world";

type InputCoordinate = readonly [number, number, number?];
type Coordinate = [number, number];
const mutableCoordinates = (coordinates: readonly InputCoordinate[]) => coordinates.map(([longitude, latitude]) => [longitude, latitude] as Coordinate);

export function drawingFeatures(drawings: readonly DrawingFeature[], draft: readonly InputCoordinate[] = [], editing?: { id: string; coordinates: readonly InputCoordinate[] } | null, draftKind: DrawingKind = "line"): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  const entries = [
    ...drawings.map((drawing) => ({ drawing, coordinates: mutableCoordinates(editing?.id === drawing.id ? editing.coordinates : drawing.coordinates) })),
    ...(draft.length ? [{ drawing: { id: "draft", kind: draftKind, color: "#315df0" }, coordinates: mutableCoordinates(draft) }] : []),
  ];
  for (const { drawing, coordinates } of entries) {
    if (drawing.kind === "point") { if (coordinates[0]) features.push({ type: "Feature", properties: { id: drawing.id, color: drawing.color }, geometry: { type: "Point", coordinates: coordinates[0] } }); continue; }
    if (drawing.kind === "line") { if (coordinates.length > 1) features.push({ type: "Feature", properties: { id: drawing.id, color: drawing.color }, geometry: { type: "LineString", coordinates } }); continue; }
    if (drawing.kind === "rectangle" && coordinates.length > 1) {
      const [a, b] = coordinates;
      const ring = [[a![0], a![1]], [b![0], a![1]], [b![0], b![1]], [a![0], b![1]], [a![0], a![1]]];
      features.push({ type: "Feature", properties: { id: drawing.id, color: drawing.color }, geometry: { type: "Polygon", coordinates: [ring] } }); continue;
    }
    if (coordinates.length > 2) features.push({ type: "Feature", properties: { id: drawing.id, color: drawing.color }, geometry: { type: "Polygon", coordinates: [[...coordinates, coordinates[0]!] ] } });
  }
  return features;
}

export function drawingVertexFeatures(drawingId: string | null, coordinates: readonly InputCoordinate[] | null): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: drawingId && coordinates ? coordinates.map(([longitude, latitude], index) => ({ type: "Feature", properties: { drawingId, vertexIndex: index }, geometry: { type: "Point", coordinates: [longitude, latitude] } })) : [] };
}
