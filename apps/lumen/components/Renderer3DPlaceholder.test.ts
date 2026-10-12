import { describe, expect, it, vi } from "vitest";
import type { WorldEntity } from "@lumen/world";
import type * as CesiumTypes from "cesium";
import type { RenderGovernor } from "@/lib/cesium/render-governor";
import { CesiumRendererAdapter, cesiumCapabilities } from "./Renderer3DPlaceholder";

describe("Cesium renderer capabilities", () => {
  it("declares renderer-neutral capabilities", () => {
    expect(cesiumCapabilities).toEqual({ selection: true, annotations: true, terrain: false, threeDimensional: true });
  });

  it("restores a hovered building before saving its selection color", () => {
    const originalA = { name: "original-a" };
    const originalB = { name: "original-b" };
    const featureA = { color: originalA } as unknown as CesiumTypes.Cesium3DTileFeature;
    const featureB = { color: originalB } as unknown as CesiumTypes.Cesium3DTileFeature;
    const Cesium = {
      Color: {
        clone: (color: object) => ({ ...color }),
        fromCssColorString: (value: string) => ({ withAlpha: (alpha: number) => ({ value, alpha }) }),
      },
    };
    const viewer = {
      entities: { removeById: vi.fn() },
      isDestroyed: () => false,
      destroy: vi.fn(),
      resize: vi.fn(),
    };
    const tileset = { tileVisible: { addEventListener: () => vi.fn() } };
    const governor = { request: vi.fn() };
    const adapter = new CesiumRendererAdapter(
      viewer as unknown as CesiumTypes.Viewer,
      Cesium as unknown as typeof CesiumTypes,
      tileset as unknown as CesiumTypes.Cesium3DTileset,
      {} as CesiumTypes.BillboardCollection,
      governor as unknown as RenderGovernor,
      (camera) => camera,
    );
    const entityA = { id: "building-a" } as unknown as WorldEntity;
    const entityB = { id: "building-b" } as unknown as WorldEntity;

    adapter.hoverFeature(featureA);
    expect(featureA.color).toMatchObject({ alpha: .9 });
    adapter.selectFeature(featureA, entityA);
    expect(featureA.color).toMatchObject({ alpha: 1 });
    adapter.selectFeature(featureB, entityB);

    expect(featureA.color).toEqual(originalA);
    expect(featureB.color).toMatchObject({ alpha: 1 });
  });

  it("renders cadastral polygons and resolves their picked registration id", () => {
    const stored = new Map<string, { id: string; show?: boolean; polygon?: object }>();
    const viewer = {
      entities: {
        add: vi.fn((entity: { id: string; show?: boolean; polygon?: object }) => { stored.set(entity.id, entity); return entity; }),
        getById: (id: string) => stored.get(id),
        removeById: (id: string) => stored.delete(id),
      },
      isDestroyed: () => false, destroy: vi.fn(), resize: vi.fn(),
    };
    class PolygonHierarchy { constructor(public positions: unknown[], public holes: unknown[] = []) {} }
    const Cesium = {
      PolygonHierarchy,
      Cartesian3: { fromDegrees: (longitude: number, latitude: number) => ({ longitude, latitude }) },
      Color: { fromCssColorString: (value: string) => ({ withAlpha: (alpha: number) => ({ value, alpha }) }) },
      ClassificationType: { CESIUM_3D_TILE: 1 },
      ColorMaterialProperty: class { constructor(public color: unknown) {} },
      ConstantProperty: class { constructor(public value: unknown) {} },
    };
    const adapter = new CesiumRendererAdapter(
      viewer as unknown as CesiumTypes.Viewer,
      Cesium as unknown as typeof CesiumTypes,
      { tileVisible: { addEventListener: () => vi.fn() } } as unknown as CesiumTypes.Cesium3DTileset,
      {} as CesiumTypes.BillboardCollection,
      { request: vi.fn() } as unknown as RenderGovernor,
      (camera) => camera,
    );
    adapter.setParcels([{ type: "Feature", properties: { identificatie: "DVN00-A-123" }, geometry: { type: "Polygon", coordinates: [[[6.1, 52.2], [6.2, 52.2], [6.2, 52.3], [6.1, 52.2]]] } }]);

    expect(viewer.entities.add).toHaveBeenCalledTimes(1);
    expect(adapter.parcelIdForPick({ id: { id: "parcel:DVN00-A-123:0" } })).toBe("DVN00-A-123");
    expect(stored.get("parcel:DVN00-A-123:0")?.show).toBe(true);
  });
});
