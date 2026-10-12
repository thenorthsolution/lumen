/**
 * Adapted from God's Eye View renderGovernor.js at commit
 * 759652207fd1279ece97f0f19af566feb9a82146. MIT License, Bilawal Sidhu.
 */
export interface GovernedScene {
  requestRenderMode: boolean;
  maximumRenderTimeChange: number;
  requestRender(): void;
}

export class RenderGovernor {
  private readonly holds = new Set<string>();
  private readonly recentRequests: Array<{ reason: string; at: number }> = [];

  constructor(private readonly scene: GovernedScene) {
    scene.maximumRenderTimeChange = Number.POSITIVE_INFINITY;
    this.applyMode();
  }

  hold(owner: string) {
    if (!owner) return;
    this.holds.add(owner);
    this.applyMode();
  }

  release(owner: string) {
    if (!owner) return;
    this.holds.delete(owner);
    this.applyMode();
  }

  request(reason = "unspecified") {
    if (this.holds.size === 0) {
      this.recentRequests.push({ reason, at: Date.now() });
      if (this.recentRequests.length > 16) this.recentRequests.shift();
    }
    this.scene.requestRender();
  }

  diagnostics() {
    return { mode: this.holds.size ? "continuous" as const : "idle" as const, holds: Array.from(this.holds).sort(), recentRequests: [...this.recentRequests] };
  }

  private applyMode() {
    const continuous = this.holds.size > 0;
    if (this.scene.requestRenderMode === !continuous) return;
    this.scene.requestRenderMode = !continuous;
    if (!continuous) this.scene.requestRender();
  }
}
