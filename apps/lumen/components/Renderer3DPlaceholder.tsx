"use client";

import { useEffect, useRef, useState } from "react";
import type * as CesiumTypes from "cesium";
import type { CameraState, LayerRuntimeState, RendererAdapter, WorldEntity } from "@lumen/world";
import { useWorldSelector, worldStore } from "@/lib/world-store";
import { OPEN_TILESET_OPTIONS } from "@/lib/cesium/map-startup";
import { clampCameraToNetherlands, NETHERLANDS_BOUNDS, NETHERLANDS_MAX_CAMERA_HEIGHT_M } from "@/lib/cesium/netherlands-policy";
import { RenderGovernor } from "@/lib/cesium/render-governor";
import { isPickedWorldPosition } from "@/lib/cesium/scene-pick";
import { ViewportLoader } from "@/lib/viewport-loader";
import { containingParcelEntity } from "@/lib/spatial-relations";

const CESIUM_VERSION = "1.133.0";
const CESIUM_ASSET_ROOT = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/`;
const PDOK_BUILDINGS_TILESET_URL = "https://api.pdok.nl/kadaster/3d-basisvoorziening/ogc/v1/collections/gebouwen/3dtiles?f=json";
const PDOK_TERRAIN_TILESET_URL = "https://api.pdok.nl/kadaster/3d-basisvoorziening/ogc/v1/collections/terreinen/3dtiles?f=json";
const TREE_SPRITE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="64" viewBox="0 0 48 64"><path fill="#8b8377" d="M21 43h6v21h-6z"/><ellipse cx="24" cy="29" rx="18" ry="22" fill="#788274"/><ellipse cx="17" cy="31" rx="11" ry="15" fill="#8d9688"/><ellipse cx="29" cy="24" rx="12" ry="17" fill="#697568"/></svg>')}`;

type CesiumModule = typeof CesiumTypes;
type Viewer = CesiumTypes.Viewer;
type Tileset = CesiumTypes.Cesium3DTileset;
type TreeResponse = { trees?: Array<{ id: string; position: [number, number] }> };
type BuildingResponse = { entities?: WorldEntity[]; features?: GeoJSON.Feature[]; error?: string };
type PoiResponse = { entities?: WorldEntity[]; features?: GeoJSON.Feature[]; error?: string };
type ParcelResponse = { entities?: WorldEntity[]; features?: GeoJSON.Feature[]; truncated?: boolean; error?: string };

export const cesiumCapabilities = { selection: true, annotations: true, terrain: false, threeDimensional: true } as const;

export class CesiumRendererAdapter implements RendererAdapter {
  readonly mode = "world-3d" as const;
  readonly capabilities = cesiumCapabilities;
  private selectedOverlayId: string | null = null;
  private selectedFeature: CesiumTypes.Cesium3DTileFeature | null = null;
  private selectedFeatureEntityId: string | null = null;
  private selectedFeatureColor: CesiumTypes.Color | null = null;
  private hoveredFeature: CesiumTypes.Cesium3DTileFeature | null = null;
  private hoveredFeatureColor: CesiumTypes.Color | null = null;
  private poiBuildingIds = new Set<string>();
  private poiStyleVersion = 0;
  private readonly parcelEntityIds = new Set<string>();
  private readonly parcelPickIds = new Map<string, string>();
  private selectedParcelId: string | null = null;
  private hoveredParcelId: string | null = null;
  private parcelsVisible = true;
  private readonly styledTileVersions = new WeakMap<object, number>();
  private readonly removeTileVisibleListener: () => void;
  private cameraFlightGeneration = 0;
  private cameraInitialized = false;
  private active = true;

