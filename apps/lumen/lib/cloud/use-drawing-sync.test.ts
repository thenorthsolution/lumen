import { describe, expect, it } from "vitest";
import type { DrawingFeature } from "@lumen/world";
import { initialDrawingBaseline, planDrawingSync } from "./use-drawing-sync";

const drawing = (id: string, version = 1): DrawingFeature => ({
  id,
  name: `Tekening ${id}`,
  kind: "rectangle",
  coordinates: [[6.1, 52.2], [6.2, 52.3]],
  color: "#315df0",
  version,
  createdAt: "2026-09-11T12:00:00.000Z",
  updatedAt: "2026-09-11T12:00:00.000Z",
});

describe("planDrawingSync", () => {
  it("plans creates, updates and deletes without touching unchanged drawings", () => {
    const unchanged = drawing("11111111-1111-4111-8111-111111111111");
    const changedBefore = drawing("22222222-2222-4222-8222-222222222222");
    const removed = drawing("33333333-3333-4333-8333-333333333333");
    const changedAfter = { ...changedBefore, name: "Aangepast", version: 2 };
    const added = drawing("44444444-4444-4444-8444-444444444444");

    expect(planDrawingSync([unchanged, changedBefore, removed], [unchanged, changedAfter, added])).toEqual([
      { kind: "update", drawing: changedAfter },
      { kind: "create", drawing: added },
      { kind: "delete", drawingId: removed.id },
    ]);
  });

  it("detects geometry-only changes", () => {
    const before = drawing("11111111-1111-4111-8111-111111111111");
    const after = { ...before, coordinates: [[6.11, 52.21], [6.22, 52.32]] as [number, number][] };
    expect(planDrawingSync([before], [after])).toEqual([{ kind: "update", drawing: after }]);
  });

  it("starts a newly persisted session project with an empty server baseline", () => {
    const drawings = [drawing("11111111-1111-4111-8111-111111111111")];
    expect(initialDrawingBaseline({ id: "session-site", persistence: "session" }, { id: "22222222-2222-4222-8222-222222222222", persistence: "saved" }, drawings)).toEqual([]);
    expect(initialDrawingBaseline(null, { id: "22222222-2222-4222-8222-222222222222", persistence: "saved" }, drawings)).toEqual(drawings);
  });
});
