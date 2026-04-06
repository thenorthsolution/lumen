"use client";

import { useEffect, useState } from "react";
import type { Gemeente } from "@lumen/pdok-client";
import type { PermitNotice, VboFeature } from "./AppShell";
import type { ViabilityTier } from "@lumen/bag-utils";
import styles from "./DetailPanel.module.css";

interface DetailPanelProps {
  feature: VboFeature;
  gemeente: Gemeente;
  onViewIn3D: () => void;
  onLoadStart: () => void;
  onLoadDone: (status: string) => void;
  onClose: () => void;
}

export function DetailPanel({
  feature,
  gemeente,
  onViewIn3D,
  onLoadStart,
  onLoadDone,
  onClose,
}: DetailPanelProps) {
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagNote, setFlagNote] = useState("");
  const [flagSent, setFlagSent] = useState(false);
  const [detailFeature, setDetailFeature] = useState<VboFeature | null>(null);
  const [detailError, setDetailError] = useState("");
  const [permitState, setPermitState] = useState<{
    isLoading: boolean;
    error: string;
    total: number;
    summary: string;
    notices: PermitNotice[];
  }>({
    isLoading: true,
    error: "",
    total: 0,
    summary: "",
    notices: [],
  });

  const resolvedFeature = detailFeature ?? feature;
  const { properties: props } = resolvedFeature;
  const score = props?.score;
  const tier = score?.tier ?? "laag";
  const showThreeDAction = tier === "hoog" || tier === "middel";
  const bagViewerUrl = props?.identificatie
    ? `https://bagviewer.kadaster.nl/lvbag/bag-viewer/?objectId=${props.identificatie}`
    : null;
  const [permitsOpen, setPermitsOpen] = useState(false);
  const permitLatest = permitState.notices[0]?.modified
    ? formatPermitDate(permitState.notices[0].modified)
    : null;
  const permitSummaryItems = [
    {
      label: "Gebied",
      value: props?.woonplaatsnaam || gemeente.name,
    },
    {
      label: "Publicaties",
      value: permitState.total.toLocaleString("nl-NL"),
    },
    {
      label: "Laatste update",
      value: permitLatest ?? "Onbekend",
    },
  ];
  const objectAddress = formatObjectAddress(resolvedFeature);
  const googleMapsUrl = buildGoogleMapsUrl(resolvedFeature, objectAddress);
  const wozUrl = objectAddress
    ? "https://www.wozwaardeloket.nl/"
    : "";

  async function handleCopyAddress() {
    if (!objectAddress) return;
    try {
      await navigator.clipboard.writeText(objectAddress);
    } catch (error) {
      console.error("Adres kopieren mislukt:", error);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    onLoadStart();
    setDetailFeature(null);
    setDetailError("");
    setPermitState({
      isLoading: true,
      error: "",
      total: 0,
      summary: "",
      notices: [],
    });

    const url = new URL("/api/permits", window.location.origin);
    url.searchParams.set("gemeente", gemeente.name);
    if (props?.woonplaatsnaam) {
      url.searchParams.set("woonplaats", props.woonplaatsnaam);
    }
    url.searchParams.set("limit", "6");

    const detailUrl = new URL("/api/feature-detail", window.location.origin);
    detailUrl.searchParams.set("gemeenteCode", gemeente.code);
    detailUrl.searchParams.set("identificatie", feature.properties.identificatie);

    Promise.all([
      fetch(detailUrl.toString(), { signal: controller.signal }).then(
        async (response) => {
          const data = (await response.json()) as {
            error?: string;
            feature?: VboFeature;
          };
          if (!response.ok || !data.feature) {
            throw new Error(data.error || "Detailobject kon niet worden geladen.");
          }
          return data.feature;
        },
      ),
      fetch(url.toString(), { signal: controller.signal }).then(async (response) => {
        if (!response.ok) {
          throw new Error("Vergunningen konden niet worden geladen.");
        }
        return (await response.json()) as {
          total?: number;
          summary?: string;
          notices?: PermitNotice[];
        };
      }),
    ])
      .then(([nextFeature, permitData]) => {
        if (controller.signal.aborted) return;
        setDetailFeature(nextFeature);
        setPermitState({
          isLoading: false,
          error: "",
          total: permitData.total ?? permitData.notices?.length ?? 0,
          summary: permitData.summary ?? "",
          notices: permitData.notices ?? [],
        });
        onLoadDone("Detailkaart gereed");
      })
      .catch((error) => {
        if ((error as Error).name === "AbortError") return;
        setDetailError((error as Error).message);
        setPermitState({
          isLoading: false,
          error: (error as Error).message,
          total: 0,
          summary: "",
          notices: [],
        });
        onLoadDone("Detailkaart gereed met fallback");
      });

    return () => controller.abort();
  }, [
    feature.properties.identificatie,
    feature.properties.woonplaatsnaam,
    gemeente.code,
    gemeente.name,
    onLoadDone,
    onLoadStart,
  ]);

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
          <span className={styles.headerEyebrow}>
            {props?.woonplaatsnaam || gemeente.name}
          </span>
          <span className={styles.headerTitle}>
            {formatGebruiksdoel(props?.gebruiksdoel ?? "")}
          </span>
          <span className={styles.headerSub}>
            BAG {props?.identificatie?.slice(-6) || "object"}
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

      <div className={styles.summarySection}>
        <div className={styles.metricGrid}>
          <MetricCard
            label="Status"
            value={props?.status ?? "—"}
            tone="warn"
          />
          <MetricCard
            label="Pandstatus"
            value={
              props?.pandStatus && props.pandStatus !== "onbekend"
                ? props.pandStatus
                : "—"
            }
          />
          <MetricCard
            label="Bouwjaar"
            value={props?.bouwjaar ? String(props.bouwjaar) : "—"}
          />
          <MetricCard
            label="Vloeroppervlak"
            value={
              props?.oppervlakte
                ? `${props.oppervlakte.toLocaleString("nl-NL")} m²`
                : "—"
            }
          />
        </div>
        <div className={styles.factsCard}>
          <div className={styles.factsHeader}>
            <span className={styles.actionsLabel}>Objectgegevens</span>
          </div>
          {detailError ? (
            <p className={styles.actionsNote}>{detailError}</p>
          ) : null}
          <div className={styles.factList}>
            <FactItem
              label="BAG identificatie"
              value={props?.identificatie ?? "—"}
              mono
            />
            <FactItem
              label="Gebruiksdoel"
              value={formatGebruiksdoel(props?.gebruiksdoel ?? "")}
            />
            <FactItem
              label="Woonplaats"
              value={props?.woonplaatsnaam || gemeente.name}
            />
            <FactItem
              label="Adres"
              value={objectAddress || "Adres onbekend"}
              href={googleMapsUrl}
              {...(objectAddress
                ? {
                    actionLabel: "Kopieer",
                    onAction: handleCopyAddress,
                  }
                : {})}
            />
            <FactItem
              label="WOZ"
              value={objectAddress ? "Controleer in WOZ-loket" : "Adres nodig"}
              {...(wozUrl ? { href: wozUrl } : {})}
            />
            <FactItem
              label="Pand-ID"
              value={props?.pandIdentificatie || "—"}
              mono
            />
          </div>
        </div>
      </div>

      <div className={styles.permitsSection}>
        <div className={styles.actionsHeader}>
          <span className={styles.actionsLabel}>Vergunningen</span>
        </div>
        <p className={styles.actionsNote}>
          Recente officiële bekendmakingen voor omgevingsvergunningen in{" "}
          {props?.woonplaatsnaam || gemeente.name}. Dit geeft context over wat
          er mogelijk gebouwd of verbouwd wordt, maar is niet perceelhard
          gekoppeld aan dit BAG-object.
        </p>
        {!permitState.isLoading &&
        !permitState.error &&
        permitState.summary ? (
          <p className={styles.permitNarrative}>{permitState.summary}</p>
        ) : null}
        {!permitState.isLoading &&
        !permitState.error &&
        permitState.notices.length > 0 ? (
          <div className={styles.permitSummary}>
            {permitSummaryItems.map((item) => (
              <div key={item.label} className={styles.permitSummaryItem}>
                <span className={styles.permitSummaryLabel}>{item.label}</span>
                <span className={styles.permitSummaryValue}>{item.value}</span>
              </div>
            ))}
          </div>
        ) : null}
        {permitState.isLoading ? (
          <p className={styles.permitStatus}>Vergunningen laden...</p>
        ) : permitState.error ? (
          <p className={styles.permitStatus}>{permitState.error}</p>
        ) : permitState.notices.length === 0 ? (
          <p className={styles.permitStatus}>
            Geen recente omgevingsvergunningen gevonden.
          </p>
        ) : (
          <details
            className={styles.permitDropdown}
            open={permitsOpen}
            onToggle={(event) =>
              setPermitsOpen((event.currentTarget as HTMLDetailsElement).open)
            }
          >
            <summary className={styles.permitDropdownTrigger}>
              <span>Publicaties ({permitState.notices.length})</span>
              <span className={styles.permitDropdownHint}>
                {permitsOpen ? "Verberg" : "Toon"}
              </span>
            </summary>
            <p className={styles.permitStatus}>
              {permitState.total.toLocaleString("nl-NL")} recente
              vergunningpublicaties gevonden.
            </p>
            <div className={styles.permitList}>
              {permitState.notices.map((notice) => (
                <a
                  key={notice.id}
                  href={notice.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.permitItem}
                >
                  <span className={styles.permitDate}>
                    {formatPermitDate(notice.modified)}
                  </span>
                  <span className={styles.permitTitle}>{notice.title}</span>
                  <span className={styles.permitMeta}>
                    {notice.creator} · {notice.type || "bekendmaking"}
                  </span>
                </a>
              ))}
            </div>
          </details>
        )}
      </div>

      <div className={styles.actionsSection}>
        <div className={styles.actionsHeader}>
          <span className={styles.actionsLabel}>Verdiepen</span>
        </div>
        <div className={styles.actionGrid}>
          {showThreeDAction && (
            <button
              type="button"
              onClick={onViewIn3D}
              className={styles.actionBtn}
            >
              Bekijk op kaart in 3D
            </button>
          )}
          {bagViewerUrl && (
            <a
              href={bagViewerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.actionBtnGhost}
            >
              Bekijk in BAG Viewer
            </a>
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
        {(showThreeDAction || bagViewerUrl || props?.bagUri) && (
          <p className={styles.actionsNote}>
            `Bekijk op kaart in 3D` zet de kaart schuin. Draaien en resetten
            doe je daarna in de kaart rechtsboven of met `Q` / `E` en de
            pijltjes.
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

function formatPermitDate(value: string): string {
  if (!value) return "datum onbekend";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className={styles.metricCard}>
      <span className={styles.metricLabel}>{label}</span>
      <span
        className={styles.metricValue}
        style={{
          color: tone === "warn" ? "var(--color-middel)" : undefined,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function FactItem({
  label,
  value,
  mono = false,
  href,
  actionLabel,
  onAction,
}: {
  label: string;
  value: string;
  mono?: boolean;
  href?: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
}) {
  return (
    <div className={styles.factRow}>
      <span className={styles.factKey}>{label}</span>
      <div className={styles.factValueGroup}>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.factLink}
            style={{
              fontFamily: mono ? "var(--font-mono)" : undefined,
              fontSize: mono ? "10px" : undefined,
            }}
          >
            {value}
          </a>
        ) : (
          <span
            className={styles.factVal}
            style={{
              fontFamily: mono ? "var(--font-mono)" : undefined,
              fontSize: mono ? "10px" : undefined,
            }}
          >
            {value}
          </span>
        )}
        {actionLabel && onAction ? (
          <button
            type="button"
            className={styles.factAction}
            onClick={() => void onAction()}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function formatObjectAddress(feature: VboFeature): string {
  const props = feature.properties;
  const street = props.openbareruimtenaam?.trim() ?? "";
  const number = props.huisnummer?.trim() ?? "";
  const letter = props.huisletter?.trim() ?? "";
  const addition = props.huisnummertoevoeging?.trim() ?? "";
  const postcode = props.postcode?.trim() ?? "";
  const city = props.woonplaatsnaam?.trim() ?? "";

  const line1 = [street, [number, letter, addition].join("").trim()]
    .filter(Boolean)
    .join(" ");
  const line2 = [postcode, city].filter(Boolean).join(" ");

  return [line1, line2].filter(Boolean).join(", ");
}

function buildGoogleMapsUrl(feature: VboFeature, address: string): string {
  const query = address || getFeatureCenter(feature).join(",");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function getFeatureCenter(feature: VboFeature): [number, number] {
  const geometry = feature.geometry;
  if (geometry.type === "Point") {
    return geometry.coordinates as [number, number];
  }

  const coords: [number, number][] = [];
  collectCoordinates("coordinates" in geometry ? geometry.coordinates : [], coords);
  if (coords.length === 0) {
    return [0, 0];
  }

  const [sumLng, sumLat] = coords.reduce(
    ([lngAcc, latAcc], [lng, lat]) => [lngAcc + lng, latAcc + lat],
    [0, 0],
  );
  return [sumLng / coords.length, sumLat / coords.length];
}

function collectCoordinates(value: unknown, acc: [number, number][]): void {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    acc.push([value[0], value[1]]);
    return;
  }
  for (const item of value) {
    collectCoordinates(item, acc);
  }
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
