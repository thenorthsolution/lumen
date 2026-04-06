"use client";

import type { Gemeente } from "@lumen/pdok-client";
import type { VboFeature, VboFeatureCollection } from "./AppShell";
import styles from "./TableView.module.css";

interface TableViewProps {
  gemeente: Gemeente;
  featureCollection: VboFeatureCollection | null;
  onSelectFeature: (feature: VboFeature) => void;
}

export function TableView({
  gemeente,
  featureCollection,
  onSelectFeature,
}: TableViewProps) {
  const rows = [...(featureCollection?.features ?? [])].sort((a, b) => {
    const aScore = a.properties?.score?.totalPoints ?? -999;
    const bScore = b.properties?.score?.totalPoints ?? -999;
    if (aScore !== bScore) return bScore - aScore;
    return (b.properties?.oppervlakte ?? 0) - (a.properties?.oppervlakte ?? 0);
  });

  return (
    <section className={styles.shell}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Tabel</span>
          <h1 className={styles.title}>Shortlist voor {gemeente.name}</h1>
          <p className={styles.subtitle}>
            Dit is dezelfde shortlist als op de kaart, maar dan als sorteerbare
            leesweergave voor snelle triage.
          </p>
        </div>
        <div className={styles.meta}>
          {rows.length.toLocaleString("nl-NL")} objecten
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Potentie</th>
              <th>ID</th>
              <th>Woonplaats</th>
              <th>Gebruiksdoel</th>
              <th>Status</th>
              <th>Pandstatus</th>
              <th>Bouwjaar</th>
              <th>Oppervlakte</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((feature) => (
              <tr
                key={feature.properties.identificatie}
                className={styles.row}
                onClick={() => onSelectFeature(feature)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectFeature(feature);
                  }
                }}
              >
                <td>
                  <span
                    className={`${styles.badge} ${
                      styles[`badge_${feature.properties.score?.tier ?? "laag"}`]
                    }`}
                  >
                    {feature.properties.score?.tier ?? "laag"}
                  </span>
                </td>
                <td className={styles.mono}>{feature.properties.identificatie}</td>
                <td>{feature.properties.woonplaatsnaam || "—"}</td>
                <td>{feature.properties.gebruiksdoel || "—"}</td>
                <td>{feature.properties.status || "—"}</td>
                <td>{feature.properties.pandStatus || "—"}</td>
                <td>{feature.properties.bouwjaar || "—"}</td>
                <td>
                  {feature.properties.oppervlakte
                    ? `${feature.properties.oppervlakte.toLocaleString("nl-NL")} m²`
                    : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className={styles.empty}>
                  Geen shortlistresultaten voor de huidige filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
