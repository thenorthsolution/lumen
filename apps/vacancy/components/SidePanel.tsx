"use client";

import type {
  BasemapMode,
  LayerVisibility,
  FilterState,
  VboFeatureCollection,
} from "./AppShell";
import {
  ALL_PAND_STATUSES,
  ALL_VBO_STATUSES,
} from "@lumen/bag-utils";
import styles from "./SidePanel.module.css";

const GEBRUIKSDOEL_OPTIONS = [
  { value: "woonfunctie", label: "Woningen" },
  { value: "industriefunctie", label: "Industrie" },
  { value: "winkelfunctie", label: "Winkels" },
  { value: "bijeenkomstfunctie", label: "Bijeenkomst" },
  { value: "onderwijsfunctie", label: "Onderwijs" },
  { value: "celfunctie", label: "Cellen" },
  { value: "overige gebruiksfunctie", label: "Overige gebruiksf..." },
  { value: "logiesfunctie", label: "Logies" },
  { value: "kantoorfunctie", label: "Kantoren" },
  { value: "gezondheidszorgfunctie", label: "Gezondheidszorg" },
  { value: "sportfunctie", label: "Sport" },
];

const VBO_STATUS_OPTIONS = ALL_VBO_STATUSES.map((value) => ({
  value,
  label: shortStatusLabel(value),
}));

const PAND_STATUS_OPTIONS = ALL_PAND_STATUSES.map((value) => ({
  value,
  label: shortStatusLabel(value),
}));

const BASEMAP_OPTIONS: Array<{
  value: BasemapMode;
  label: string;
  badge: string;
  tone: "dataviz" | "brt" | "luchtfoto" | "hybrid";
}> = [
  { value: "dataviz", label: "Dataviz", badge: "2D", tone: "dataviz" },
  { value: "brt", label: "BRT", badge: "2D", tone: "brt" },
  { value: "luchtfoto", label: "Luchtfoto", badge: "3D", tone: "luchtfoto" },
  { value: "hybrid", label: "Hybrid", badge: "3D", tone: "hybrid" },
];

interface SidePanelProps {
  basemap: BasemapMode;
  onBasemapChange: (mode: BasemapMode) => void;
  layers: LayerVisibility;
  onLayersChange: (l: LayerVisibility) => void;
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  featureCollection: VboFeatureCollection | null;
}

