"use client";

import { useEffect, useRef, useState } from "react";
import type { VboFeature } from "./AppShell";
import styles from "./ThreeDPanel.module.css";

const CESIUM_JS_URL =
  "https://cesium.com/downloads/cesiumjs/releases/1.133/Build/Cesium/Cesium.js";
const CESIUM_CSS_URL =
  "https://cesium.com/downloads/cesiumjs/releases/1.133/Build/Cesium/Widgets/widgets.css";
const BAG_3D_TILESET_URL =
  "https://data.3dbag.nl/v20250903/cesium3dtiles/lod22/tileset.json";
const PDOK_LUCHTFOTO_URL =
  "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg";

let cesiumLoadPromise: Promise<unknown> | null = null;

declare global {
  interface Window {
    Cesium?: any;
  }
}

interface ThreeDPanelProps {
  feature: VboFeature;
  onClose: () => void;
}

export function ThreeDPanel({ feature, onClose }: ThreeDPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [activeMode, setActiveMode] = useState<"model" | "street">("model");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [streetState, setStreetState] = useState<{
    isLoading: boolean;
    error: string;
    configured: boolean;
    image: {
      id: string;
      imageUrl: string | null;
      viewerUrl: string;
      capturedAt: string | null;
    } | null;
  }>({
    isLoading: true,
    error: "",
    configured: true,
    image: null,
  });

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    async function initViewer() {
      if (!containerRef.current) return;

      try {
        setState("loading");
        const Cesium = (await loadCesium()) as any;
        if (cancelled || !containerRef.current) return;

        const viewer = new Cesium.Viewer(containerRef.current, {
          animation: false,
          timeline: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          fullscreenButton: false,
          infoBox: false,
          selectionIndicator: false,
          scene3DOnly: true,
          shadows: true,
          shouldAnimate: true,
        });

        viewerRef.current = viewer;
        viewer.imageryLayers.removeAll();
        viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url: PDOK_LUCHTFOTO_URL,
            credit: "© PDOK / Kadaster",
            maximumLevel: 19,
          }),
        );

        const tileset = await Cesium.Cesium3DTileset.fromUrl(BAG_3D_TILESET_URL, {
          maximumScreenSpaceError: 6,
        });
        if (cancelled) {
          viewer.destroy();
          return;
        }

        viewer.scene.primitives.add(tileset);
        viewer.scene.globe.enableLighting = true;
        viewer.scene.screenSpaceCameraController.enableCollisionDetection =
          false;
        setState("ready");
        focusFeature(viewer, Cesium, feature);
      } catch (error) {
        if (cancelled) return;
        setState("error");
        setErrorMessage((error as Error).message || "3D viewer kon niet laden.");
      }
    }

    initViewer();

    return () => {
      cancelled = true;
      if (viewerRef.current && !viewerRef.current.isDestroyed?.()) {
        viewerRef.current.destroy();
      }
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || !Cesium || state !== "ready") return;

    focusFeature(viewer, Cesium, feature);
  }, [feature, state]);

  useEffect(() => {
    const controller = new AbortController();
    const [lng, lat] = getFeatureCenter(feature);
    const url = new URL("/api/streetview", window.location.origin);
    url.searchParams.set("lng", String(lng));
    url.searchParams.set("lat", String(lat));

    setStreetState({
      isLoading: true,
      error: "",
      configured: true,
      image: null,
    });

    fetch(url.toString(), { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as {
          configured?: boolean;
          error?: string;
          image?: {
            id: string;
            imageUrl: string | null;
            viewerUrl: string;
            capturedAt: string | null;
          } | null;
        };

        if (!response.ok) {
          throw new Error(data.error || "Straatbeeld kon niet worden geladen.");
        }

        setStreetState({
          isLoading: false,
          error: data.error ?? "",
          configured: data.configured !== false,
          image: data.image ?? null,
        });
      })
      .catch((error) => {
        if ((error as Error).name === "AbortError") return;
        setStreetState({
          isLoading: false,
          error: (error as Error).message,
          configured: false,
          image: null,
        });
      });

    return () => controller.abort();
  }, [feature]);

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.headerMeta}>
            <span className={styles.eyebrow}>3D Model</span>
            <h2 className={styles.title}>
              {feature.properties.woonplaatsnaam || "Object"}{" "}
              {feature.properties.identificatie.slice(-6)}
            </h2>
            <p className={styles.subtitle}>
              3DBAG LoD2.2 geometrie met PDOK luchtfoto. Dit zijn echte 3D
              gebouwvormen, maar geen fototexturen.
            </p>
          </div>
          <div className={styles.modeTabs}>
            <button
              type="button"
              onClick={() => setActiveMode("model")}
              className={`${styles.modeTab} ${
                activeMode === "model" ? styles.modeTabActive : ""
              }`}
            >
              3D model
            </button>
            <button
              type="button"
              onClick={() => setActiveMode("street")}
              className={`${styles.modeTab} ${
                activeMode === "street" ? styles.modeTabActive : ""
              }`}
            >
              Straatbeeld
            </button>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Sluit 3D viewer"
          >
            Sluiten
          </button>
        </div>

        {activeMode === "model" ? (
          <div className={styles.viewerWrap}>
            <div ref={containerRef} className={styles.viewer} />
            {state === "loading" && (
              <div className={styles.overlayMessage}>
                3D gebouwen laden...
              </div>
            )}
            {state === "error" && (
              <div className={styles.overlayMessage}>
                <strong>3D viewer kon niet laden.</strong>
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.streetWrap}>
            {streetState.isLoading ? (
              <div className={styles.overlayMessage}>Straatbeeld laden...</div>
            ) : !streetState.configured ? (
              <div className={styles.overlayMessage}>
                <strong>Straatbeeld niet geconfigureerd.</strong>
                <span>{streetState.error}</span>
              </div>
            ) : !streetState.image?.imageUrl ? (
              <div className={styles.overlayMessage}>
                <strong>Geen straatbeeld gevonden.</strong>
                <span>
                  Er is geen nabij Mapillary-beeld beschikbaar voor deze
                  locatie.
                </span>
              </div>
            ) : (
              <>
                <img
                  src={streetState.image.imageUrl}
                  alt="Straatbeeld van de geselecteerde locatie"
                  className={styles.streetImage}
                />
                <div className={styles.streetMeta}>
                  <span>
                    Vast straatbeeld dichtbij het object. Dit beeld navigeert
                    niet mee, zodat je de gevel rustig kunt beoordelen.
                  </span>
                  <a
                    href={streetState.image.viewerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.streetLink}
                  >
                    Open in Mapillary
                  </a>
                </div>
              </>
            )}
          </div>
        )}

        <div className={styles.footer}>
          <span>
            {activeMode === "model"
              ? "Navigatie: linkermuisknop om te draaien, rechtermuisknop om te pannen, scroll om te zoomen."
              : "Straatbeeld blijft vast op de dichtstbijzijnde opname, zodat de voorgevel leesbaar blijft."}
          </span>
          {feature.properties.pandIdentificatie && (
            <span>Pand: {feature.properties.pandIdentificatie}</span>
          )}
        </div>
      </div>
    </div>
  );
}

