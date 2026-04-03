"use client";

import type {
  LayerVisibility,
  LandFilterState,
  LandFeatureCollection,
} from "./AppShell";
import styles from "./SidePanel.module.css";

interface SidePanelProps {
  layers: LayerVisibility;
  onLayersChange: (l: LayerVisibility) => void;
  filters: LandFilterState;
  onFiltersChange: (f: LandFilterState) => void;
  featureCollection: LandFeatureCollection | null;
}

export function SidePanel({
  layers,
  onLayersChange,
  filters,
  onFiltersChange,
  featureCollection,
}: SidePanelProps) {
  const counts = {
    infill:
      featureCollection?.features.filter(
        (f) => f.properties?.opportunity_type === "infill",
      ).length ?? 0,
    herbestemming:
      featureCollection?.features.filter(
        (f) => f.properties?.opportunity_type === "herbestemming",
      ).length ?? 0,
    transformatie:
      featureCollection?.features.filter(
        (f) => f.properties?.opportunity_type === "transformatie",
      ).length ?? 0,
  };

  function toggleLayer(k: keyof LayerVisibility) {
    onLayersChange({ ...layers, [k]: !layers[k] });
  }
  function toggleType(t: "infill" | "herbestemming" | "transformatie") {
    const next = filters.types.includes(t)
      ? filters.types.filter((x) => x !== t)
      : [...filters.types, t];
    onFiltersChange({ ...filters, types: next });
  }

  return (
    <aside className={styles.panel}>
      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>Lagen</h2>
        <LayerRow
          dot="infill"
          label="Inbreiding"
          count={counts.infill}
          active={layers.infill}
          onToggle={() => toggleLayer("infill")}
        />
        <LayerRow
          dot="herbestemming"
          label="Herbestemming"
          count={counts.herbestemming}
          active={layers.herbestemming}
          onToggle={() => toggleLayer("herbestemming")}
        />
        <LayerRow
          dot="transformatie"
          label="Transformatie"
          count={counts.transformatie}
          active={layers.transformatie}
          onToggle={() => toggleLayer("transformatie")}
        />
        <LayerRow
          dot="bestemmingsplan"
          label="Bestemmingsplan"
          count={null}
          active={layers.bestemmingsplan}
          onToggle={() => toggleLayer("bestemmingsplan")}
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>Filters</h2>
        <div className={styles.filterRow}>
          <div className={styles.filterHeader}>
            <span className={styles.filterLabel}>Min. oppervlak (m²)</span>
            <span className={styles.filterValue}>{filters.oppervlakteMin}</span>
          </div>
          <input
            type="range"
            min={100}
            max={2000}
            step={100}
            value={filters.oppervlakteMin}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                oppervlakteMin: Number(e.target.value),
              })
            }
          />
          <div className={styles.rangeLabels}>
            <span>100</span>
            <span>2.000 m²</span>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>Kanstype</h2>
        <div className={styles.chipWrap}>
          {(["infill", "herbestemming", "transformatie"] as const).map((t) => (
            <button
              key={t}
              className={`${styles.chip} ${filters.types.includes(t) ? styles.chipActive : ""}`}
              onClick={() => toggleType(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <div className={styles.methNote}>
        <span className={styles.methLabel}>Methode</span>
        <p className={styles.methText}>
          Locaties zijn gebaseerd op BAG-gebruiksdoelen en bestemmingsplandata.
          Geen vervanging voor een planologisch onderzoek.
        </p>
        <a
          href="https://github.com/thenorthsolution/lumen/blob/main/apps/space/TOOL.md"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.methLink}
        >
          Lees methodologie
        </a>
      </div>
    </aside>
  );
}

function LayerRow({
  dot,
  label,
  count,
  active,
  onToggle,
}: {
  dot: string;
  label: string;
  count: number | null;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={styles.layerRow}>
      <span className={`${styles.dot} ${styles[`dot_${dot}`]}`} />
      <span className={styles.layerLabel}>{label}</span>
      {count !== null && (
        <span className={styles.layerCount}>
          {count.toLocaleString("nl-NL")}
        </span>
      )}
      <button
        role="switch"
        aria-checked={active}
        aria-label={label}
        className={`${styles.toggle} ${active ? styles.toggleOn : ""}`}
        onClick={onToggle}
      >
        <span className={styles.toggleThumb} />
      </button>
    </div>
  );
}