export function SidePanel({
  basemap,
  onBasemapChange,
  layers,
  onLayersChange,
  filters,
  onFiltersChange,
  featureCollection,
}: SidePanelProps) {
  const features = featureCollection?.features ?? [];
  const candidateCount = features.filter(
    (feature) => feature.properties.mapCategory === "candidate",
  ).length;
  const statusCount = features.filter(
    (feature) => feature.properties.mapCategory === "status",
  ).length;
  const indexCount = features.filter(
    (feature) =>
      feature.properties.mapCategory === "woning" ||
      feature.properties.mapCategory === "other" ||
      !feature.properties.mapCategory,
  ).length;

  function toggleLayer(key: keyof LayerVisibility) {
    onLayersChange({ ...layers, [key]: !layers[key] });
  }

  function toggleGebruiksdoel(val: string) {
    const next = filters.gebruiksdoelen.includes(val)
      ? filters.gebruiksdoelen.filter((g) => g !== val)
      : [...filters.gebruiksdoelen, val];
    onFiltersChange({ ...filters, gebruiksdoelen: next });
  }

  function toggleStatus(key: "vboStatuses" | "pandStatuses", val: string) {
    const next = filters[key].includes(val)
      ? filters[key].filter((s) => s !== val)
      : [...filters[key], val];
    onFiltersChange({ ...filters, [key]: next });
  }

  return (
    <aside className={styles.panel}>
      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>Kaarten</h2>
        <div className={styles.mapGrid}>
          {BASEMAP_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`${styles.mapCard} ${styles[`mapCard_${opt.tone}`]} ${
                basemap === opt.value ? styles.mapCardActive : ""
              }`}
              onClick={() => onBasemapChange(opt.value)}
              aria-pressed={basemap === opt.value}
            >
              <span className={styles.mapCardPreview} aria-hidden />
              <span className={styles.mapCardLabel}>{opt.label}</span>
              <span className={styles.mapCardBadge}>{opt.badge}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Layer controls */}
      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>Lagen</h2>

        <LayerRow
          dot="hoog"
          label="Conversiekandidaten"
          count={candidateCount}
          active={layers.hoog}
          onToggle={() => toggleLayer("hoog")}
        />
        <LayerRow
          dot="middel"
          label="Statussignalen"
          count={statusCount}
          active={layers.middel}
          onToggle={() => toggleLayer("middel")}
        />
        <LayerRow
          dot="laag"
          label="Objectindex incl. woningen"
          count={indexCount}
          active={layers.laag}
          onToggle={() => toggleLayer("laag")}
        />
        <LayerRow
          dot="percelen"
          label="BAG perceelgrenzen"
          count={null}
          active={layers.percelen}
          onToggle={() => toggleLayer("percelen")}
        />
      </section>

      {/* Filters */}
      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>Filters</h2>

        <div className={styles.filterRow}>
          <div className={styles.filterHeader}>
            <span className={styles.filterLabel}>Bouwjaar min.</span>
            <span className={styles.filterValue}>{filters.bouwjaarMin}</span>
          </div>
          <input
            type="range"
            min={0}
            max={2010}
            step={10}
            value={filters.bouwjaarMin}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                bouwjaarMin: Number(e.target.value),
              })
            }
            aria-label="Minimum bouwjaar"
          />
          <div className={styles.rangeLabels}>
            <span>0</span>
            <span>2010</span>
          </div>
        </div>

        <div className={styles.filterRow}>
          <div className={styles.filterHeader}>
            <span className={styles.filterLabel}>Oppervlak min. (m²)</span>
            <span className={styles.filterValue}>{filters.oppervlakteMin}</span>
          </div>
          <input
            type="range"
            min={0}
            max={3000}
            step={100}
            value={filters.oppervlakteMin}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                oppervlakteMin: Number(e.target.value),
              })
            }
            aria-label="Minimum oppervlak"
          />
          <div className={styles.rangeLabels}>
            <span>0 m²</span>
            <span>3.000 m²</span>
          </div>
        </div>
      </section>

      {/* Objecttype filter */}
      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>Objecttype</h2>
        <div className={styles.chipWrap}>
          {GEBRUIKSDOEL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`${styles.chip} ${
                filters.gebruiksdoelen.includes(opt.value)
                  ? styles.chipActive
                  : ""
              }`}
              onClick={() => toggleGebruiksdoel(opt.value)}
              aria-pressed={filters.gebruiksdoelen.includes(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>VBO Status</h2>
        <div className={styles.chipWrap}>
          {VBO_STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`${styles.chip} ${
                filters.vboStatuses.includes(opt.value) ? styles.chipActive : ""
              }`}
              onClick={() => toggleStatus("vboStatuses", opt.value)}
              aria-pressed={filters.vboStatuses.includes(opt.value)}
              title={opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>Pand Status</h2>
        <div className={styles.chipWrap}>
          {PAND_STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`${styles.chip} ${
                filters.pandStatuses.includes(opt.value) ? styles.chipActive : ""
              }`}
              onClick={() => toggleStatus("pandStatuses", opt.value)}
              aria-pressed={filters.pandStatuses.includes(opt.value)}
              title={opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* Methodology note */}
      <div className={styles.methNote}>
        <span className={styles.methLabel}>Methode</span>
        <p className={styles.methText}>
          Scores zijn gebaseerd op BAG-proxysignalen. Niet alle gemarkeerde
          objecten zijn daadwerkelijk leeg. Verificatie ter plaatse altijd
          vereist.
        </p>
        <a
          href="https://github.com/thenorthsolution/lumen/blob/main/apps/vacancy/TOOL.md"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.methLink}
        >
          Lees volledige methodologie
        </a>
      </div>
    </aside>
  );
}

function shortStatusLabel(value: string): string {
  return value
    .replace(/^Verblijfsobject\s+/i, "")
    .replace(/^Pand\s+/i, "")
    .replace(/\s+\(niet ingemeten\)$/i, " (niet ingem.)");
}

interface LayerRowProps {
  dot: "hoog" | "middel" | "laag" | "percelen";
  label: string;
  count: number | null;
  active: boolean;
  onToggle: () => void;
}

function LayerRow({ dot, label, count, active, onToggle }: LayerRowProps) {
  return (
    <div className={styles.layerRow}>
      <span className={`${styles.dot} ${styles[`dot_${dot}`]}`} aria-hidden />
      <span className={styles.layerLabel}>{label}</span>
      {count !== null && (
        <span className={styles.layerCount}>
          {count.toLocaleString("nl-NL")}
        </span>
      )}
      <button
        role="switch"
        aria-checked={active}
        aria-label={`${label} ${active ? "verbergen" : "tonen"}`}
        className={`${styles.toggle} ${active ? styles.toggleOn : ""}`}
        onClick={onToggle}
      >
        <span className={styles.toggleThumb} />
      </button>
    </div>
  );
}
