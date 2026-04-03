"use client";

import { useState, useCallback } from "react";
import { TopBar } from "./TopBar";
import { SidePanel } from "./SidePanel";
import { MapCanvas } from "./MapCanvas";
import { DetailPanel } from "./DetailPanel";
import { StatBar } from "./StatBar";
import { getDefaultGemeente } from "@lumen/pdok-client";
import type { ViabilityScore } from "@lumen/bag-utils";
import type { FeatureCollection, Feature, Geometry } from "geojson";

import styles from "./AppShell.module.css";

export type LayerVisibility = {
  hoog: boolean;
  middel: boolean;
  laag: boolean;
  percelen: boolean;
};

export type FilterState = {
  bouwjaarMin: number;
  oppervlakteMin: number;
  gebruiksdoelen: string[];
};

export interface VboFeatureProperties {
  identificatie: string;
  status: string;
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
  bouwjaarMin: 1990,
  oppervlakteMin: 500,
  gebruiksdoelen: ["kantoorfunctie", "winkelfunctie"],
};

const DEFAULT_LAYERS: LayerVisibility = {
  hoog: true,
  middel: true,
  laag: false,
  percelen: true,
};

export function AppShell() {
  const [gemeente, setGemeente] = useState(getDefaultGemeente());
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
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
          layers={layers}
          onLayersChange={setLayers}
          filters={filters}
          onFiltersChange={setFilters}
          featureCollection={featureCollection}
        />

        <MapCanvas
          gemeente={gemeente}
          layers={layers}
          filters={filters}
          onFeatureSelect={handleFeatureSelect}
          onDataLoaded={handleDataLoaded}
          onLoadStart={() => setIsLoading(true)}
          selectedFeatureId={selectedFeature?.properties?.identificatie ?? null}
        />

        {selectedFeature && (
          <DetailPanel
            feature={selectedFeature}
            onClose={() => setSelectedFeature(null)}
          />
        )}
      </div>

      <StatBar featureCollection={featureCollection} gemeente={gemeente} />
    </div>
  );
}
