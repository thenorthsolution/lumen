"use client";

import { useState, useCallback, useEffect } from "react";
import { TopBar } from "./TopBar";
import type { NavTab } from "./TopBar";
import { SidePanel } from "./SidePanel";
import { MapCanvas } from "./MapCanvas";
import { DetailPanel } from "./DetailPanel";
import { StatBar } from "./StatBar";
import { ThreeDPanel } from "./ThreeDPanel";
import { TableView } from "./TableView";
import { MethodologyView } from "./MethodologyView";
import { getDefaultGemeente, getGemeente } from "@lumen/pdok-client";
import {
  DEFAULT_SHORTLIST_PAND_STATUSES,
  DEFAULT_SHORTLIST_VBO_STATUSES,
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
  openbareruimtenaam?: string;
  huisnummer?: string;
  huisletter?: string;
  huisnummertoevoeging?: string;
  postcode?: string;
  gebruiksdoel: string;
  oppervlakte: number;
  bouwjaar: number;
  woonplaatsnaam: string;
  score?: ViabilityScore;
}

export interface PermitNotice {
  id: string;
  title: string;
  type: string;
  creator: string;
  modified: string;
  url: string;
}

export interface AiSearchHit {
  id: string;
  vbo_identificatie: string;
  pand_identificatie: string;
  gemeente_code: string;
  gemeente_name: string;
  woonplaatsnaam: string;
  gebruiksdoel: string;
  status: string;
  pand_status: string;
  score_tier: string;
  bouwjaar: number;
  oppervlakte: number;
  lon: number;
  lat: number;
  similarity: number;
  lexical_rank: number;
  hybrid_score: number;
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
  vboStatuses: [...DEFAULT_SHORTLIST_VBO_STATUSES],
  pandStatuses: [...DEFAULT_SHORTLIST_PAND_STATUSES],
};

const DEFAULT_LAYERS: LayerVisibility = {
  hoog: true,
  middel: true,
  laag: true,
  percelen: true,
};

type DetailLoadState = {
  visible: boolean;
  step: number;
  total: number;
  status: string;
  tier: string;
};

type AiSearchState = {
  loading: boolean;
  query: string;
};

