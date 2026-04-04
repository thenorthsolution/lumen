"use client";

import { useState, useCallback } from "react";
import { TopBar } from "./TopBar";
import { SidePanel } from "./SidePanel";
import { MapCanvas } from "./MapCanvas";
import { DetailPanel } from "./DetailPanel";
import { StatBar } from "./StatBar";
import { ThreeDPanel } from "./ThreeDPanel";
import { getDefaultGemeente } from "@lumen/pdok-client";
import {
  ALL_PAND_STATUSES,
  ALL_VBO_STATUSES,
  type ViabilityScore,
} from "@lumen/bag-utils";
import type { FeatureCollection, Feature, Geometry } from "geojson";

import styles from "./AppShell.module.css";

export type LayerVisibility = {
  hoog: boolean;
  middel: boolean;
  laag: boolean;
  percelen: boolean;
};

export type BasemapMode = "brt" | "luchtfoto" | "hybrid";

export type FilterState = {
  bouwjaarMin: number;
  oppervlakteMin: number;
  gebruiksdoelen: string[];
  vboStatuses: string[];
  pandStatuses: string[];
};

export interface VboFeatureProperties {
  identificatie: string;
  status: string;
  pandStatus?: string;
  pandIdentificatie?: string;
  bagUri?: string;
  gebruiksdoel: string;
  oppervlakte: number;
  bouwjaar: number;
  woonplaatsnaam: string;
  score?: ViabilityScore;
}

export type VboFeature = Feature<Geometry, VboFeatureProperties>;
export type VboFeatureCollection = FeatureCollection<
  Geometry,
  VboFeatureProperties
>;

const DEFAULT_FILTERS: FilterState = {
  bouwjaarMin: 0,
  oppervlakteMin: 0,
  gebruiksdoelen: [
    "kantoorfunctie",
    "winkelfunctie",
    "bijeenkomstfunctie",
    "onderwijsfunctie",
    "industriefunctie",
  ],
  vboStatuses: [...ALL_VBO_STATUSES],
  pandStatuses: [...ALL_PAND_STATUSES],
};

const DEFAULT_LAYERS: LayerVisibility = {
  hoog: true,
  middel: true,
  laag: true,
  percelen: true,
};

export function AppShell() {
  const [gemeente, setGemeente] = useState(getDefaultGemeente());
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [basemap, setBasemap] = useState<BasemapMode>("brt");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [view3DNonce, setView3DNonce] = useState(0);
  const [isAdvanced3DOpen, setIsAdvanced3DOpen] = useState(false);
  const [rotate3DCommand, setRotate3DCommand] = useState<{
    nonce: number;
    delta: number;
    reset?: boolean;
  }>({ nonce: 0, delta: 0 });
  const [selectedFeature, setSelectedFeature] = useState<VboFeature | null>(
    null,
  );
  const [featureCollection, setFeatureCollection] =
    useState<VboFeatureCollection | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFeatureSelect = useCallback((feature: VboFeature | null) => {
    setSelectedFeature(feature);
  }, []);

  const handleDataLoaded = useCallback((fc: VboFeatureCollection) => {
    setFeatureCollection(fc);
    setIsLoading(false);
  }, []);

  const handleGemeenteChange = useCallback((code: string) => {
    const { getGemeente } =
      require("@lumen/pdok-client") as typeof import("@lumen/pdok-client");
    const g = getGemeente(code);
    if (g) {
      setGemeente(g);
      setSelectedFeature(null);
      setIsLoading(true);
    }
  }, []);

  return (
    <div className={styles.shell}>
      <TopBar
        gemeente={gemeente}
        onGemeenteChange={handleGemeenteChange}
        isLoading={isLoading}
      />

      <div className={styles.body}>
        <SidePanel
          basemap={basemap}
          onBasemapChange={setBasemap}
          layers={layers}
          onLayersChange={setLayers}
          filters={filters}
          onFiltersChange={setFilters}
          featureCollection={featureCollection}
        />

        <MapCanvas
          gemeente={gemeente}
          basemap={basemap}
          layers={layers}
          filters={filters}
          selectedFeature={selectedFeature}
          view3DNonce={view3DNonce}
          rotate3DCommand={rotate3DCommand}
          onFeatureSelect={handleFeatureSelect}
          onDataLoaded={handleDataLoaded}
          onLoadStart={() => setIsLoading(true)}
          selectedFeatureId={selectedFeature?.properties?.identificatie ?? null}
        />

        {selectedFeature && (
          <DetailPanel
            feature={selectedFeature}
            onViewIn3D={() => setView3DNonce((n) => n + 1)}
            onOpenAdvanced3D={() => setIsAdvanced3DOpen(true)}
            onRotateLeft={() =>
              setRotate3DCommand((prev) => ({
                nonce: prev.nonce + 1,
                delta: 25,
              }))
            }
            onRotateRight={() =>
              setRotate3DCommand((prev) => ({
                nonce: prev.nonce + 1,
                delta: -25,
              }))
            }
            onReset3D={() =>
              setRotate3DCommand((prev) => ({
                nonce: prev.nonce + 1,
                delta: 0,
                reset: true,
              }))
            }
            onClose={() => setSelectedFeature(null)}
          />
        )}

        {selectedFeature && isAdvanced3DOpen && (
          <ThreeDPanel
            feature={selectedFeature}
            onClose={() => setIsAdvanced3DOpen(false)}
          />
        )}
      </div>

      <StatBar featureCollection={featureCollection} gemeente={gemeente} />
    </div>
  );
}
