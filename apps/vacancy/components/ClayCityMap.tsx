"use client";

import { useEffect, useMemo, useRef } from "react";
import maplibregl, {
  type CustomLayerInterface,
  type Map as MapLibreMap,
} from "maplibre-gl";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

type LngLatTuple = [lng: number, lat: number];

type RoofMode = "flat" | "gabled";

export interface ClayBuildingPart {
  footprint: LngLatTuple[];
  heightMeters: number;
  baseHeightMeters?: number;
  roof?: RoofMode;
}

export interface ClayBuildingGeometry {
  id: string;
  parts: ClayBuildingPart[];
}

export interface ClayCityMapProps {
  selectedBuildingId?: string | null;
  buildings?: ClayBuildingGeometry[];
  initialCenter?: LngLatTuple;
  initialZoom?: number;
  className?: string;
  style?: React.CSSProperties;
}

type DisposablePass = {
  dispose?: () => void;
};

const CLAY_LAYER_ID = "lumen-clay-city-layer";
const BLOOM_LAYER = 1;
const CLAY_COLOR = 0xe8e6df;
const SELECTED_COLOR = 0x43d9ff;

const DEFAULT_CENTER: LngLatTuple = [6.1552, 52.2533];
const DEFAULT_BUILDINGS: ClayBuildingGeometry[] = [
  {
    id: "deventer-block-a",
    parts: [
      {
        footprint: [
          [6.15375, 52.25315],
          [6.15428, 52.25317],
          [6.15425, 52.25348],
          [6.1537, 52.25346],
        ],
        heightMeters: 22,
        roof: "gabled",
      },
      {
        footprint: [
          [6.15395, 52.2535],
          [6.1542, 52.25351],
          [6.15418, 52.2537],
          [6.15393, 52.25369],
        ],
        heightMeters: 14,
      },
    ],
  },
  {
    id: "deventer-civic-tower",
    parts: [
      {
        footprint: [
          [6.15455, 52.25303],
          [6.1549, 52.25304],
          [6.15488, 52.25336],
          [6.15452, 52.25335],
        ],
        heightMeters: 30,
      },
      {
        footprint: [
          [6.15464, 52.25311],
          [6.15482, 52.25312],
          [6.15481, 52.25327],
          [6.15463, 52.25326],
        ],
        baseHeightMeters: 30,
        heightMeters: 42,
      },
    ],
  },
  {
    id: "deventer-roof-row",
    parts: [
      {
        footprint: [
          [6.1551, 52.2532],
          [6.15555, 52.25322],
          [6.15552, 52.25355],
          [6.15506, 52.25353],
        ],
        heightMeters: 18,
        roof: "gabled",
      },
      {
        footprint: [
          [6.15562, 52.25318],
          [6.1561, 52.2532],
          [6.15605, 52.25352],
          [6.15559, 52.2535],
        ],
        heightMeters: 16,
        roof: "gabled",
      },
    ],
  },
  {
    id: "deventer-stepped-campus",
    parts: [
      {
        footprint: [
          [6.15425, 52.25266],
          [6.15505, 52.25267],
          [6.15503, 52.25295],
          [6.15422, 52.25294],
        ],
        heightMeters: 13,
      },
      {
        footprint: [
          [6.15446, 52.25272],
          [6.15484, 52.25273],
          [6.15482, 52.25289],
          [6.15444, 52.25288],
        ],
        baseHeightMeters: 13,
        heightMeters: 24,
      },
    ],
  },
];

