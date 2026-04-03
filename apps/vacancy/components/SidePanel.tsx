"use client";

import type {
  LayerVisibility,
  FilterState,
  VboFeatureCollection,
} from "./AppShell";
import { countByTier } from "@lumen/bag-utils";
import styles from "./SidePanel.module.css";

const GEBRUIKSDOEL_OPTIONS = [
  { value: "kantoorfunctie", label: "Kantoor" },
  { value: "winkelfunctie", label: "Winkel" },
  { value: "bijeenkomstfunctie", label: "Bijeenkomst" },
  { value: "onderwijsfunctie", label: "Onderwijs" },
  { value: "industriefunctie", label: "Industrie" },
];

interface SidePanelProps {
  layers: LayerVisibility;
  onLayersChange: (l: LayerVisibility) => void;
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  featureCollection: VboFeatureCollection | null;
}

export function SidePanel({
  layers,
  onLayersChange,
  filters,
  onFiltersChange,
  featureCollection,
}: SidePanelProps) {
  const scores =
    featureCollection?.features
      .map((f) => f.properties?.score)
      .filter(Boolean) ?? [];

  const counts =
    scores.length > 0
      ? countByTier(scores as Parameters<typeof countByTier>[0])
      : { hoog: 0, middel: 0, laag: 0, uitgesloten: 0 };

  function toggleLayer(key: keyof LayerVisibility) {
    onLayersChange({ ...layers, [key]: !layers[key] });
  }

  function toggleGebruiksdoel(val: string) {
    const next = filters.gebruiksdoelen.includes(val)
      ? filters.gebruiksdoelen.filter((g) => g !== val)
      : [...filters.gebruiksdoelen, val];
    onFiltersChange({ ...filters, gebruiksdoelen: next });
  }

  return (
    <aside className={styles.panel}>
      {/* Layer controls */}
      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>Lagen</h2>

        <LayerRow
          dot="hoog"
          label="Hoog potentieel"
          count={counts.hoog}
          active={layers.hoog}
          onToggle={() => toggleLayer("hoog")}
        />
        <LayerRow
          dot="middel"
          label="Middel potentieel"
          count={counts.middel}
          active={layers.middel}
          onToggle={() => toggleLayer("middel")}
        />
        <LayerRow
          dot="laag"
          label="Laag / uitgesloten"
          count={counts.laag + counts.uitgesloten}
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
            min={1960}
            max={2010}
            step={5}
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
            <span>1960</span>
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
            min={100}
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
            <span>100 m²</span>
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

      {/* Methodology note */}
      <div className={styles.methNote}>
        <span className={styles.methLabel}>Methode</span>
        <p className={styles.methText}>
          Scores zijn gebaseerd op BAG-proxysignalen. Niet alle gemarkeerde
          objecten zijn daadwerkelijk leeg. Verificatie ter plaatse altijd
          vereist.
        </p>
        <a
          href="https://github.com/thenorthsolution/lumen/blob/main/apps/leegstandsradar/TOOL.md"
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
