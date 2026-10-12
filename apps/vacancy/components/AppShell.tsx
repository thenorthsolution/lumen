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
import ELIGIBLE_COUNTS from "@/data/eligible-counts.generated.json";
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

export type BasemapMode = "dataviz" | "brt" | "luchtfoto" | "hybrid";

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
  mapCategory: "candidate" | "status" | "woning" | "other";
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

export type VboFeature = Feature<Geometry, VboFeatureProperties>;
export type VboFeatureCollection = FeatureCollection<
  Geometry,
  VboFeatureProperties
>;

const DEFAULT_FILTERS: FilterState = {
  bouwjaarMin: 0,
  oppervlakteMin: 0,
  gebruiksdoelen: [
    "woonfunctie",
    "kantoorfunctie",
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

type DetailLoadState = {
  visible: boolean;
  step: number;
  total: number;
  status: string;
  tier: string;
};

export function AppShell() {
  const [gemeente, setGemeente] = useState(getDefaultGemeente());
  const [activeTab, setActiveTab] = useState<NavTab>("leegstand");
  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS);
  const [basemap, setBasemap] = useState<BasemapMode>("dataviz");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [view3DNonce, setView3DNonce] = useState(0);
  const [focusSelectedNonce, setFocusSelectedNonce] = useState(0);
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
  const [detailLoadState, setDetailLoadState] = useState<DetailLoadState>({
    visible: false,
    step: 0,
    total: 4,
    status: "",
    tier: "laag",
  });

  const handleFeatureSelect = useCallback((feature: VboFeature | null) => {
    setSelectedFeature(feature);
  }, []);

  const handleTableFeatureSelect = useCallback((feature: VboFeature) => {
    setSelectedFeature(feature);
    setActiveTab("leegstand");
    setFocusSelectedNonce((n) => n + 1);
    setView3DNonce((n) => n + 1);
  }, []);

  const handleGemeenteChange = useCallback((code: string) => {
    const g = getGemeente(code);
    if (g) {
      setGemeente(g);
      setSelectedFeature(null);
      setFeatureCollection(null);
      setIsLoading(false);
    }
  }, []);

  const handleDataLoaded = useCallback((fc: VboFeatureCollection) => {
    setFeatureCollection(fc);
    setIsLoading(false);
  }, []);

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
        isLoading={isLoading}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <div className={styles.body}>
        {activeTab === "overzicht" ? (
          <OverviewView
            gemeente={gemeente}
            featureCollection={featureCollection}
            onOpenLeegstand={() => setActiveTab("leegstand")}
            onOpenRuimte={() => setActiveTab("ruimte")}
            onOpenPijplijn={() => setActiveTab("pijplijn")}
          />
        ) : activeTab === "leegstand" ? (
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
              selectedFeature={selectedFeature}
              focusSelectedNonce={focusSelectedNonce}
              view3DNonce={view3DNonce}
              rotate3DCommand={rotate3DCommand}
              detailLoadState={detailLoadState}
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
        ) : activeTab === "ruimte" ? (
          <ModuleView
            title="Ruimte"
            subtitle="Onderbenutte grond, infill-locaties en transformatiezones voor woningbouw."
            gemeente={gemeente.name}
            primaryMetric="Publieke kanslaag"
            primaryValue="BAG + RO"
            confidence="Middel"
            source="BAG verblijfsobjecten, Ruimtelijkeplannen.nl en gemeentelijke begrenzing via PDOK."
            limitations={[
              "Nog geen juridische bouwclaim of eigendomssignaal.",
              "Bestemmingsplaninformatie vereist lokale verificatie.",
              "Woningschattingen blijven indicatief tot stedenbouwkundige toetsing.",
            ]}
            actions={[
              "Bekijk kleine infill-kavels met niet-residentieel gebruik.",
              "Scheid herbestemming van grotere transformatielocaties.",
              "Gebruik dit als agenda voor gebiedsgesprekken, niet als acquisitielijst.",
            ]}
          />
        ) : activeTab === "pijplijn" ? (
          <ModuleView
            title="Pijplijn"
            subtitle="Vergunningen, aanbestedingen, tenderactiviteit en uitvoeringsdruk."
            gemeente={gemeente.name}
            primaryMetric="Publieke pijplijn"
            primaryValue="TenderNed"
            confidence="Laag-middel"
            source="TenderNed-publicaties, officiële bekendmakingen en heuristieken per regio."
            limitations={[
              "TenderNed dekt publieke opdrachten, niet de volledige private markt.",
              "Publicaties lopen achter op feitelijke start bouw.",
              "Knelpuntsignalen zijn richtinggevend en vragen gesprek met lokale partijen.",
            ]}
            actions={[
              "Markeer waar kansrijke locaties geen uitvoeringscapaciteit lijken te hebben.",
              "Koppel vergunningactiviteit aan leegstand en ruimtepotentieel.",
              "Gebruik het overzicht voor overleg tussen gemeente, corporaties en uitvoerders.",
            ]}
          />
        ) : (
          <MethodologyView />
        )}
      </div>

      <StatBar featureCollection={featureCollection} gemeente={gemeente} />
    </div>
  );
}

