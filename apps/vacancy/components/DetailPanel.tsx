"use client";

import { useState } from "react";
import type { VboFeature } from "./AppShell";
import type { ViabilityTier } from "@lumen/bag-utils";
import styles from "./DetailPanel.module.css";

interface DetailPanelProps {
  feature: VboFeature;
  onViewIn3D: () => void;
  onOpenAdvanced3D: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onReset3D: () => void;
  onClose: () => void;
}

export function DetailPanel({
  feature,
  onViewIn3D,
  onOpenAdvanced3D,
  onRotateLeft,
  onRotateRight,
  onReset3D,
  onClose,
}: DetailPanelProps) {
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagNote, setFlagNote] = useState("");
  const [flagSent, setFlagSent] = useState(false);

  const { properties: props } = feature;
  const score = props?.score;
  const tier = score?.tier ?? "laag";
  const showThreeDAction = tier === "hoog" || tier === "middel";
  const bagViewerUrl = props?.identificatie
    ? `https://bagviewer.kadaster.nl/lvbag/bag-viewer/?objectId=${props.identificatie}`
    : null;

  function handleFlag(e: React.FormEvent) {
    e.preventDefault();
    // In production: POST to Supabase flags table
    // For now: log and show confirmation
    console.info("Data correction submitted:", {
      identificatie: props?.identificatie,
      note: flagNote,
      timestamp: new Date().toISOString(),
    });
    setFlagSent(true);
    setFlagNote("");
  }

  return (
    <aside className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerMeta}>
          <span className={styles.headerTitle}>
            {props?.woonplaatsnaam || "Object"}{" "}
            {props?.identificatie?.slice(-6)}
          </span>
          <span className={styles.headerSub}>
            {formatGebruiksdoel(props?.gebruiksdoel ?? "")}
          </span>
        </div>
        <TierBadge tier={tier} />
        <button
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Sluit detailpaneel"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden
          >
            <path
              d="M1 1L11 11M11 1L1 11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Data rows */}
      <div className={styles.rows}>
        <DataRow
          label="BAG identificatie"
          value={props?.identificatie ?? "—"}
          mono
        />
        <DataRow label="Status" value={props?.status ?? "—"} highlight />
        <DataRow
          label="Gebruiksdoel"
          value={formatGebruiksdoel(props?.gebruiksdoel ?? "")}
        />
        <DataRow label="Pandstatus" value={props?.pandStatus ?? "—"} />
        <DataRow label="Bouwjaar" value={String(props?.bouwjaar ?? "—")} />
        <DataRow
          label="Vloeroppervlak"
          value={
            props?.oppervlakte
              ? `${props.oppervlakte.toLocaleString("nl-NL")} m²`
              : "—"
          }
        />
      </div>

      <div className={styles.actionsSection}>
        <div className={styles.actionsHeader}>
          <span className={styles.actionsLabel}>Verdiepen</span>
        </div>
        <div className={styles.actionGrid}>
          {bagViewerUrl && (
            <a
              href={bagViewerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.actionBtn}
            >
              Bekijk in BAG Viewer
            </a>
          )}
          {showThreeDAction && (
            <>
              <button
                type="button"
                onClick={onViewIn3D}
                className={styles.actionBtn}
              >
                Kaart 3D
              </button>
              <button
                type="button"
                onClick={onOpenAdvanced3D}
                className={styles.actionBtn}
              >
                Open 3D model
              </button>
              <div className={styles.rotateRow}>
                <button
                  type="button"
                  onClick={onRotateLeft}
                  className={styles.actionBtnGhost}
                >
                  Draai links
                </button>
                <button
                  type="button"
                  onClick={onReset3D}
                  className={styles.actionBtnGhost}
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={onRotateRight}
                  className={styles.actionBtnGhost}
                >
                  Draai rechts
                </button>
              </div>
            </>
          )}
          {props?.bagUri && (
            <a
              href={props.bagUri}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.actionBtnGhost}
            >
              Open bronrecord
            </a>
          )}
        </div>
        {(showThreeDAction || props?.bagUri) && (
          <p className={styles.actionsNote}>
            BAG Viewer opent direct het object. `Kaart 3D` zet de kaart in een
            schuine 3D-weergave. `Open 3D model` opent een zwaardere viewer met
            echte 3D gebouwgeometrie. Draai de kaart daarna met `Q` / `E`,
            pijltjes links/rechts, `Shift` + scroll, of de knoppen hierboven.
          </p>
        )}
      </div>

      {/* Score breakdown */}
      {score && (
        <div className={styles.scoreSection}>
          <div className={styles.scoreHeader}>
            <span className={styles.scoreLabel}>Potentieelscore</span>
            <span className={styles.scoreTotal}>
              {score.tier !== "uitgesloten"
                ? `${score.totalPoints} / ${score.maxPossiblePoints}`
                : "uitgesloten"}
            </span>
          </div>

          {score.criteria.map((c) => (
            <div key={c.key} className={styles.criterionRow}>
              <span className={styles.criterionName}>{c.label}</span>
              <div className={styles.criterionBar}>
                <div
                  className={styles.criterionFill}
                  style={{
                    width:
                      c.maxPoints > 0
                        ? `${(Math.max(0, c.points) / c.maxPoints) * 100}%`
                        : "0%",
                    background:
                      c.points >= 2
                        ? "var(--color-hoog)"
                        : c.points === 1
                          ? "var(--color-middel)"
                          : "var(--border-subtle)",
                  }}
                />
              </div>
              <span
                className={styles.criterionPts}
                style={{
                  color:
                    c.points > 0
                      ? "var(--color-hoog)"
                      : c.points < 0
                        ? "var(--color-danger)"
                        : "var(--text-muted)",
                }}
              >
                {c.points > 0 ? `+${c.points}` : c.points}
              </span>
            </div>
          ))}

          <p className={styles.scoreExplanation}>{score.explanation}</p>

          {/* Warnings */}
          {score.warnings.length > 0 && (
            <div className={styles.warnings}>
              {score.warnings.map((w, i) => (
                <div key={i} className={styles.warning}>
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    aria-hidden
                    className={styles.warnIcon}
                  >
                    <path
                      d="M5 1L9 8.5H1L5 1Z"
                      stroke="var(--color-warning)"
                      strokeWidth="1"
                      fill="none"
                    />
                    <path
                      d="M5 4V6"
                      stroke="var(--color-warning)"
                      strokeWidth="1"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Flag form */}
      <div className={styles.flagSection}>
        {!flagSent ? (
          <>
            <button
              className={styles.flagToggle}
              onClick={() => setFlagOpen((o) => !o)}
            >
              {flagOpen ? "Annuleer" : "Rapporteer dataprobleem"}
            </button>

            {flagOpen && (
              <form className={styles.flagForm} onSubmit={handleFlag}>
                <label className={styles.flagLabel} htmlFor="flag-note">
                  Beschrijf het probleem (bijv. &quot;dit pand is al
                  gesloopt&quot;)
                </label>
                <textarea
                  id="flag-note"
                  className={styles.flagTextarea}
                  value={flagNote}
                  onChange={(e) => setFlagNote(e.target.value)}
                  rows={3}
                  required
                  placeholder="Toelichting..."
                />
                <button type="submit" className={styles.flagSubmit}>
                  Versturen
                </button>
              </form>
            )}
          </>
        ) : (
          <p className={styles.flagConfirm}>
            Bedankt. Melding ontvangen en opgenomen in de reviewwachtrij.
          </p>
        )}
      </div>
    </aside>
  );
}

function DataRow({
  label,
  value,
  mono = false,
  highlight = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={styles.dataRow}>
      <span className={styles.dataKey}>{label}</span>
      <span
        className={styles.dataVal}
        style={{
          fontFamily: mono ? "var(--font-mono)" : undefined,
          fontSize: mono ? "10px" : undefined,
          color: highlight ? "var(--color-middel)" : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function TierBadge({ tier }: { tier: ViabilityTier }) {
  const config: Record<
    ViabilityTier,
    { label: string; color: string; bg: string; border: string }
  > = {
    hoog: {
      label: "Hoog",
      color: "var(--color-hoog)",
      bg: "var(--color-hoog-bg)",
      border: "var(--color-hoog-border)",
    },
    middel: {
      label: "Middel",
      color: "var(--color-middel)",
      bg: "var(--color-middel-bg)",
      border: "var(--color-middel-border)",
    },
    laag: {
      label: "Laag",
      color: "var(--text-secondary)",
      bg: "var(--surface-overlay)",
      border: "var(--border-subtle)",
    },
    uitgesloten: {
      label: "Uitgesloten",
      color: "var(--text-muted)",
      bg: "var(--surface-overlay)",
      border: "var(--border-subtle)",
    },
  };

  const c = config[tier];
  return (
    <span
      className={styles.tierBadge}
      style={{ color: c.color, background: c.bg, borderColor: c.border }}
    >
      {c.label}
    </span>
  );
}

function formatGebruiksdoel(g: string): string {
  const map: Record<string, string> = {
    kantoorfunctie: "Kantoorfunctie",
    winkelfunctie: "Winkelfunctie",
    bijeenkomstfunctie: "Bijeenkomstfunctie",
    onderwijsfunctie: "Onderwijsfunctie",
    industriefunctie: "Industriefunctie",
    woonfunctie: "Woonfunctie",
  };
  return map[g] ?? g;
}