export function ClayCityMap({
  selectedBuildingId = "deventer-civic-tower",
  buildings,
  initialCenter = DEFAULT_CENTER,
  initialZoom = 17,
  className,
  style,
}: ClayCityMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const layerRef = useRef<ClayCityLayer | null>(null);
  const selectedBuildingIdRef = useRef<string | null>(selectedBuildingId ?? null);
  const buildingData = useMemo(() => buildings ?? DEFAULT_BUILDINGS, [buildings]);

  useEffect(() => {
    selectedBuildingIdRef.current = selectedBuildingId ?? null;
  }, [selectedBuildingId]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildMinimalClayStyle(),
      center: initialCenter,
      zoom: initialZoom,
      pitch: 64,
      bearing: -28,
      maxPitch: 78,
      minZoom: 14,
      maxZoom: 20,
      antialias: true,
      attributionControl: false,
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");

    const handleLoad = () => {
      const layer = new ClayCityLayer({
        buildings: buildingData,
        selectedBuildingId: selectedBuildingIdRef.current,
        origin: initialCenter,
      });
      layerRef.current = layer;
      map.addLayer(layer);
    };

    map.on("load", handleLoad);

    return () => {
      map.off("load", handleLoad);
      layerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [buildingData, initialCenter, initialZoom]);

  useEffect(() => {
    layerRef.current?.setSelectedBuildingId(selectedBuildingId ?? null);
    mapRef.current?.triggerRepaint();
  }, [selectedBuildingId]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 520,
        overflow: "hidden",
        background: "#f4f1ea",
        ...style,
      }}
    />
  );
}

class ClayCityLayer implements CustomLayerInterface {
  id = CLAY_LAYER_ID;
  type = "custom" as const;
  renderingMode = "3d" as const;

  private readonly buildings: ClayBuildingGeometry[];
  private readonly origin: LngLatTuple;
  private selectedBuildingId: string | null;
  private map: MapLibreMap | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private composer: EffectComposer | null = null;
  private ssaoPass: SSAOPass | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera();
  private modelTransform = new THREE.Matrix4();
  private buildingMeshes = new Map<string, THREE.Mesh[]>();
  private selectionOutlines = new Map<string, THREE.LineSegments[]>();
  private resizeHandler: (() => void) | null = null;

  constructor({
    buildings,
    selectedBuildingId,
    origin,
  }: {
    buildings: ClayBuildingGeometry[];
    selectedBuildingId: string | null;
    origin: LngLatTuple;
  }) {
    this.buildings = buildings;
    this.selectedBuildingId = selectedBuildingId;
    this.origin = origin;
  }

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;

    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.background = null;
    this.camera.layers.enable(BLOOM_LAYER);

    this.modelTransform = buildMercatorModelTransform(this.origin);
    this.setupLights();
    this.addGroundPlane();
    this.addBuildings();
    this.setupComposer();
    this.setSelectedBuildingId(this.selectedBuildingId);