  constructor(private readonly viewer: Viewer, private readonly Cesium: CesiumModule, private readonly tileset: Tileset, private readonly trees: CesiumTypes.BillboardCollection, private readonly governor: RenderGovernor, private readonly constrainCamera: (camera: CameraState) => CameraState) {
    this.removeTileVisibleListener = tileset.tileVisible.addEventListener((tile) => this.stylePoiFeatures(tile.content));
  }
  mount() {}
  unmount() { this.removeTileVisibleListener(); if (!this.viewer.isDestroyed()) this.viewer.destroy(); }
  resize() { this.viewer.resize(); }
  applyCamera(camera: CameraState) {
    camera = this.constrainCamera(camera);
    if (this.cameraInitialized) {
      const current = this.readCamera();
      const bearingDelta = Math.abs((((current.bearing - camera.bearing) % 360) + 540) % 360 - 180);
      if (
        Math.abs(current.center[0] - camera.center[0]) < 0.00002
        && Math.abs(current.center[1] - camera.center[1]) < 0.00002
        && Math.abs(current.zoom - camera.zoom) < 0.02
        && bearingDelta < 0.2
        && Math.abs(current.pitch - camera.pitch) < 0.2
      ) return;
    }
    const range = 40_000_000 / 2 ** camera.zoom;
    const target = this.Cesium.Cartesian3.fromDegrees(camera.center[0], camera.center[1]);
    const offset = new this.Cesium.HeadingPitchRange(
      this.Cesium.Math.toRadians(camera.bearing),
      this.Cesium.Math.toRadians(-(90 - camera.pitch)),
      range,
    );
    if (!this.cameraInitialized) {
      this.viewer.camera.lookAt(target, offset);
      this.viewer.camera.lookAtTransform(this.Cesium.Matrix4.IDENTITY);
      this.cameraInitialized = true;
      this.viewer.scene.requestRender();
      return;
    }
    const generation = ++this.cameraFlightGeneration;
    this.governor.hold("camera-flight");
    const settle = () => {
      if (generation !== this.cameraFlightGeneration) return;
      this.governor.release("camera-flight");
      this.governor.request("camera-settled");
    };
    this.viewer.camera.flyToBoundingSphere(new this.Cesium.BoundingSphere(target, 0), { offset, duration: .45, complete: settle, cancel: settle });
  }
  readCamera(): CameraState {
    const canvas = this.viewer.scene.canvas;
    const target = this.viewer.camera.pickEllipsoid(
      new this.Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2),
      this.viewer.scene.globe.ellipsoid,
    );
    const center = target ? this.Cesium.Cartographic.fromCartesian(target) : this.viewer.camera.positionCartographic;
    const range = target
      ? this.Cesium.Cartesian3.distance(this.viewer.camera.positionWC, target)
      : this.viewer.camera.positionCartographic.height;
    const zoom = Math.max(1, Math.min(20, Math.log2(40_000_000 / Math.max(range, 1))));
    return { center: [this.Cesium.Math.toDegrees(center.longitude), this.Cesium.Math.toDegrees(center.latitude)], zoom, bearing: this.Cesium.Math.toDegrees(this.viewer.camera.heading), pitch: 90 + this.Cesium.Math.toDegrees(this.viewer.camera.pitch) };
  }
  applySelection(entity: WorldEntity | null) {
    if (entity && this.selectedFeatureEntityId === entity.id) return;
    this.clearFeatureSelection();
    if (this.selectedOverlayId) this.viewer.entities.removeById(this.selectedOverlayId);
    this.selectedOverlayId = null;
    this.setSelectedParcel(entity?.type === "parcel" ? String(entity.properties.identificatie ?? "") : null);
    if (entity?.type === "parcel") { this.governor.request("parcel-selection"); return; }
    const bounds = entity?.geometry?.bounds;
    if (!entity || !bounds) return;
    const id = `selection-${entity.id}`;
    const rectangle = this.Cesium.Rectangle.fromDegrees(bounds[0], bounds[1], bounds[2], bounds[3]);
    this.viewer.entities.add({ id, rectangle: { coordinates: rectangle, height: 1, material: this.Cesium.Color.fromCssColorString("#2f5bff").withAlpha(.12), outline: false } });
    this.selectedOverlayId = id;
    this.governor.request("selection");
  }
  setParcels(features: readonly GeoJSON.Feature[]) {
    this.clearParcels();
    for (const feature of features) {
      const rawId = String(feature.properties?.identificatie ?? feature.id ?? "");
      if (!rawId || (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon")) continue;
      const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      polygons.forEach((polygon, polygonIndex) => {
        const outer = polygon[0];
        if (!outer || outer.length < 3) return;
        const hierarchy = new this.Cesium.PolygonHierarchy(
          outer.map(([longitude, latitude]) => this.Cesium.Cartesian3.fromDegrees(longitude!, latitude!)),
          polygon.slice(1).map((hole) => new this.Cesium.PolygonHierarchy(hole.map(([longitude, latitude]) => this.Cesium.Cartesian3.fromDegrees(longitude!, latitude!)))),
        );
        const id = `parcel:${rawId}:${polygonIndex}`;
        this.viewer.entities.add({ id, show: this.active && this.parcelsVisible, polygon: { hierarchy, material: this.Cesium.Color.fromCssColorString("#7b7c77").withAlpha(.045), outline: true, outlineColor: this.Cesium.Color.fromCssColorString("#696a66").withAlpha(.72), classificationType: this.Cesium.ClassificationType.CESIUM_3D_TILE } });
        this.parcelEntityIds.add(id); this.parcelPickIds.set(id, rawId);
      });
    }
    this.governor.request("parcels");
  }
  parcelIdForPick(picked: unknown) {
    if (typeof picked !== "object" || picked === null || !("id" in picked)) return null;
    const pickedId = (picked as { id?: { id?: unknown } | string }).id;
    const id = typeof pickedId === "string" ? pickedId : typeof pickedId?.id === "string" ? pickedId.id : null;
    return id ? this.parcelPickIds.get(id) ?? null : null;
  }
  hoverParcel(id: string | null) {
    if (id === this.hoveredParcelId) return;
    const previous = this.hoveredParcelId; this.hoveredParcelId = id;
    if (previous && previous !== this.selectedParcelId) this.styleParcel(previous, false, false);
    if (id && id !== this.selectedParcelId) this.styleParcel(id, false, true);
    this.governor.request("parcel-hover");
  }
  private setSelectedParcel(id: string | null) {
    if (id === this.selectedParcelId) return;
    const previous = this.selectedParcelId; this.selectedParcelId = id;
    if (previous) this.styleParcel(previous, false, previous === this.hoveredParcelId);
    if (id) this.styleParcel(id, true, false);
  }
  private styleParcel(rawId: string, selected: boolean, hovered: boolean) {
    this.parcelPickIds.forEach((candidateId, entityId) => {
      if (candidateId !== rawId) return;
      const polygon = this.viewer.entities.getById(entityId)?.polygon;
      if (!polygon) return;
      polygon.material = new this.Cesium.ColorMaterialProperty(this.Cesium.Color.fromCssColorString(selected ? "#1142eb" : hovered ? "#315de9" : "#7b7c77").withAlpha(selected ? .18 : hovered ? .11 : .045));
      polygon.outlineColor = new this.Cesium.ConstantProperty(this.Cesium.Color.fromCssColorString(selected || hovered ? "#315de9" : "#696a66").withAlpha(selected || hovered ? .95 : .72));
    });
  }
  private clearParcels() {
    this.parcelEntityIds.forEach((id) => this.viewer.entities.removeById(id));
    this.parcelEntityIds.clear(); this.parcelPickIds.clear(); this.hoveredParcelId = null; this.selectedParcelId = null;
  }
  isBuildingFeature(feature: CesiumTypes.Cesium3DTileFeature) {
    return feature.tileset === this.tileset;
  }
  selectFeature(feature: CesiumTypes.Cesium3DTileFeature, entity: WorldEntity) {
    this.clearFeatureSelection();
    // A clicked feature is commonly still carrying its temporary hover color.
    // Restore that first so deselection later returns to the real tile style.
    this.clearFeatureHover();
    if (this.selectedOverlayId) this.viewer.entities.removeById(this.selectedOverlayId);
    this.selectedOverlayId = null;
    this.selectedFeature = feature;
    this.selectedFeatureEntityId = entity.id;
    this.selectedFeatureColor = this.Cesium.Color.clone(feature.color);
    feature.color = this.Cesium.Color.fromCssColorString("#1142eb").withAlpha(1);
    this.governor.request("building-selection");
  }
  hoverFeature(feature: CesiumTypes.Cesium3DTileFeature | null) {
    if (feature === this.hoveredFeature) return;
    this.clearFeatureHover();
    if (!feature || feature === this.selectedFeature) return;
    this.hoveredFeature = feature;
    this.hoveredFeatureColor = this.Cesium.Color.clone(feature.color);
    feature.color = this.Cesium.Color.fromCssColorString("#315de9").withAlpha(.9);
    this.governor.request("building-hover");
  }
  setPoiBuildingIds(ids: Iterable<string>) {
    this.poiBuildingIds = new Set(ids);
    this.poiStyleVersion += 1;
    this.governor.request("poi-buildings");
  }
  private stylePoiFeatures(content: CesiumTypes.Cesium3DTileContent) {
    const contentKey = content as unknown as object;
    if (this.styledTileVersions.get(contentKey) === this.poiStyleVersion) return;
    this.styledTileVersions.set(contentKey, this.poiStyleVersion);
    for (let index = 0; index < content.featuresLength; index += 1) {
      const feature = content.getFeature(index);
      const matchesPoi = feature.getPropertyIds().some((property) => this.poiBuildingIds.has(String(feature.getProperty(property))));
      if (matchesPoi && feature !== this.selectedFeature && feature !== this.hoveredFeature) {
        feature.color = this.Cesium.Color.fromCssColorString("#f3e8ad").withAlpha(.82);
      }
    }
  }
  private clearFeatureHover() {
    if (this.hoveredFeature && this.hoveredFeatureColor && this.hoveredFeature !== this.selectedFeature) this.hoveredFeature.color = this.hoveredFeatureColor;
    this.hoveredFeature = null;
    this.hoveredFeatureColor = null;
  }
  private clearFeatureSelection() {
    if (this.selectedFeature && this.selectedFeatureColor) {
      this.selectedFeature.color = this.selectedFeatureColor;
    }
    this.selectedFeature = null;
    this.selectedFeatureEntityId = null;
    this.selectedFeatureColor = null;
  }
  applyLayers(layers: Readonly<Record<string, LayerRuntimeState>>) {
    this.tileset.show = this.active && (layers.buildings?.visible ?? true);
    this.trees.show = this.active && (layers.vegetation?.visible ?? true);
    this.parcelsVisible = layers.parcels?.visible ?? true;
    this.parcelEntityIds.forEach((id) => { const entity = this.viewer.entities.getById(id); if (entity) entity.show = this.active && this.parcelsVisible; });
    this.governor.request("layers");
  }
  setActive(active: boolean) {
    this.active = active;
    this.tileset.show = active && (worldStore.getState().layers.buildings?.visible ?? true);
    this.trees.show = active && (worldStore.getState().layers.vegetation?.visible ?? true);
    this.parcelEntityIds.forEach((id) => { const entity = this.viewer.entities.getById(id); if (entity) entity.show = active && this.parcelsVisible; });
    if (active) this.resize();
    this.governor.request(active ? "renderer-resumed" : "renderer-paused");
  }
  applyAnnotations(annotations: ReturnType<typeof worldStore.getState>["annotations"]) {
    for (const annotation of annotations) {
      const center = annotation.geometry.center;
      if (!center || this.viewer.entities.getById(`annotation-${annotation.id}`)) continue;
      this.viewer.entities.add({ id: `annotation-${annotation.id}`, position: this.Cesium.Cartesian3.fromDegrees(center[0], center[1], center[2] ?? 15), point: { pixelSize: 8, color: this.Cesium.Color.fromCssColorString("#1142eb"), outlineColor: this.Cesium.Color.WHITE, outlineWidth: 1 }, label: { text: annotation.label, font: "12px sans-serif", fillColor: this.Cesium.Color.WHITE, pixelOffset: new this.Cesium.Cartesian2(0, -18) } });
    }
    this.governor.request("annotations");
  }
  applyScenarioObjects(objects: ReturnType<typeof worldStore.getState>["scenarioObjects"]) {
    for (const previous of this.viewer.entities.values.filter((entity) => String(entity.id).startsWith("scenario-"))) this.viewer.entities.remove(previous);
    for (const object of objects) {
      const bounds = object.geometry.bounds;
      if (!bounds) continue;
      this.viewer.entities.add({ id: `scenario-${object.id}`, rectangle: { coordinates: this.Cesium.Rectangle.fromDegrees(bounds[0], bounds[1], bounds[2], bounds[3]), height: 0, extrudedHeight: Number(object.parameters.heightM ?? 0), material: this.Cesium.Color.fromCssColorString("#1142eb").withAlpha(.58), outline: true, outlineColor: this.Cesium.Color.WHITE } });
    }
    this.governor.request("scenario-objects");
  }
}

function isTileFeature(value: unknown): value is CesiumTypes.Cesium3DTileFeature {
  return typeof value === "object" && value !== null && "color" in value && "getPropertyIds" in value;
}

function buildingAt(longitude: number, latitude: number) {
  return Object.values(worldStore.getState().entities).find((candidate) => {
    const bounds = candidate.geometry?.bounds;
    return candidate.type === "building" && bounds && longitude >= bounds[0] && longitude <= bounds[2] && latitude >= bounds[1] && latitude <= bounds[3];
  });
}

function parcelByRegistrationId(registrationId: string) {
  return Object.values(worldStore.getState().entities).find((candidate) => candidate.type === "parcel" && String(candidate.properties.identificatie ?? "") === registrationId);
}

function ringContainsPoint(ring: GeoJSON.Position[], [longitude, latitude]: GeoJSON.Position) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index]!;
    const [previousX, previousY] = ring[previous]!;
    if ((y > latitude) !== (previousY > latitude) && longitude < ((previousX - x) * (latitude - y)) / (previousY - y) + x) inside = !inside;
  }
  return inside;
}

