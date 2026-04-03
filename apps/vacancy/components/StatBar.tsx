"use client";

import type { VboFeatureCollection } from "./AppShell";
import type { Gemeente } from "@lumen/pdok-client";
import { countByTier } from "@lumen/bag-utils";
import { estimateWoningen } from "@/lib/bag-fetch";
import styles from "./StatBar.module.css";

interface StatBarProps {
  featureCollection: VboFeatureCollection | null;
  gemeente: Gemeente;
}

export function StatBar({ featureCollection, gemeente }: StatBarProps) {
  const features = featureCollection?.features ?? [];
  const scores = features
    .map((f) => f.properties?.score)
    .filter(Boolean) as Parameters<typeof countByTier>[0];
  const counts = countByTier(scores);

  const totalOppervlakte = features.reduce(
    (sum, f) => sum + (f.properties?.oppervlakte ?? 0),
    0,
  );

  const hoogOppervlakte = features
    .filter((f) => f.properties?.score?.tier === "hoog")
    .reduce((sum, f) => sum + (f.properties?.oppervlakte ?? 0), 0);

  const est = estimateWoningen(hoogOppervlakte);
  const today = new Date().toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div className={styles.bar}>
      <StatItem
        value={counts.hoog.toLocaleString("nl-NL")}
        label="Hoog potentieel"
        color="var(--color-hoog)"
      />
      <div className={styles.divider} />
      <StatItem
        value={counts.middel.toLocaleString("nl-NL")}
        label="Middel potentieel"
        color="var(--color-middel)"
      />
      <div className={styles.divider} />
      <StatItem
        value={`${Math.round(hoogOppervlakte / 1000).toLocaleString("nl-NL")}k m²`}
        label="Hoog pot. oppervlak"
      />
      <div className={styles.divider} />
      <StatItem
        value={`est. ${est.min.toLocaleString("nl-NL")}–${est.max.toLocaleString("nl-NL")}`}
        label="Woningen (indicatief)"
      />
      <div className={styles.spacer} />
      <div className={styles.meta}>
        <span className={styles.metaVal}>BAG snapshot {today}</span>
        <span className={styles.metaLabel}>Databron · {gemeente.name}</span>
      </div>
    </div>
  );
}

function StatItem({
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