export function AppShell() {
  const [gemeente, setGemeente] = useState(getDefaultGemeente());
  const [activeTab, setActiveTab] = useState<NavTab>("kaart");
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [basemap, setBasemap] = useState<BasemapMode>("brt");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [view3DNonce, setView3DNonce] = useState(0);
  const [focusSelectedNonce, setFocusSelectedNonce] = useState(0);
  const [isAdvanced3DOpen, setIsAdvanced3DOpen] = useState(false);
  const [aiSearchResults, setAiSearchResults] = useState<AiSearchHit[]>([]);
  const [pendingAiSelectionId, setPendingAiSelectionId] = useState<
    string | null
  >(null);
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
  const [detailLoadState, setDetailLoadState] = useState<DetailLoadState>({
    visible: false,
    step: 0,
    total: 4,
    status: "",
    tier: "laag",
  });
  const [aiSearchState, setAiSearchState] = useState<AiSearchState>({
    loading: false,
    query: "",
  });

  const handleFeatureSelect = useCallback((feature: VboFeature | null) => {
    setSelectedFeature(feature);
    if (feature) {
      setAiSearchResults([]);
      setAiSearchState((current) => ({ ...current, loading: false }));
    }
  }, []);

  const handleTableFeatureSelect = useCallback((feature: VboFeature) => {
    setSelectedFeature(feature);
    setActiveTab("kaart");
    setFocusSelectedNonce((n) => n + 1);
    setView3DNonce((n) => n + 1);
  }, []);

  const handleAiSearchSelect = useCallback(
    (hit: AiSearchHit) => {
      const targetId = hit.vbo_identificatie || hit.id;
      setActiveTab("kaart");

      const localFeature =
        featureCollection?.features.find(
          (feature) => feature.properties.identificatie === targetId,
        ) ?? null;

      if (localFeature) {
        setSelectedFeature(localFeature);
        setAiSearchResults([]);
        setFocusSelectedNonce((n) => n + 1);
        return;
      }

      setSelectedFeature(aiHitToFeature(hit));
      setAiSearchResults([]);
      setFocusSelectedNonce((n) => n + 1);

      if (hit.gemeente_code && hit.gemeente_code !== gemeente.code) {
        const nextGemeente = getGemeente(hit.gemeente_code);
        if (nextGemeente) {
          setGemeente(nextGemeente);
          setIsLoading(true);
        }
      }

      setPendingAiSelectionId(targetId);
    },
    [featureCollection, gemeente.code],
  );

  const handleGemeenteChange = useCallback((code: string) => {
    const g = getGemeente(code);
    if (g) {
      setGemeente(g);
      setSelectedFeature(null);
      setIsLoading(true);
    }
  }, []);

  const handleDataLoaded = useCallback((fc: VboFeatureCollection) => {
    setFeatureCollection(fc);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!pendingAiSelectionId || !featureCollection) return;

    const matchedFeature = featureCollection.features.find(
      (feature) => feature.properties.identificatie === pendingAiSelectionId,
    );
    if (!matchedFeature) return;

    setSelectedFeature(matchedFeature);
    setFocusSelectedNonce((n) => n + 1);
    setPendingAiSelectionId(null);
  }, [featureCollection, pendingAiSelectionId]);

  useEffect(() => {
    if (!selectedFeature) {
      setDetailLoadState((current) => ({ ...current, visible: false }));
      return;
    }

    setDetailLoadState({
      visible: true,
      step: 2,
      total: 4,
      status: "Zijpaneel openen",
      tier: selectedFeature.properties.score?.tier ?? "laag",
    });
  }, [selectedFeature]);

  const handleDetailLoadStart = useCallback(() => {
    setDetailLoadState((current) => ({
      ...current,
      visible: true,
      step: 3,
      total: 4,
      status: "Vergunningen en context laden",
    }));
  }, []);

  const handleDetailLoadDone = useCallback((status: string) => {
    setDetailLoadState((current) => ({
      ...current,
      visible: true,
      step: 4,
      total: 4,
      status,
    }));

    window.setTimeout(() => {
      setDetailLoadState((current) => ({ ...current, visible: false }));
    }, 1400);
  }, []);

  return (
    <div className={styles.shell}>
      <TopBar
        gemeente={gemeente}
        onGemeenteChange={handleGemeenteChange}
        onAiSearchSelect={handleAiSearchSelect}
        onAiSearchResults={setAiSearchResults}
        onAiSearchStateChange={setAiSearchState}
        isLoading={isLoading}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <div className={styles.body}>
        {activeTab === "kaart" ? (
          <>
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
              isLoading={isLoading}
              aiSearchResults={aiSearchResults}
              selectedFeature={selectedFeature}
              focusSelectedNonce={focusSelectedNonce}
              view3DNonce={view3DNonce}
              rotate3DCommand={rotate3DCommand}
              detailLoadState={detailLoadState}
              aiSearchState={aiSearchState}
              onFeatureSelect={handleFeatureSelect}
              onDataLoaded={handleDataLoaded}
              onLoadStart={() => setIsLoading(true)}
              selectedFeatureId={selectedFeature?.properties?.identificatie ?? null}
            />

            {selectedFeature && (
              <DetailPanel
                feature={selectedFeature}
                gemeente={gemeente}
                onViewIn3D={() => setView3DNonce((n) => n + 1)}
                onLoadStart={handleDetailLoadStart}
                onLoadDone={handleDetailLoadDone}
                onClose={() => setSelectedFeature(null)}
              />
            )}

            {selectedFeature && isAdvanced3DOpen && (
              <ThreeDPanel
                feature={selectedFeature}
                onClose={() => setIsAdvanced3DOpen(false)}
              />
            )}
          </>
        ) : activeTab === "tabel" ? (
          <TableView
            gemeente={gemeente}
            featureCollection={featureCollection}
            onSelectFeature={handleTableFeatureSelect}
          />
        ) : (
          <MethodologyView />
        )}
      </div>

      <StatBar featureCollection={featureCollection} gemeente={gemeente} />
    </div>
  );
}

function aiHitToFeature(hit: AiSearchHit): VboFeature {
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [hit.lon, hit.lat],
    },
    properties: {
      identificatie: hit.vbo_identificatie || hit.id,
      status: hit.status || "",
      pandStatus: hit.pand_status || "",
      pandIdentificatie: hit.pand_identificatie || "",
      openbareruimtenaam: "",
      huisnummer: "",
      huisletter: "",
      huisnummertoevoeging: "",
      postcode: "",
      gebruiksdoel: hit.gebruiksdoel || "",
      oppervlakte: Number(hit.oppervlakte || 0),
      bouwjaar: Number(hit.bouwjaar || 0),
      woonplaatsnaam: hit.woonplaatsnaam || hit.gemeente_name || "",
    },
  };
}