function OverviewView({
  gemeente,
  featureCollection,
  onOpenLeegstand,
  onOpenRuimte,
  onOpenPijplijn,
}: {
  gemeente: ReturnType<typeof getDefaultGemeente>;
  featureCollection: VboFeatureCollection | null;
  onOpenLeegstand: () => void;
  onOpenRuimte: () => void;
  onOpenPijplijn: () => void;
}) {
  const features = featureCollection?.features ?? [];
  const candidateCount = features.filter(
    (feature) => feature.properties.mapCategory === "candidate",
  ).length;
  const statusCount = features.filter(
    (feature) => feature.properties.mapCategory === "status",
  ).length;
  const generatedTotal = getGeneratedEligibleCount(gemeente.code);
  const total = featureCollection?.features.length ?? generatedTotal;

  return (
    <main className={styles.overview}>
      <section className={styles.introPanel}>
        <div>
          <p className={styles.kicker}>Lumen municipality intelligence</p>
          <h1 className={styles.headline}>
            Verborgen wooncapaciteit voor {gemeente.name} zichtbaar maken.
          </h1>
          <p className={styles.lede}>
            Een publiek-belang dashboard voor gemeenten en semi-publieke
            woningpartners: leegstand, ruimte en pijplijnsignalen in een
            gedeelde werkomgeving.
          </p>
        </div>
        <div className={styles.boundaryBox}>
          <span className={styles.boundaryLabel}>Publieke grens</span>
          <p>
            Lumen verkoopt geen publieke woningsignalen achter een betaalmuur en
            bouwt geen functies voor buyer targeting, druk op bewoners of
            speculatieve leadgeneratie.
          </p>
        </div>
      </section>

      <section className={styles.metricGrid} aria-label="Gemeente samenvatting">
        <MetricCard label="Shortlist objecten" value={total ?? "Open kaart"} detail="BAG-proxy, geen bevestigde leegstand" />
        <MetricCard label="Conversiekandidaten" value={featureCollection ? candidateCount : "Na kaartload"} detail="Niet-woonfuncties met conversiewaarde" />
        <MetricCard label="Statussignalen" value={featureCollection ? statusCount : "Na kaartload"} detail="Buiten gebruik, sloop of ingetrokken" />
      </section>

      <section className={styles.moduleGrid} aria-label="Lumen modules">
        <ModuleCard
          title="Leegstand"
          description="Vind ondergebruikte gebouwen die mogelijk kunnen worden geconverteerd."
          source="BAG + vergunningcontext"
          confidence="Middel"
          action="Open kaart"
          onClick={onOpenLeegstand}
        />
        <ModuleCard
          title="Ruimte"
          description="Orden onderbenutte land- en sitelocaties op infill, herbestemming en transformatie."
          source="BAG + RO"
          confidence="Middel"
          action="Bekijk module"
          onClick={onOpenRuimte}
        />
        <ModuleCard
          title="Pijplijn"
          description="Maak zichtbaar waar publieke bouwactiviteit, vergunningen en capaciteit blokkeren."
          source="TenderNed + bekendmakingen"
          confidence="Laag-middel"
          action="Bekijk module"
          onClick={onOpenPijplijn}
        />
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail: string;
}) {
  const displayValue =
    typeof value === "number" ? value.toLocaleString("nl-NL") : value;

  return (
    <article className={styles.metricCard}>
      <span className={styles.metricLabel}>{label}</span>
      <strong className={styles.metricValue}>{displayValue}</strong>
      <span className={styles.metricDetail}>{detail}</span>
    </article>
  );
}

function ModuleCard({
  title,
  description,
  source,
  confidence,
  action,
  onClick,
}: {
  title: string;
  description: string;
  source: string;
  confidence: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <article className={styles.moduleCard}>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <dl className={styles.moduleMeta}>
        <div>
          <dt>Bron</dt>
          <dd>{source}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{confidence}</dd>
        </div>
      </dl>
      <button className={styles.moduleAction} onClick={onClick}>
        {action}
      </button>
    </article>
  );
}

function ModuleView({
  title,
  subtitle,
  gemeente,
  primaryMetric,
  primaryValue,
  confidence,
  source,
  limitations,
  actions,
}: {
  title: string;
  subtitle: string;
  gemeente: string;
  primaryMetric: string;
  primaryValue: string;
  confidence: string;
  source: string;
  limitations: string[];
  actions: string[];
}) {
  return (
    <main className={styles.moduleView}>
      <section className={styles.moduleHeader}>
        <div>
          <p className={styles.kicker}>Lumen {title.toLowerCase()}</p>
          <h1>{title} voor {gemeente}</h1>
          <p>{subtitle}</p>
        </div>
        <div className={styles.signalCard}>
          <span>{primaryMetric}</span>
          <strong>{primaryValue}</strong>
          <small>Confidence: {confidence}</small>
        </div>
      </section>

      <section className={styles.workGrid}>
        <article>
          <h2>Wat deze module moet opleveren</h2>
          <ul>
            {actions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </article>
        <article>
          <h2>Bron en beperkingen</h2>
          <p>{source}</p>
          <ul>
            {limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </article>
        <article className={styles.policyPanel}>
          <h2>Niet-extractieve randvoorwaarde</h2>
          <p>
            Deze module mag kansen zichtbaar maken voor publiek handelen, maar
            niet worden gebruikt als targeting-, acquisitie- of drukmiddel
            richting kopers, bewoners of kwetsbare groepen.
          </p>
        </article>
      </section>
    </main>
  );
}

function getGeneratedEligibleCount(code: string): number | null {
  const counts = ELIGIBLE_COUNTS.counts as Record<
    string,
    { eligibleCount?: number } | undefined
  >;
  return counts[code]?.eligibleCount ?? null;
}
