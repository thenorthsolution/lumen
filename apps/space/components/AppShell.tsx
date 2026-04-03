"use client";

import { useState, useCallback } from "react";
import { getDefaultGemeente } from "@lumen/pdok-client";
import type { Gemeente } from "@lumen/pdok-client";
import type { Feature, Geometry, FeatureCollection } from "geojson";
import type { LandOpportunityType } from "@/lib/land-fetch";
import { TopBar } from "./TopBar";
import { SidePanel } from "./SidePanel";
import { MapCanvas } from "./MapCanvas";
import { DetailPanel } from "./DetailPanel";
import { StatBar } from "./StatBar";
import styles from "./AppShell.module.css";

export interface LandProperties {
  identificatie: string;
  gebruiksdoel: string;
  oppervlakte: number;
  bouwjaar: number;
  opportunity_type: LandOpportunityType;
  opportunity_opp: number;
  opportunity_woningen: number;
  opportunity_rationale: string;
  bestemmingshoofdgroep: string;
}

export type LandFeature = Feature<Geometry, LandProperties>;
export type LandFeatureCollection = FeatureCollection<Geometry, LandProperties>;

export interface LandFilterState {
  oppervlakteMin: number;
  bouwjaarMax: number | null;
  types: LandOpportunityType[];
}

export interface LayerVisibility {
  infill: boolean;
  herbestemming: boolean;
  transformatie: boolean;
  bestemmingsplan: boolean;
}

const DEFAULT_FILTERS: LandFilterState = {
  oppervlakteMin: 200,
  bouwjaarMax: null,
  types: ["infill", "herbestemming", "transformatie"],
};

const DEFAULT_LAYERS: LayerVisibility = {
  infill: true,
  herbestemming: true,
  transformatie: true,
  bestemmingsplan: false,
};

export function AppShell() {
  const [gemeente, setGemeente] = useState<Gemeente>(getDefaultGemeente());
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [filters, setFilters] = useState<LandFilterState>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<LandFeature | null>(null);
  const [featureCollection, setFeatureCollection] =
    useState<LandFeatureCollection | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGemeenteChange = useCallback((code: string) => {
    const { getGemeente } =
      require("@lumen/pdok-client") as typeof import("@lumen/pdok-client");
    const g = getGemeente(code);
    if (g) {
      setGemeente(g);
      setSelected(null);
      setIsLoading(true);
    }
  }, []);

  return (
    <div className={styles.shell}>
      <TopBar
        gemeente={gemeente}
        onGemeenteChange={handleGemeenteChange}
        isLoading={isLoading}
        toolName="RUIMTEVINDEN"
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
          selectedId={selected?.properties?.identificatie ?? null}
          onFeatureSelect={setSelected}
          onDataLoaded={(fc) => {
            setFeatureCollection(fc);
            setIsLoading(false);
          }}
          onLoadStart={() => setIsLoading(true)}
        />
        {selected && (
          <DetailPanel feature={selected} onClose={() => setSelected(null)} />
        )}
      </div>
      <StatBar featureCollection={featureCollection} gemeente={gemeente} />
    </div>
  );
}