    this.resizeHandler = () => this.resize();
    map.on("resize", this.resizeHandler);
    this.resize();
  }

  render(...[gl, matrix]: Parameters<CustomLayerInterface["render"]>) {
    if (!this.map || !this.renderer || !this.composer) return;

    this.camera.projectionMatrix = new THREE.Matrix4()
      .fromArray(matrix)
      .multiply(this.modelTransform);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

    this.renderer.resetState();
    gl.clear(gl.DEPTH_BUFFER_BIT);
    this.composer.render();
    this.renderer.resetState();
    this.map.triggerRepaint();
  }

  onRemove(map: MapLibreMap) {
    if (this.resizeHandler) {
      map.off("resize", this.resizeHandler);
      this.resizeHandler = null;
    }

    this.disposeObject3D(this.scene);
    this.buildingMeshes.clear();
    this.selectionOutlines.clear();

    this.disposeComposer();
    this.renderer?.renderLists.dispose();
    this.renderer?.dispose();

    this.composer = null;
    this.ssaoPass = null;
    this.bloomPass = null;
    this.renderer = null;
    this.map = null;
  }

  setSelectedBuildingId(id: string | null) {
    this.selectedBuildingId = id;

    for (const [buildingId, meshes] of this.buildingMeshes) {
      const selected = Boolean(id && buildingId === id);
      for (const mesh of meshes) {
        mesh.layers.enable(0);
        if (selected) {
          mesh.layers.enable(BLOOM_LAYER);
        } else {
          mesh.layers.disable(BLOOM_LAYER);
        }
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.color.setHex(CLAY_COLOR);
        material.emissive.setHex(selected ? SELECTED_COLOR : 0x000000);
        material.emissiveIntensity = selected ? 1.4 : 0;
      }
    }

    for (const [buildingId, outlines] of this.selectionOutlines) {
      const selected = Boolean(id && buildingId === id);
      for (const outline of outlines) {
        outline.visible = selected;
      }
    }
  }

  private setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 2.2);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xfff7e7, 3.6);
    key.position.set(-80, -120, 180);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 520;
    key.shadow.camera.left = -240;
    key.shadow.camera.right = 240;
    key.shadow.camera.top = 240;
    key.shadow.camera.bottom = -240;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0xd9f0ff, 1.2);
    rim.position.set(120, 90, 120);
    this.scene.add(rim);
  }

  private addGroundPlane() {
    const geometry = new THREE.PlaneGeometry(520, 520);
    const material = new THREE.MeshStandardMaterial({
      color: 0xf4f1ea,
      roughness: 0.92,
      metalness: 0.02,
    });
    const ground = new THREE.Mesh(geometry, material);
    ground.receiveShadow = true;
    ground.position.z = -0.04;
    this.scene.add(ground);
  }

  private addBuildings() {
    const originMercator = maplibregl.MercatorCoordinate.fromLngLat(this.origin, 0);
    const meterScale = originMercator.meterInMercatorCoordinateUnits();
    const clayMaterial = createClayMaterial();

    for (const building of this.buildings) {
      const meshes: THREE.Mesh[] = [];
      const outlines: THREE.LineSegments[] = [];

      for (const part of building.parts) {
        const localFootprint = part.footprint.map((point) =>
          lngLatToLocalMeters(point, originMercator, meterScale),
        );
        const geometry = buildBuildingGeometry(localFootprint, part);
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();

        const mesh = new THREE.Mesh(geometry, clayMaterial.clone());
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.buildingId = building.id;
        this.scene.add(mesh);
        meshes.push(mesh);

        const outline = createSelectionOutline(geometry);
        this.scene.add(outline);
        outlines.push(outline);
      }

      this.buildingMeshes.set(building.id, meshes);
      this.selectionOutlines.set(building.id, outlines);
    }
  }

  private setupComposer() {
    if (!this.renderer || !this.map) return;

    const canvas = this.map.getCanvas();
    const size = new THREE.Vector2(canvas.clientWidth, canvas.clientHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(size.x, size.y);

    const renderPass = new RenderPass(this.scene, this.camera);
    renderPass.clear = false;
    this.composer.addPass(renderPass);

    this.ssaoPass = new SSAOPass(this.scene, this.camera, size.x, size.y);
    this.ssaoPass.kernelRadius = 18;
    this.ssaoPass.minDistance = 0.004;
    this.ssaoPass.maxDistance = 0.13;
    this.composer.addPass(this.ssaoPass);

    this.bloomPass = new UnrealBloomPass(size, 0.9, 0.48, 0.2);
    this.bloomPass.threshold = 0.12;
    this.bloomPass.strength = 0.85;
    this.bloomPass.radius = 0.52;
    this.composer.addPass(this.bloomPass);
  }

  private resize() {
    if (!this.map || !this.renderer || !this.composer) return;

    const canvas = this.map.getCanvas();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.ssaoPass?.setSize(width, height);
    this.bloomPass?.setSize(width, height);
  }

  private disposeComposer() {
    if (!this.composer) return;

    for (const pass of this.composer.passes as DisposablePass[]) {
      pass.dispose?.();
    }
    this.composer.dispose();
  }

  private disposeObject3D(root: THREE.Object3D) {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh | THREE.LineSegments;
      const geometry = (mesh as { geometry?: THREE.BufferGeometry }).geometry;
      const material = (mesh as { material?: THREE.Material | THREE.Material[] })
        .material;

      geometry?.dispose();
      if (Array.isArray(material)) {
        for (const item of material) item.dispose();
      } else {
        material?.dispose();
      }
    });
    root.clear();
  }
}

function buildMinimalClayStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      brt: {
        type: "raster",
        tiles: [
          "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution: "© PDOK / Kadaster",
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#f4f1ea" },
      },
      {
        id: "brt-muted",
        type: "raster",
        source: "brt",
        paint: {
          "raster-opacity": 0.18,
          "raster-saturation": -1,
          "raster-contrast": -0.2,
        },
      },
    ],
  };
}

function buildMercatorModelTransform(origin: LngLatTuple) {
  const mercator = maplibregl.MercatorCoordinate.fromLngLat(origin, 0);
  const scale = mercator.meterInMercatorCoordinateUnits();

  return new THREE.Matrix4()
    .makeTranslation(mercator.x, mercator.y, mercator.z)
    .scale(new THREE.Vector3(scale, -scale, scale));
}

