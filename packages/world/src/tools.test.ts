import { describe, expect, it, vi } from "vitest";
import { executeWorldTool, worldToolCommand, worldToolRegistry } from "./tools";

describe("world tools", () => {
  it("registers unavailable tools honestly", () => {
    expect(worldToolRegistry.find((tool) => tool.name === "start_world_voice")?.availability).toBe("unavailable");
  });

  it("validates coordinates before command execution", () => {
    expect(worldToolCommand({ id: "1", name: "navigate_world", arguments: { longitude: 200, latitude: 52 } })).toBe("Ongeldige WGS84-positie.");
  });

  it("bounds camera orbit deltas", () => {
    expect(worldToolCommand({ id: "orbit-1", name: "orbit_world_camera", arguments: { bearingDelta: 35, pitchDelta: -10 } })).toEqual({ type: "orbit_camera", bearingDelta: 35, pitchDelta: -10 });
    expect(worldToolCommand({ id: "orbit-2", name: "orbit_world_camera", arguments: { bearingDelta: 181 } })).toBe("Rotatie moet tussen -180 en 180 graden liggen.");
  });

  it("creates a deterministic loaded-entity search command", () => {
    expect(worldToolCommand({ id: "find-1", name: "find_and_select_world_entity", arguments: { entityType: "building", minimumBuildYear: 1990 } })).toEqual({ type: "find_and_select_entity", entityType: "building", minimumBuildYear: 1990 });
    expect(worldToolCommand({ id: "find-district", name: "find_and_select_world_entity", arguments: { entityType: "district", query: "Keizerslanden" } })).toEqual({ type: "find_and_select_entity", entityType: "district", query: "Keizerslanden" });
    expect(worldToolCommand({ id: "find-2", name: "find_and_select_world_entity", arguments: { entityType: "road" } })).toBe("Onbekend entiteitstype.");
  });

  it("executes a valid tool through the supplied command executor", () => {
    const execute = vi.fn().mockReturnValue({ status: "success", command: "set_renderer", message: "Renderer gewijzigd." });
    const result = executeWorldTool({ id: "2", name: "set_world_renderer", arguments: { renderer: "world-3d" } }, execute);
    expect(result.status).toBe("executed"); expect(execute).toHaveBeenCalledWith({ type: "set_renderer", renderer: "world-3d" });
  });

  it("validates opportunity ranking limits", () => {
    expect(worldToolCommand({ id: "3", name: "rank_world_opportunities", arguments: { limit: 5 } })).toEqual({ type: "rank_opportunities", limit: 5 });
    expect(worldToolCommand({ id: "4", name: "rank_world_opportunities", arguments: { limit: 50 } })).toBe("Limit moet tussen 1 en 20 liggen.");
  });

  it("creates a typed session-project command", () => {
    expect(worldToolCommand({ id: "5", name: "create_world_project", arguments: { name: "IJsselkade", siteId: "site-1" } })).toEqual({ type: "create_project", name: "IJsselkade", siteId: "site-1" });
  });

  it("creates a typed scenario command", () => {
    expect(worldToolCommand({ id: "6", name: "create_world_scenario", arguments: { name: "Compact" } })).toEqual({ type: "create_scenario", name: "Compact" });
  });

  it("requires complete numeric scenario inputs", () => {
    const valid = { siteAreaM2: 10000, coverageRatio: .4, floors: 5, grossToNetRatio: .78, averageHomeAreaM2: 75, constructionCostPerGfaM2: 2500, preparationMonths: 24, constructionMonthsPer10kGfa: 14 };
    expect(worldToolCommand({ id: "7", name: "estimate_world_scenario", arguments: valid })).toMatchObject({ type: "estimate_scenario", inputs: valid });
    expect(worldToolCommand({ id: "8", name: "estimate_world_scenario", arguments: { siteAreaM2: 10000 } })).toBe("Alle scenario-invoer moet numeriek zijn.");
  });

  it("creates renderer-neutral scenario geometry command", () => {
    expect(worldToolCommand({ id: "9", name: "generate_world_scenario_geometry", arguments: {} })).toEqual({ type: "generate_scenario_geometry" });
  });

  it("maps controlled workspace and comparison tools", () => {
    expect(worldToolCommand({ id: "10", name: "open_world_tool", arguments: { tool: "compare" } })).toEqual({ type: "set_active_tool", tool: "compare" });
    expect(worldToolCommand({ id: "11", name: "set_world_task_preset", arguments: { preset: "development" } })).toEqual({ type: "set_task_preset", preset: "development" });
    expect(worldToolCommand({ id: "12", name: "toggle_world_comparison", arguments: { entityId: "site-1" } })).toEqual({ type: "toggle_comparison_entity", entityId: "site-1" });
    expect(worldToolCommand({ id: "13", name: "analyze_world_drawing", arguments: { drawingId: "drawing-1" } })).toEqual({ type: "analyze_drawing", drawingId: "drawing-1" });
    expect(worldToolCommand({ id: "14", name: "open_world_tool", arguments: { tool: "admin" } })).toBe("Onbekend sidebar-gereedschap.");
  });
});
