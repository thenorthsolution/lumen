import { describe, expect, it, vi } from "vitest";
import { RenderGovernor } from "./render-governor";

describe("Cesium render governor", () => {
  it("uses identity-based holds and returns to idle rendering", () => {
    const scene = { requestRenderMode: false, maximumRenderTimeChange: 0, requestRender: vi.fn() };
    const governor = new RenderGovernor(scene);
    governor.hold("camera"); governor.hold("camera"); governor.hold("animation");
    expect(governor.diagnostics()).toMatchObject({ mode: "continuous", holds: ["animation", "camera"] });
    governor.release("camera"); expect(scene.requestRenderMode).toBe(false);
    governor.release("animation"); expect(scene.requestRenderMode).toBe(true);
  });

  it("records only bounded idle render requests", () => {
    const scene = { requestRenderMode: true, maximumRenderTimeChange: 0, requestRender: vi.fn() };
    const governor = new RenderGovernor(scene);
    for (let index = 0; index < 20; index += 1) governor.request(`update-${index}`);
    expect(governor.diagnostics().recentRequests).toHaveLength(16);
  });
});