function lngLatToLocalMeters(
  point: LngLatTuple,
  origin: maplibregl.MercatorCoordinate,
  meterScale: number,
): THREE.Vector2 {
  const mercator = maplibregl.MercatorCoordinate.fromLngLat(point, 0);
  return new THREE.Vector2(
    (mercator.x - origin.x) / meterScale,
    (mercator.y - origin.y) / -meterScale,
  );
}

function buildBuildingGeometry(
  footprint: THREE.Vector2[],
  part: ClayBuildingPart,
): THREE.BufferGeometry {
  return part.roof === "gabled"
    ? buildGabledPrismGeometry(footprint, part)
    : buildFlatPrismGeometry(footprint, part);
}

function buildFlatPrismGeometry(
  footprint: THREE.Vector2[],
  part: ClayBuildingPart,
): THREE.BufferGeometry {
  const base = part.baseHeightMeters ?? 0;
  const top = part.heightMeters;
  const positions: number[] = [];
  const indices: number[] = [];
  const triangles = THREE.ShapeUtils.triangulateShape(footprint, []);

  for (const point of footprint) positions.push(point.x, point.y, base);
  for (const point of footprint) positions.push(point.x, point.y, top);

  for (const triangle of triangles) {
    const [i0, i1, i2] = triangle as [number, number, number];
    indices.push(i2, i1, i0);
    indices.push(i0 + footprint.length, i1 + footprint.length, i2 + footprint.length);
  }

  appendWallIndices(indices, footprint.length);
  return makeGeometry(positions, indices);
}

function buildGabledPrismGeometry(
  footprint: THREE.Vector2[],
  part: ClayBuildingPart,
): THREE.BufferGeometry {
  if (footprint.length !== 4) return buildFlatPrismGeometry(footprint, part);

  const base = part.baseHeightMeters ?? 0;
  const eave = part.heightMeters;
  const ridge = eave + Math.max(4, part.heightMeters * 0.2);
  const positions: number[] = [];
  const indices: number[] = [];
  const [a, b, c, d] = footprint as [
    THREE.Vector2,
    THREE.Vector2,
    THREE.Vector2,
    THREE.Vector2,
  ];
  const ridgeStart = new THREE.Vector2().addVectors(a, d).multiplyScalar(0.5);
  const ridgeEnd = new THREE.Vector2().addVectors(b, c).multiplyScalar(0.5);

  for (const point of footprint) positions.push(point.x, point.y, base);
  for (const point of footprint) positions.push(point.x, point.y, eave);
  positions.push(ridgeStart.x, ridgeStart.y, ridge, ridgeEnd.x, ridgeEnd.y, ridge);

  appendWallIndices(indices, 4);
  indices.push(4, 5, 9, 4, 9, 8);
  indices.push(7, 8, 9, 7, 9, 6);
  indices.push(4, 8, 7);
  indices.push(5, 6, 9);
  indices.push(2, 1, 0, 3, 2, 0);

  return makeGeometry(positions, indices);
}

function appendWallIndices(indices: number[], footprintLength: number) {
  for (let i = 0; i < footprintLength; i += 1) {
    const next = (i + 1) % footprintLength;
    const baseA = i;
    const baseB = next;
    const topA = i + footprintLength;
    const topB = next + footprintLength;
    indices.push(baseA, baseB, topB, baseA, topB, topA);
  }
}

function makeGeometry(positions: number[], indices: number[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  return geometry;
}

function createClayMaterial() {
  return new THREE.MeshStandardMaterial({
    color: CLAY_COLOR,
    roughness: 0.85,
    metalness: 0.1,
    emissive: 0x000000,
    emissiveIntensity: 0,
  });
}

function createSelectionOutline(geometry: THREE.BufferGeometry) {
  const outlineGeometry = new THREE.EdgesGeometry(geometry, 18);
  const outlineMaterial = new THREE.LineBasicMaterial({
    color: SELECTED_COLOR,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthTest: false,
  });
  const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);
  outline.layers.enable(BLOOM_LAYER);
  outline.visible = false;
  return outline;
}
