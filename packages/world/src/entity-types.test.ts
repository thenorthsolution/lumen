import { describe, expect, it } from "vitest";
import { ENTITY_TYPES } from "./entity-types";

describe("canonical entity types", () => {
  it("can initialize independently from the package barrel", () => {
    expect(ENTITY_TYPES).toContain("building");
    expect(ENTITY_TYPES).toContain("realization");
    expect(new Set(ENTITY_TYPES).size).toBe(ENTITY_TYPES.length);
  });
});

describe("public world package initialization", () => {
  it("initializes the entity catalog and tool registry through the barrel", async () => {
    const world = await import("./index");

    expect(world.ENTITY_TYPES).toContain("building");
    expect(world.worldToolRegistry.find((tool) => tool.name === "find_and_select_world_entity"))
      .toBeDefined();
  });
});
