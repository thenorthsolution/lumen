export interface ViewportCacheEntry<T> { value: T; storedAt: number }

export class ViewportLoader<T> {
  private readonly cache = new Map<string, ViewportCacheEntry<T>>();
  private controller: AbortController | null = null;
  private generation = 0;
  private activeKey: string | null = null;
  private activeLoad: Promise<{ value: T; current: boolean }> | null = null;

  constructor(private readonly ttlMs = 300_000, private readonly maxEntries = 24) {}

  cached(key: string, now = Date.now()): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (now - entry.storedAt > this.ttlMs) { this.cache.delete(key); return null; }
    this.cache.delete(key); this.cache.set(key, entry);
    return entry.value;
  }

  async load(key: string, request: (signal: AbortSignal) => Promise<T>): Promise<{ value: T; current: boolean }> {
    const cached = this.cached(key);
    if (cached) return { value: cached, current: true };
    if (this.activeKey === key && this.activeLoad) return this.activeLoad;
    this.controller?.abort();
    const controller = new AbortController(); this.controller = controller;
    const generation = ++this.generation;
    this.activeKey = key;
    const activeLoad = request(controller.signal).then((value) => {
      const current = generation === this.generation && !controller.signal.aborted;
      if (current) {
        this.cache.set(key, { value, storedAt: Date.now() });
        while (this.cache.size > this.maxEntries) this.cache.delete(this.cache.keys().next().value!);
      }
      return { value, current };
    }).finally(() => {
      if (this.activeLoad === activeLoad) { this.activeLoad = null; this.activeKey = null; this.controller = null; }
    });
    this.activeLoad = activeLoad;
    return activeLoad;
  }

  cancel() { this.controller?.abort(); this.controller = null; this.activeKey = null; this.activeLoad = null; this.generation += 1; }
}

export function quantizedViewportKey(bounds: readonly number[], precision = 3) {
  return bounds.map((value) => value.toFixed(precision)).join(",");
}

export type NumericBounds = readonly [west: number, south: number, east: number, north: number];

/**
 * Align a viewport to a stable cache grid while always retaining full coverage.
 * West/south are rounded down and east/north up, so cache reuse can never omit
 * features along the visible edge.
 */
export function coverViewportBounds(bounds: NumericBounds, precision = 4): NumericBounds {
  const scale = 10 ** precision;
  return [
    Math.floor(bounds[0] * scale) / scale,
    Math.floor(bounds[1] * scale) / scale,
    Math.ceil(bounds[2] * scale) / scale,
    Math.ceil(bounds[3] * scale) / scale,
  ];
}

export function expandViewportBounds(bounds: NumericBounds, ratio: number): NumericBounds {
  const width = bounds[2] - bounds[0]; const height = bounds[3] - bounds[1];
  return [bounds[0] - width * ratio, bounds[1] - height * ratio, bounds[2] + width * ratio, bounds[3] + height * ratio];
}

/**
 * Overscan without turning an otherwise valid viewport into an oversized API
 * request. If the viewport already exceeds the service limit it is returned
 * unchanged, so the caller can surface the existing zoom requirement.
 */
export function expandViewportBoundsWithin(bounds: NumericBounds, ratio: number, maximumSpan: number): NumericBounds {
  const width = bounds[2] - bounds[0]; const height = bounds[3] - bounds[1];
  if (width <= 0 || height <= 0 || maximumSpan <= 0 || width > maximumSpan || height > maximumSpan) return bounds;
  const longitudeRatio = (maximumSpan / width - 1) / 2;
  const latitudeRatio = (maximumSpan / height - 1) / 2;
  return expandViewportBounds(bounds, Math.max(0, Math.min(ratio, longitudeRatio, latitudeRatio)));
}

export function viewportContains(container: NumericBounds | null, viewport: NumericBounds) {
  return Boolean(container && container[0] <= viewport[0] && container[1] <= viewport[1] && container[2] >= viewport[2] && container[3] >= viewport[3]);
}

/** Bound a large area around its center for APIs that reject city-wide extents. */
export function centeredViewportBounds(bounds: NumericBounds, maximumSpan: number): NumericBounds {
  const centerLongitude = (bounds[0] + bounds[2]) / 2;
  const centerLatitude = (bounds[1] + bounds[3]) / 2;
  const halfWidth = Math.min((bounds[2] - bounds[0]) / 2, maximumSpan / 2);
  const halfHeight = Math.min((bounds[3] - bounds[1]) / 2, maximumSpan / 2);
  return [centerLongitude - halfWidth, centerLatitude - halfHeight, centerLongitude + halfWidth, centerLatitude + halfHeight];
}
