"use client";

import type { LandFeature } from "./AppShell";
import styles from "./DetailPanel.module.css";

const TYPE_CONFIG = {
  infill: { label: "Inbreiding", color: "var(--color-infill)", bg: "var(--color-infill-bg)" },
  herbestemming: { label: "Herbestemming", color: "var(--color-herbestemming)", bg: "var(--color-herbestemming-bg)" },
  transformatie: { label: "Transformatie", color: "var(--color-transformatie)", bg: "var(--color-transformatie-bg)" },
};

interface DetailPanelProps { feature: LandFeature; onClose: () => void; }

export function DetailPanel({ feature, onClose }: DetailPanelProps) {
  const p = feature.properties;
  const cfg = TYPE_CONFIG[p.opportunity_type] ?? TYPE_CONFIG.transformatie;

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerMeta}>
          <span className={styles.headerTitle}>{p.identificatie.slice(-8)}</span>
          <span className={styles.headerSub}>{p.gebruiksdoel}</span>
        </div>
        <span className={styles.badge} style={{ color: cfg.color, background: cfg.bg }}>
          {cfg.label}
        </span>
        <button className={styles.close} onClick={onClose} aria-label="Sluiten">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <div className={styles.rows}>
        <Row label="BAG id" value={p.identificatie} mono />
        <Row label="Gebruiksdoel" value={p.gebruiksdoel} />
        <Row label="Oppervlak" value={`${p.oppervlakte.toLocaleString("nl-NL")} m²`} />
        <Row label="Bouwjaar" value={String(p.bouwjaar || "—")} />
        <Row label="Bestemming" value={p.bestemmingshoofdgroep || "—"} />
        <Row label="Est. woningen" value={`${p.opportunity_woningen.toLocaleString("nl-NL")}`} highlight />
      </div>

      <div className={styles.rationale}>
        <span className={styles.rationaleLabel}>Toelichting</span>
        <p className={styles.rationaleText}>{p.opportunity_rationale}</p>
      </div>

      <div className={styles.cta}>
        <a
          href={`https://www.ruimtelijkeplannen.nl/viewer/viewer?planidn=${encodeURIComponent(p.bestemmingshoofdgroep)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.ctaLink}
        >
          Bekijk bestemmingsplan
        </a>
      </div>
    </aside>
  );
}

function Row({ label, value, mono = false, highlight = false }: {
  label: string; value: string; mono?: boolean; highlight?: boolean;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.rowKey}>{label}</span>
      <span className={styles.rowVal} style={{
        fontFamily: mono ? "var(--font-mono)" : undefined,
        fontSize: mono ? "10px" : undefined,
        color: highlight ? "var(--accent)" : undefined,
      }}>{value}</span>
    </div>
  );
}
