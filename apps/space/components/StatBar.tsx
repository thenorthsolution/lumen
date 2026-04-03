"use client";

import type { LandFeatureCollection } from "./AppShell";
import type { Gemeente } from "@lumen/pdok-client";
import { totalEstimatedWoningen } from "@/lib/land-fetch";
import styles from "./StatBar.module.css";

interface StatBarProps {
  featureCollection: LandFeatureCollection | null;
  gemeente: Gemeente;
}

export function StatBar({ featureCollection, gemeente }: StatBarProps) {
  const features = featureCollection?.features ?? [];
  const counts = {
    infill: features.filter((f) => f.properties?.opportunity_type === "infill")
      .length,
    herbestemming: features.filter(
      (f) => f.properties?.opportunity_type === "herbestemming",
    ).length,
    transformatie: features.filter(
      (f) => f.properties?.opportunity_type === "transformatie",
    ).length,
  };
  const totalOpp = features.reduce(
    (s, f) => s + (f.properties?.opportunity_opp ?? 0),
    0,
  );
  const totalWon = featureCollection
    ? totalEstimatedWoningen(featureCollection)
    : 0;

  return (
    <div className={styles.bar}>
      <Stat
        value={counts.infill.toLocaleString("nl-NL")}
        label="Inbreiding"
        color="var(--color-infill)"
      />
      <div className={styles.div} />
      <Stat
        value={counts.herbestemming.toLocaleString("nl-NL")}
        label="Herbestemming"
        color="var(--color-herbestemming)"
      />
      <div className={styles.div} />
      <Stat
        value={counts.transformatie.toLocaleString("nl-NL")}
        label="Transformatie"
        color="var(--color-transformatie)"
      />
      <div className={styles.div} />
      <Stat
        value={`${Math.round(totalOpp / 1000).toLocaleString("nl-NL")}k m²`}
        label="Totaal oppervlak"
      />
      <div className={styles.div} />
      <Stat
        value={`est. ${totalWon.toLocaleString("nl-NL")}`}
        label="Woningen (indicatief)"
        color="var(--accent)"
      />
      <div className={styles.spacer} />
      <div className={styles.meta}>
        <span className={styles.metaVal}>
          BAG + RO · {new Date().toLocaleDateString("nl-NL")}
        </span>
        <span className={styles.metaLabel}>{gemeente.name}</span>
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color?: string;
}) {
  return (
    <div className={styles.item}>
      <span
        className={styles.value}
        style={{ color: color ?? "var(--text-primary)" }}
      >
        {value}
      </span>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