function geometryContainsPoint(geometry: GeoJSON.Geometry, point: GeoJSON.Position) {
  const polygonContainsPoint = (polygon: GeoJSON.Position[][]) => Boolean(polygon[0] && ringContainsPoint(polygon[0], point))
    && !polygon.slice(1).some((ring) => ringContainsPoint(ring, point));
  if (geometry.type === "Polygon") return polygonContainsPoint(geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some(polygonContainsPoint);
  return false;
}

function installWorldPicking(viewer: Viewer, Cesium: CesiumModule, adapter: CesiumRendererAdapter, onSelected?: (entity: WorldEntity, position: readonly [number, number]) => void) {
  let selectionGeneration = 0;
  viewer.screenSpaceEventHandler.setInputAction((movement: { endPosition: CesiumTypes.Cartesian2 }) => {
    const picked = viewer.scene.pick(movement.endPosition);
    const building = isTileFeature(picked) && adapter.isBuildingFeature(picked) ? picked : null;
    adapter.hoverFeature(building);
    const parcelId = building ? null : adapter.parcelIdForPick(picked);
    adapter.hoverParcel(parcelId);
    viewer.scene.canvas.style.cursor = building || parcelId ? "pointer" : "";
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  viewer.screenSpaceEventHandler.setInputAction(async (movement: { position: CesiumTypes.Cartesian2 }) => {
    const generation = ++selectionGeneration;
    const picked = viewer.scene.pick(movement.position);
    const pickedParcelId = adapter.parcelIdForPick(picked);
    const ray = viewer.camera.getPickRay(movement.position);
    const position = viewer.scene.pickPositionSupported ? viewer.scene.pickPosition(movement.position) : ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined;
    if (!isPickedWorldPosition(position)) {
      worldStore.execute({ type: "deselect_entity" });
      return;
    }
    const cartographic = Cesium.Cartographic.fromCartesian(position);
    const longitude = Cesium.Math.toDegrees(cartographic.longitude);
    const latitude = Cesium.Math.toDegrees(cartographic.latitude);
    let entity = buildingAt(longitude, latitude);
    if (!entity && pickedParcelId) entity = parcelByRegistrationId(pickedParcelId);
    if (!entity && isTileFeature(picked) && adapter.isBuildingFeature(picked)) {
      const delta = .00012;
      const bbox = [longitude - delta, latitude - delta, longitude + delta, latitude + delta].map((value) => value.toFixed(7)).join(",");
      try {
        const response = await fetch(`/api/world/buildings?bbox=${bbox}`, { signal: AbortSignal.timeout(4_000) });
        const data = await response.json() as BuildingResponse;
        if (generation !== selectionGeneration) return;
        if (response.ok && data.entities?.length) {
          const existing = Object.values(worldStore.getState().entities).filter((candidate) => candidate.type === "building");
          worldStore.replaceEntitiesOfType("building", [...existing, ...data.entities]);
          entity = buildingAt(longitude, latitude);
        }
      } catch {
        // A failed detail lookup leaves selection unchanged and the renderer usable.
      }
    }
    if (generation !== selectionGeneration) return;
    if (!entity) {
      worldStore.execute({ type: "deselect_entity" });
      return;
    }
    if (worldStore.getState().selectedEntityId === entity.id) {
      worldStore.execute({ type: "deselect_entity" });
      return;
    }
    onSelected?.(entity, [longitude, latitude]);
    if (isTileFeature(picked) && adapter.isBuildingFeature(picked)) adapter.selectFeature(picked, entity);
    worldStore.execute({ type: "select_entity", entityId: entity.id });
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

function configureCameraControls(viewer: Viewer, Cesium: CesiumModule, maximumZoomDistance: number) {
  const controller = viewer.scene.screenSpaceCameraController;
  controller.enableInputs = true;
  controller.enableRotate = true;
  controller.enableTranslate = true;
  controller.enableZoom = true;
  controller.enableTilt = true;
  controller.enableLook = true;
  controller.rotateEventTypes = Cesium.CameraEventType.LEFT_DRAG;
  controller.translateEventTypes = Cesium.CameraEventType.LEFT_DRAG;
  controller.zoomEventTypes = [Cesium.CameraEventType.RIGHT_DRAG, Cesium.CameraEventType.WHEEL, Cesium.CameraEventType.PINCH];
  controller.tiltEventTypes = [Cesium.CameraEventType.MIDDLE_DRAG, Cesium.CameraEventType.PINCH];
  controller.lookEventTypes = [{ eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.SHIFT }];
  controller.inertiaSpin = .18;
  controller.inertiaTranslate = .18;
  controller.inertiaZoom = .12;
  controller.zoomFactor = 3;
  controller.maximumMovementRatio = .08;
  controller.maximumZoomDistance = maximumZoomDistance;
  controller.minimumZoomDistance = 35;
  viewer.camera.percentageChanged = 0.01;
}

type TrackpadGestureEvent = Event & { clientX?: number; clientY?: number; rotation: number; scale: number };

function installTrackpadGestures(viewer: Viewer, Cesium: CesiumModule, governor: RenderGovernor, maximumZoomDistance: number) {
  const canvas = viewer.scene.canvas;
  const gestureSurface = canvas.parentElement ?? canvas;
  let orbitTarget: CesiumTypes.Cartesian3 | null = null;
  let previousGestureRotation = 0;
  let previousGestureScale = 1;
  let wheelOrbitTarget: CesiumTypes.Cartesian3 | null = null;
  let wheelMode: "pinch" | "orbit" | null = null;
  let wheelOrbitPitch = 0;
  let lastWheelEventAt = 0;
  let wheelEndTimer: number | null = null;
  const belongsToViewer = (event: Event) => event.target instanceof Node && gestureSurface.contains(event.target);
  const pickGestureTarget = (position: CesiumTypes.Cartesian2) => {
    // Prefer the rendered surface (for example a building roof) over the
    // ellipsoid below it. Orbiting a ground point beneath a tall feature makes
    // that feature visibly drift away from the cursor.
    if (viewer.scene.pickPositionSupported) {
      const surface = viewer.scene.pickPosition(position);
      if (Cesium.defined(surface)) return surface;
    }
    const ray = viewer.camera.getPickRay(position);
    return (ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined)
      ?? viewer.camera.pickEllipsoid(position, viewer.scene.globe.ellipsoid)
      ?? null;
  };
  const start = (event: Event) => {
    if (!belongsToViewer(event)) return;
    const gesture = event as TrackpadGestureEvent;
    const rect = canvas.getBoundingClientRect();
    const hasPointer = Number.isFinite(gesture.clientX) && Number.isFinite(gesture.clientY);
    const pointer = hasPointer
      ? new Cesium.Cartesian2(gesture.clientX! - rect.left, gesture.clientY! - rect.top)
      : new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
    orbitTarget = pickGestureTarget(pointer);
    if (!orbitTarget) return;
    previousGestureRotation = gesture.rotation || 0;
    previousGestureScale = gesture.scale || 1;
    // Changing the reference frame without supplying an offset preserves the
    // exact camera pose. Subsequent rotations therefore orbit the cursor point
    // without snapping the camera to face it first.
    viewer.camera.lookAtTransform(Cesium.Transforms.eastNorthUpToFixedFrame(orbitTarget));
    governor.hold("trackpad-gesture");
    event.preventDefault();
  };
  const change = (event: Event) => {
    if (!belongsToViewer(event) || !orbitTarget) return;
    const gesture = event as TrackpadGestureEvent;
    const rotationDelta = Cesium.Math.clamp(gesture.rotation - previousGestureRotation, -2, 2);
    if (Math.abs(rotationDelta) > .01) viewer.camera.rotateRight(Cesium.Math.toRadians(rotationDelta));
    const scaleRatio = previousGestureScale / Math.max(gesture.scale, .05);
    const currentRange = Cesium.Cartesian3.magnitude(viewer.camera.position);
    const nextRange = Cesium.Math.clamp(currentRange * scaleRatio, 35, maximumZoomDistance);
    Cesium.Cartesian3.multiplyByScalar(viewer.camera.position, nextRange / currentRange, viewer.camera.position);
    previousGestureRotation = gesture.rotation;
    previousGestureScale = gesture.scale;
    governor.request("trackpad-gesture");
    event.preventDefault();
  };
  const end = (event: Event) => {
    if (!orbitTarget) return;
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    orbitTarget = null;
    governor.release("trackpad-gesture");
    governor.request("trackpad-settled");
    event.preventDefault();
  };
  const finishWheelGesture = () => {
    if (!wheelOrbitTarget) return;
    if (wheelEndTimer !== null) window.clearTimeout(wheelEndTimer);
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    wheelOrbitTarget = null;
    wheelMode = null;
    wheelEndTimer = null;
    governor.release("trackpad-wheel");
    governor.request("trackpad-wheel-settled");
  };
  const pointerdown = (event: PointerEvent) => {
    // macOS three-finger drag is exposed as a primary pointer drag, not as
    // three individual contacts. End any active wheel orbit before Cesium
    // handles that drag as translation so the two camera modes cannot mix.
    if ((event.buttons & 1) !== 0) finishWheelGesture();
  };
  const wheel = (event: WheelEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const now = performance.now();
    const nextMode = event.ctrlKey ? "pinch" : "orbit";
    if (wheelOrbitTarget && (wheelMode !== nextMode || now - lastWheelEventAt > 240)) finishWheelGesture();
    lastWheelEventAt = now;
    if (!wheelOrbitTarget) {
      const rect = canvas.getBoundingClientRect();
      const pointer = new Cesium.Cartesian2(event.clientX - rect.left, event.clientY - rect.top);
      wheelOrbitTarget = pickGestureTarget(pointer);
      if (!wheelOrbitTarget) return;
      wheelMode = nextMode;
      // A transform without an offset preserves the exact camera pose while
      // making the surface below the cursor the pivot for both gesture modes.
      viewer.camera.lookAtTransform(Cesium.Transforms.eastNorthUpToFixedFrame(wheelOrbitTarget));
      if (wheelMode === "orbit") {
        const range = Cesium.Cartesian3.magnitude(viewer.camera.position);
        wheelOrbitPitch = Math.asin(Cesium.Math.clamp(-viewer.camera.position.z / range, -1, 1));
      }
      governor.hold("trackpad-wheel");
    }
    if (wheelMode === "pinch") {
      const currentRange = Cesium.Cartesian3.magnitude(viewer.camera.position);
      const nextRange = Cesium.Math.clamp(currentRange * Math.exp(event.deltaY * .004), 35, maximumZoomDistance);
      Cesium.Cartesian3.multiplyByScalar(viewer.camera.position, nextRange / currentRange, viewer.camera.position);
      const sidewaysRotation = Cesium.Math.clamp(
        Cesium.Math.toRadians(event.deltaX * .1),
        Cesium.Math.toRadians(-1.25),
        Cesium.Math.toRadians(1.25),
      );
      if (Math.abs(sidewaysRotation) > Cesium.Math.EPSILON10) viewer.camera.rotateRight(sidewaysRotation);
    } else {
      const maxStep = Cesium.Math.toRadians(1.6);
      const headingStep = Cesium.Math.clamp(Cesium.Math.toRadians(event.deltaX * .1), -maxStep, maxStep);
      const requestedPitch = Cesium.Math.clamp(
        wheelOrbitPitch - Cesium.Math.toRadians(event.deltaY * .04),
        Cesium.Math.toRadians(-85),
        Cesium.Math.toRadians(-12),
      );
      const pitchStep = Cesium.Math.clamp(requestedPitch - wheelOrbitPitch, -maxStep, maxStep);
      if (Math.abs(headingStep) > Cesium.Math.EPSILON10) viewer.camera.rotateRight(headingStep);
      if (Math.abs(pitchStep) > Cesium.Math.EPSILON10) {
        const safePosition = Cesium.Cartesian3.clone(viewer.camera.position);
        const safeDirection = Cesium.Cartesian3.clone(viewer.camera.direction);
        const safeUp = Cesium.Cartesian3.clone(viewer.camera.up);
        const safeRight = Cesium.Cartesian3.clone(viewer.camera.right);
        viewer.camera.rotateUp(pitchStep);
        const range = Cesium.Cartesian3.magnitude(viewer.camera.position);
        const appliedPitch = Math.asin(Cesium.Math.clamp(-viewer.camera.position.z / range, -1, 1));
        const unsafe = viewer.camera.position.z <= 0
          || appliedPitch < Cesium.Math.toRadians(-85)
          || appliedPitch > Cesium.Math.toRadians(-12);
        if (unsafe) {
          Cesium.Cartesian3.clone(safePosition, viewer.camera.position);
          Cesium.Cartesian3.clone(safeDirection, viewer.camera.direction);
          Cesium.Cartesian3.clone(safeUp, viewer.camera.up);
          Cesium.Cartesian3.clone(safeRight, viewer.camera.right);
        } else {
          wheelOrbitPitch = appliedPitch;
        }
      }
    }
    governor.request("trackpad-wheel");
    if (wheelEndTimer !== null) window.clearTimeout(wheelEndTimer);
    wheelEndTimer = window.setTimeout(() => {
      finishWheelGesture();
    }, 240);
  };
  const keydown = (event: KeyboardEvent) => {
    if (!["q", "Q", "e", "E", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const rotateLeft = event.key === "q" || event.key === "Q" || event.key === "ArrowLeft";
    viewer.camera.flyTo({
      destination: viewer.camera.positionWC,
      orientation: { heading: viewer.camera.heading + Cesium.Math.toRadians(rotateLeft ? 18 : -18), pitch: viewer.camera.pitch, roll: viewer.camera.roll },
      duration: .25,
    });
  };
  gestureSurface.style.touchAction = "none";
  window.addEventListener("gesturestart", start, { passive: false, capture: true });
  window.addEventListener("gesturechange", change, { passive: false, capture: true });
  window.addEventListener("gestureend", end, { passive: false, capture: true });
  gestureSurface.addEventListener("pointerdown", pointerdown, { capture: true });
  gestureSurface.addEventListener("wheel", wheel, { passive: false, capture: true });
  gestureSurface.addEventListener("keydown", keydown);
  if (!gestureSurface.hasAttribute("tabindex")) gestureSurface.tabIndex = 0;
  return () => {
    window.removeEventListener("gesturestart", start, { capture: true });
    window.removeEventListener("gesturechange", change, { capture: true });
    window.removeEventListener("gestureend", end, { capture: true });
    gestureSurface.removeEventListener("pointerdown", pointerdown, { capture: true });
    gestureSurface.removeEventListener("wheel", wheel, { capture: true });
    gestureSurface.removeEventListener("keydown", keydown);
    if (wheelEndTimer !== null) window.clearTimeout(wheelEndTimer);
    if (wheelOrbitTarget) governor.release("trackpad-wheel");
  };
}

function vegetationBounds(camera: CameraState, coverageBounds: readonly [number, number, number, number]) {
  const halfLongitude = 0.011;
  const halfLatitude = 0.008;
  // Keep auxiliary data on a stable grid. Orbiting can shift Cesium's reported
  // center by a few metres even though the user has not moved to a new area.
  // Those tiny changes must not fan out into new BAG, POI and vegetation calls.
  const gridSize = 0.006;
  const centerLongitude = Math.round(camera.center[0] / gridSize) * gridSize;
  const centerLatitude = Math.round(camera.center[1] / gridSize) * gridSize;
  const west = Math.max(coverageBounds[0], centerLongitude - halfLongitude);
  const south = Math.max(coverageBounds[1], centerLatitude - halfLatitude);
  const east = Math.min(coverageBounds[2], centerLongitude + halfLongitude);
  const north = Math.min(coverageBounds[3], centerLatitude + halfLatitude);
  return [west, south, east, north].map((value) => value.toFixed(6)).join(",");
}

export default function Renderer3DPlaceholder({ active = true }: { active?: boolean }) {
  const camera = useWorldSelector((state) => state.camera);
  const entities = useWorldSelector((state) => state.entities);
  const selectedEntityId = useWorldSelector((state) => state.selectedEntityId);
  const layers = useWorldSelector((state) => state.layers);
  const annotations = useWorldSelector((state) => state.annotations);
  const scenarioObjects = useWorldSelector((state) => state.scenarioObjects);
  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<CesiumRendererAdapter | null>(null);
  const parcelLoaderRef = useRef(new ViewportLoader<ParcelResponse>(300_000, 12));
  const buildingLoaderRef = useRef(new ViewportLoader<BuildingResponse>(300_000, 12));
  const poiLoaderRef = useRef(new ViewportLoader<PoiResponse>(3_600_000, 12));
  const loadParcelsRef = useRef<((camera: CameraState) => void) | null>(null);
  const loadBuildingsRef = useRef<((camera: CameraState) => void) | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const removeTelemetryListeners: Array<() => void> = [];
    let mountTimer: number | null = null;
    let vegetationController: AbortController | null = null;
    async function mount() {
      if (!containerRef.current) return;
      let startupStage = "Cesium-module";
      try {
        (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = CESIUM_ASSET_ROOT;
        const Cesium = await import("cesium");
        if (cancelled || !containerRef.current) return;
        startupStage = "Cesium-viewer";
        const viewer = new Cesium.Viewer(containerRef.current, { animation: false, timeline: false, baseLayerPicker: false, baseLayer: false, geocoder: false, homeButton: false, sceneModePicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, scene3DOnly: true, requestRenderMode: true, maximumRenderTimeChange: Number.POSITIVE_INFINITY, shadows: false });
        const settledResolutionScale = Math.min(window.devicePixelRatio || 1, 1.5);
        viewer.resolutionScale = settledResolutionScale;
        viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#e8e7e3");
        viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#e8e7e3");
        viewer.scene.globe.enableLighting = false;
        if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
        if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
        if (viewer.scene.moon) viewer.scene.moon.show = false;
        viewer.scene.highDynamicRange = true;
        viewer.scene.postProcessStages.fxaa.enabled = true;
        const bloom = viewer.scene.postProcessStages.bloom;
        bloom.enabled = true;
        bloom.uniforms.glowOnly = false;
        bloom.uniforms.contrast = 112;
        bloom.uniforms.brightness = -0.32;
        bloom.uniforms.delta = 1;
        bloom.uniforms.sigma = 2.1;
        bloom.uniforms.stepSize = 1;
        viewer.scene.fog.enabled = true;
        viewer.scene.fog.density = 0.00032;
        viewer.shadowMap.softShadows = true;
        viewer.shadowMap.maximumDistance = 5_000;
        viewer.clock.currentTime = Cesium.JulianDate.fromIso8601("2026-06-21T09:30:00Z");
        startupStage = "3D-tegels";
        const tileset = await Cesium.Cesium3DTileset.fromUrl(PDOK_BUILDINGS_TILESET_URL, OPEN_TILESET_OPTIONS);
        if (cancelled) { viewer.destroy(); return; }
        viewer.scene.globe.show = false;
        bloom.enabled = false;
        startupStage = "PDOK-terrein";
        const terrain = await Cesium.Cesium3DTileset.fromUrl(PDOK_TERRAIN_TILESET_URL, { ...OPEN_TILESET_OPTIONS, maximumScreenSpaceError: 7 });
        terrain.shadows = Cesium.ShadowMode.DISABLED;
        terrain.style = new Cesium.Cesium3DTileStyle({ color: "color('#deded8', 1.0)" });
        terrain.colorBlendMode = Cesium.Cesium3DTileColorBlendMode.MIX;
        terrain.colorBlendAmount = 0.52;
        viewer.scene.primitives.add(terrain);
        tileset.style = new Cesium.Cesium3DTileStyle({ color: "color('#cfcec9', 1.0)" });
        tileset.colorBlendMode = Cesium.Cesium3DTileColorBlendMode.REPLACE;
        tileset.colorBlendAmount = 1;
        tileset.shadows = Cesium.ShadowMode.DISABLED;
        tileset.imageBasedLighting.imageBasedLightingFactor = new Cesium.Cartesian2(.9, 0);
        viewer.scene.primitives.add(tileset);
        const treeBillboards = viewer.scene.primitives.add(new Cesium.BillboardCollection());
        startupStage = "Lumen-adapter";
        const governor = new RenderGovernor(viewer.scene);
        const constrainCamera = clampCameraToNetherlands;
        const coverageBounds = NETHERLANDS_BOUNDS;
        const maximumZoomDistance = NETHERLANDS_MAX_CAMERA_HEIGHT_M;
        removeTelemetryListeners.push(installTrackpadGestures(viewer, Cesium, governor, maximumZoomDistance));
        const adapter = new CesiumRendererAdapter(viewer, Cesium, tileset, treeBillboards, governor, constrainCamera);
        adapterRef.current = adapter;
        adapter.setActive(active);
        adapter.applyCamera(worldStore.getState().camera);
        adapter.applyLayers(worldStore.getState().layers);
        adapter.applyAnnotations(worldStore.getState().annotations);
        adapter.applyScenarioObjects(worldStore.getState().scenarioObjects);
        const selectedId = worldStore.getState().selectedEntityId;
        adapter.applySelection(selectedId ? worldStore.getState().entities[selectedId] ?? null : null);
        let loadedParcelFeatures: readonly GeoJSON.Feature[] = [];
        let parcelEntitiesByRegistrationId = new Map<string, WorldEntity>();
        installWorldPicking(viewer, Cesium, adapter, (entity, position) => {
          if (entity.type !== "building") return;
          const parcel = containingParcelEntity(position, loadedParcelFeatures, parcelEntitiesByRegistrationId);
          if (parcel) worldStore.linkEntities(entity.id, parcel.id);
        });
        configureCameraControls(viewer, Cesium, maximumZoomDistance);
        let vegetationKey = "";
        const loadVegetation = async (camera: CameraState) => {
          if (!worldStore.getState().layers.vegetation?.visible) return;
          const key = vegetationBounds(camera, coverageBounds);
          if (key === vegetationKey) return;
          vegetationKey = key;
          vegetationController?.abort();
          vegetationController = new AbortController();
          worldStore.setLayerStatus("vegetation", "loading");
          try {
            const response = await fetch(`/api/world/vegetation?bbox=${key}`, { signal: vegetationController.signal });
            if (!response.ok) throw new Error("BGT-vegetatie kon niet worden geladen.");
            const data = await response.json() as TreeResponse;
            const sourceTrees = data.trees ?? [];
            const positions = sourceTrees.map((tree) => Cesium.Cartesian3.fromDegrees(tree.position[0], tree.position[1], 80));
            const clamped = viewer.scene.clampToHeightSupported
              ? await viewer.scene.clampToHeightMostDetailed(positions)
              : sourceTrees.map((tree) => Cesium.Cartesian3.fromDegrees(tree.position[0], tree.position[1], 45));
            if (cancelled || key !== vegetationKey) return;
            treeBillboards.removeAll();
            sourceTrees.forEach((tree, index) => {
              treeBillboards.add({
                id: tree.id,
                position: clamped[index] ?? Cesium.Cartesian3.fromDegrees(tree.position[0], tree.position[1], 45),
                image: TREE_SPRITE,
                width: 20,
                height: 30,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                distanceDisplayCondition: new Cesium.DistanceDisplayCondition(120, 2_000),
                scaleByDistance: new Cesium.NearFarScalar(200, 0.9, 2_000, 0.5),
              });
            });
            worldStore.setLayerStatus("vegetation", "ready");
            governor.request("vegetation");
          } catch (cause) {
            if (!(cause instanceof Error && cause.name === "AbortError")) worldStore.setLayerStatus("vegetation", "error", "BGT-bomen konden niet worden geladen.");
          }
        };
        let buildingKey = "";
        let loadedBuildingFeatures: readonly GeoJSON.Feature[] = [];
        const loadPoiBuildings = async (key: string, buildingFeatures: readonly GeoJSON.Feature[]) => {
          if (!worldStore.getState().layers.amenities?.visible) {
            poiLoaderRef.current.cancel(); adapter.setPoiBuildingIds([]); worldStore.replaceEntitiesOfType("infrastructure", []); worldStore.setLayerStatus("amenities", "idle"); return;
          }
          worldStore.setLayerStatus("amenities", "loading");
          try {
            const loaded = await poiLoaderRef.current.load(key, async (signal) => {
              const response = await fetch(`/api/world/pois?bbox=${key}`, { signal });
              const data = await response.json() as PoiResponse;
              if (!response.ok) throw new Error(data.error ?? "Voorzieningen konden niet worden geladen.");
              return data;
            });
            if (cancelled || !loaded.current || key !== buildingKey) return;
            const poiEntities = loaded.value.entities ?? [];
            const poiByBuildingId = new Map<string, WorldEntity>();
            for (const building of buildingFeatures) {
              const poiFeature = (loaded.value.features ?? []).find((poi) => poi.geometry.type === "Point" && geometryContainsPoint(building.geometry, poi.geometry.coordinates));
              const poi = poiEntities.find((candidate) => candidate.id === poiFeature?.properties?.lumenEntityId);
              const buildingId = String(building.properties?.identificatie ?? building.id ?? "");
              if (poi && buildingId) poiByBuildingId.set(buildingId, poi);
            }
            worldStore.replaceEntitiesOfType("infrastructure", poiEntities);
            const enrichedBuildings = Object.values(worldStore.getState().entities).filter((entity) => entity.type === "building").map((building) => {
              const poi = poiByBuildingId.get(String(building.properties.identificatie ?? ""));
              return poi ? { ...building, name: poi.name, description: poi.description, properties: { ...building.properties, poiCategory: poi.properties.category, poiName: poi.name }, provenance: [...building.provenance, ...poi.provenance] } : building;
            });
            worldStore.replaceEntitiesOfType("building", enrichedBuildings);
            adapter.setPoiBuildingIds(poiByBuildingId.keys());
            worldStore.setLayerStatus("amenities", "ready");
          } catch (cause) {
            if (!(cause instanceof Error && cause.name === "AbortError")) worldStore.setLayerStatus("amenities", "error", cause instanceof Error ? cause.message : "Voorzieningen konden niet worden geladen.");
          }
        };
        const loadBuildings = async (camera: CameraState) => {
          if (!worldStore.getState().layers.buildings?.visible) {
            buildingLoaderRef.current.cancel(); poiLoaderRef.current.cancel(); buildingKey = ""; adapter.setPoiBuildingIds([]); worldStore.replaceEntitiesOfType("building", []); worldStore.setLayerStatus("buildings", "idle"); return;
          }
          const key = vegetationBounds(camera, coverageBounds);
          if (key === buildingKey) {
            if (worldStore.getState().layers.amenities?.visible) void loadPoiBuildings(key, loadedBuildingFeatures);
            else { poiLoaderRef.current.cancel(); adapter.setPoiBuildingIds([]); worldStore.replaceEntitiesOfType("infrastructure", []); worldStore.setLayerStatus("amenities", "idle"); }
            return;
          }
          buildingKey = key;
          worldStore.setLayerStatus("buildings", "loading");
          try {
            const loaded = await buildingLoaderRef.current.load(key, async (signal) => {
              const response = await fetch(`/api/world/buildings?bbox=${key}`, { signal });
              const data = await response.json() as BuildingResponse;
              if (!response.ok) throw new Error(data.error ?? "BAG kon niet worden geladen.");
              return data;
            });
            if (cancelled || !loaded.current || key !== buildingKey) return;
            loadedBuildingFeatures = loaded.value.features ?? [];
            worldStore.replaceEntitiesOfType("building", loaded.value.entities ?? []);
            worldStore.setLayerStatus("buildings", "ready");
            void loadPoiBuildings(key, loadedBuildingFeatures);
          } catch (cause) {
            if (!(cause instanceof Error && cause.name === "AbortError")) worldStore.setLayerStatus("buildings", "error", "BAG-selectie kon niet worden geladen.");
          }
        };
        loadBuildingsRef.current = (nextCamera) => { void loadBuildings(nextCamera); };
        const loadParcels = async (camera: CameraState) => {
          if (camera.zoom < 14 || !worldStore.getState().layers.parcels?.visible) {
            parcelLoaderRef.current.cancel(); loadedParcelFeatures = []; parcelEntitiesByRegistrationId = new Map(); adapter.setParcels([]); worldStore.replaceEntitiesOfType("parcel", []); worldStore.setLayerStatus("parcels", "idle"); return;
          }
          const key = vegetationBounds(camera, coverageBounds);
          worldStore.setLayerStatus("parcels", "loading");
          try {
            const loaded = await parcelLoaderRef.current.load(key, async (signal) => {
              const response = await fetch(`/api/world/parcels?bbox=${key}`, { signal });
              const data = await response.json() as ParcelResponse;
              if (!response.ok) throw new Error(data.error ?? "Percelen konden niet worden geladen.");
              return data;
            });
            if (cancelled || !loaded.current) return;
            loadedParcelFeatures = loaded.value.features ?? [];
            parcelEntitiesByRegistrationId = new Map((loaded.value.entities ?? []).map((entity) => [String(entity.properties.identificatie ?? ""), entity]));
            worldStore.replaceEntitiesOfType("parcel", loaded.value.entities ?? []);
            adapter.setParcels(loadedParcelFeatures);
            const selectedId = worldStore.getState().selectedEntityId;
            adapter.applySelection(selectedId ? worldStore.getState().entities[selectedId] ?? null : null);
            worldStore.setLayerStatus("parcels", loaded.value.truncated ? "error" : "ready", loaded.value.truncated ? "Niet alle percelen pasten in deze viewport; zoom verder in." : undefined);
          } catch (cause) {
            if (!(cause instanceof Error && cause.name === "AbortError")) worldStore.setLayerStatus("parcels", "error", cause instanceof Error ? cause.message : "Percelen konden niet worden geladen.");
          }
        };
        loadParcelsRef.current = (nextCamera) => { void loadParcels(nextCamera); };
        const initialCamera = adapter.readCamera();
        void loadVegetation(initialCamera);
        void loadBuildings(initialCamera);
        void loadParcels(initialCamera);
        let qualityRestoreTimer: number | null = null;
        const restoreSettledQuality = () => {
          viewer.resolutionScale = settledResolutionScale;
          tileset.maximumScreenSpaceError = OPEN_TILESET_OPTIONS.maximumScreenSpaceError;
          if (terrain) terrain.maximumScreenSpaceError = 9;
          bloom.enabled = false;
          adapter.applyLayers(worldStore.getState().layers);
          governor.request("camera-quality-restored");
        };
        removeTelemetryListeners.push(viewer.camera.moveStart.addEventListener(() => {
          // Camera movement is latency-sensitive. Refine detail and post-processing
          // once it stops instead of competing with every interaction frame.
          if (qualityRestoreTimer !== null) window.clearTimeout(qualityRestoreTimer);
          viewer.resolutionScale = Math.min(settledResolutionScale, 1.25);
          tileset.maximumScreenSpaceError = 16;
          if (terrain) terrain.maximumScreenSpaceError = 18;
          bloom.enabled = false;
          treeBillboards.show = false;
        }));
        removeTelemetryListeners.push(viewer.camera.moveEnd.addEventListener(() => {
          if (qualityRestoreTimer !== null) window.clearTimeout(qualityRestoreTimer);
          qualityRestoreTimer = window.setTimeout(() => {
            qualityRestoreTimer = null;
            if (!cancelled) restoreSettledQuality();
          }, 180);
          if (adapterRef.current) {
            const observed = adapterRef.current.readCamera();
            const constrained = constrainCamera(observed);
            worldStore.execute({ type: "set_camera", camera: constrained });
            void loadVegetation(constrained);
            void loadBuildings(constrained);
            void loadParcels(constrained);
          }
        }));
        setStatus("ready");
        removeTelemetryListeners.push(() => { if (qualityRestoreTimer !== null) window.clearTimeout(qualityRestoreTimer); });
      } catch (cause) {
        if (!cancelled) { setStatus("error"); setError(`${startupStage}: ${cause instanceof Error ? cause.message : "3D kon niet worden geladen."}`); }
      }
    }
    // React replays effects once in development. Deferring the provider startup lets
    // that throwaway pass cancel before it can consume a second root tileset session.
    mountTimer = window.setTimeout(() => { void mount(); }, 0);
    return () => {
      cancelled = true;
      loadParcelsRef.current = null;
      loadBuildingsRef.current = null;
      parcelLoaderRef.current.cancel();
      vegetationController?.abort();
      buildingLoaderRef.current.cancel();
      poiLoaderRef.current.cancel();
      if (mountTimer !== null) window.clearTimeout(mountTimer);
      for (const remove of removeTelemetryListeners) remove();
      adapterRef.current?.unmount();
      adapterRef.current = null;
    };
  }, []);

  useEffect(() => { if (status === "ready") adapterRef.current?.setActive(active); }, [active, status]);

  useEffect(() => { if (status === "ready") adapterRef.current?.applyCamera(camera); }, [camera, status]);
  useEffect(() => { if (status === "ready") adapterRef.current?.applySelection(selectedEntityId ? entities[selectedEntityId] ?? null : null); }, [entities, selectedEntityId, status]);
  useEffect(() => {
    if (status !== "ready") return;
    adapterRef.current?.applyLayers(layers);
    if (layers.parcels?.visible) loadParcelsRef.current?.(adapterRef.current!.readCamera());
    else parcelLoaderRef.current.cancel();
    loadBuildingsRef.current?.(adapterRef.current!.readCamera());
  }, [layers, status]);
  useEffect(() => { if (status === "ready") adapterRef.current?.applyAnnotations(annotations); }, [annotations, status]);
  useEffect(() => { if (status === "ready") adapterRef.current?.applyScenarioObjects(scenarioObjects); }, [scenarioObjects, status]);

  return <div className="renderer3d openClay" aria-label="Driedimensionale wereldweergave"><div ref={containerRef} className="cesiumWorld" />{status === "ready" ? <div className="rendererSource fallback" title="Open 3D Basisvoorziening met BGT-vegetatie."><span />Open 3D · PDOK / BGT</div> : <div className="rendererLoading"><div><strong>{status === "loading" ? "3D laden" : "3D niet beschikbaar"}</strong>{status === "error" ? <span>{error}</span> : null}</div></div>}</div>;
}
