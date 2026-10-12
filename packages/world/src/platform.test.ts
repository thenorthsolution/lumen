import { describe, expect, it } from "vitest";
import { assessWorldCommand, hasEntitlement, personalPlan, publicPlan, type EntitlementSnapshot } from "./platform";

describe("platform contracts", () => {
  it("keeps public browsing independent from cloud services", () => {
    expect(publicPlan.features).toEqual(["public-world"]);
    expect(publicPlan.allowances).toHaveLength(0);
  });

  it("gives personal accounts private projects and fair-use AI", () => {
    expect(personalPlan.projectLimit).toBe(10);
    expect(personalPlan.features).toContain("core-ai");
    expect(personalPlan.allowances.find((allowance) => allowance.kind === "ai-design")?.behavior).toBe("queue");
  });

  it("requires review for project changes and confirmation for durable writes", () => {
    expect(assessWorldCommand({ type: "set_renderer", renderer: "world-3d" }).execution).toBe("automatic");
    expect(assessWorldCommand({ type: "orbit_camera", bearingDelta: 20 }).execution).toBe("automatic");
    expect(assessWorldCommand({ type: "find_and_select_entity", entityType: "building" }).execution).toBe("automatic");
    expect(assessWorldCommand({ type: "create_scenario", name: "Variant A" }).execution).toBe("preview");
    expect(assessWorldCommand({ type: "save_workspace" }).execution).toBe("confirmation");
  });

  it("invalidates trial features after expiry", () => {
    const snapshot: EntitlementSnapshot = {
      subject: { type: "organization", id: "org-1" },
      plan: { id: "trial", tier: "organization-trial", label: "Proefperiode" },
      features: ["premium-ai"], projectLimit: null, seatLimit: 3, usage: [],
      trialEndsAt: "2020-01-01T00:00:00.000Z",
    };
    expect(hasEntitlement(snapshot, "premium-ai")).toBe(false);
  });
});
