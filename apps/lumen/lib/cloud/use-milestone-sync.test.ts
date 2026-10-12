import { describe, expect, it } from "vitest";
import { projectId, type ProjectMilestone } from "@lumen/world";
import { planMilestoneSync } from "./use-milestone-sync";

const item = (id: string, status: ProjectMilestone["status"] = "planned"): ProjectMilestone => ({ id, projectId: projectId("11111111-1111-4111-8111-111111111111"), label: id, status });

describe("planMilestoneSync", () => {
  it("plans create, update and delete mutations", () => {
    const unchanged = item("11111111-1111-4111-8111-111111111111"); const changed = item("22222222-2222-4222-8222-222222222222"); const removed = item("33333333-3333-4333-8333-333333333333"); const added = item("44444444-4444-4444-8444-444444444444");
    expect(planMilestoneSync([unchanged, changed, removed], [unchanged, { ...changed, status: "active" }, added])).toEqual([{ kind: "update", milestone: { ...changed, status: "active" } }, { kind: "create", milestone: added }, { kind: "delete", milestoneId: removed.id }]);
  });
});
