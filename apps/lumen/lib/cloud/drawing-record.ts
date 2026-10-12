import { z } from "zod";

export const drawingPositionSchema = z.tuple([z.number().gte(-180).lte(180), z.number().gte(-90).lte(90)]);
export const drawingKindSchema = z.enum(["point", "line", "polygon", "rectangle"]);

export function drawingGeometry(kind: z.infer<typeof drawingKindSchema>, coordinates: [number, number][]) {
  if (kind === "point") return coordinates[0] ? { type: "Point", coordinates: coordinates[0] } : null;
  if (kind === "line") return coordinates.length >= 2 ? { type: "LineString", coordinates } : null;
  if (kind === "rectangle") {
    const [a, b] = coordinates;
    if (!a || !b) return null;
    return { type: "Polygon", coordinates: [[[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]], [a[0], a[1]]]] };
  }
  if (coordinates.length < 3) return null;
  return { type: "Polygon", coordinates: [[...coordinates, coordinates[0]!]] };
}