async function loadCesium() {
  if (typeof window === "undefined") {
    throw new Error("Cesium kan alleen in de browser geladen worden.");
  }
  if (window.Cesium) return window.Cesium;
  if (cesiumLoadPromise) return cesiumLoadPromise;

  cesiumLoadPromise = new Promise((resolve, reject) => {
    ensureStylesheet(CESIUM_CSS_URL, "cesium-widgets-css");

    const existingScript = document.getElementById(
      "cesium-script",
    ) as HTMLScriptElement | null;

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.Cesium), {
        once: true,
      });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Cesium script kon niet geladen worden.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = "cesium-script";
    script.src = CESIUM_JS_URL;
    script.async = true;
    script.onload = () => resolve(window.Cesium);
    script.onerror = () =>
      reject(new Error("Cesium script kon niet geladen worden."));
    document.head.appendChild(script);
  });

  return cesiumLoadPromise;
}

function ensureStylesheet(href: string, id: string) {
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function focusFeature(viewer: any, Cesium: any, feature: VboFeature) {
  const [lng, lat] = getFeatureCenter(feature);
  viewer.entities.removeAll();

  const marker = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(lng, lat, 18),
    point: {
      pixelSize: 10,
      color: Cesium.Color.fromCssColorString("#58a6ff"),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  viewer.flyTo(marker, {
    duration: 1.8,
    offset: new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(28),
      Cesium.Math.toRadians(-32),
      180,
    ),
  });
}

function getFeatureCenter(feature: VboFeature): [number, number] {
  const geometry = feature.geometry;
  if (geometry.type === "Point") {
    return geometry.coordinates as [number, number];
  }

  if (geometry.type === "GeometryCollection") {
    const coords: [number, number][] = [];
    for (const child of geometry.geometries) {
      if ("coordinates" in child) {
        collectCoordinates(child.coordinates, coords);
      }
    }
    return averageCoordinates(coords);
  }

  const coords: [number, number][] = [];
  collectCoordinates(geometry.coordinates, coords);
  return averageCoordinates(coords);
}

function collectCoordinates(value: unknown, acc: [number, number][]) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    acc.push([value[0], value[1]]);
    return;
  }
  for (const item of value) {
    collectCoordinates(item, acc);
  }
}

function averageCoordinates(coords: [number, number][]): [number, number] {
  if (coords.length === 0) {
    return [5.3872, 52.1552];
  }

  const [sumLng, sumLat] = coords.reduce(
    ([lngAcc, latAcc], [lng, lat]) => [lngAcc + lng, latAcc + lat],
    [0, 0],
  );
  return [sumLng / coords.length, sumLat / coords.length];
}
