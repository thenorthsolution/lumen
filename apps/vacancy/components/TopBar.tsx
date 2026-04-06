"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { searchGemeenten, type Gemeente } from "@lumen/pdok-client";
import type { AiSearchHit } from "./AppShell";
import {
  fetchEligibleCountForGemeente,
  SHORTLIST_COUNT_FILTERS,
} from "@/lib/bag-fetch";
import ELIGIBLE_COUNTS from "@/data/eligible-counts.generated.json";
import styles from "./TopBar.module.css";

interface TopBarProps {
  gemeente: Gemeente;
  onGemeenteChange: (code: string) => void;
  onAiSearchSelect: (hit: AiSearchHit) => void;
  onAiSearchResults: (hits: AiSearchHit[]) => void;
  onAiSearchStateChange: (state: { loading: boolean; query: string }) => void;
  isLoading: boolean;
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

export type NavTab = "kaart" | "tabel" | "methodologie";

export function TopBar({
  gemeente,
  onGemeenteChange,
  onAiSearchSelect,
  onAiSearchResults,
  onAiSearchStateChange,
  isLoading,
  activeTab,
  onTabChange,
}: TopBarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Gemeente[]>([]);
  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({});
  const [aiQuery, setAiQuery] = useState("");
  const [aiResults, setAiResults] = useState<AiSearchHit[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiHasSearched, setAiHasSearched] = useState(false);
  const aiWrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const visibleMissingResults = useMemo(
    () =>
      results.filter(
        (g) =>
          getStoredEligibleCount(g.code) === null && liveCounts[g.code] === undefined,
      ),
    [results, liveCounts],
  );

  useEffect(() => {
    if (searchOpen) {
      inputRef.current?.focus();
      setResults(filterGemeentenWithPotential(sortGemeenten(searchGemeenten("")), liveCounts).slice(0, 12));
    }
  }, [searchOpen, liveCounts]);

  useEffect(() => {
    setResults(
      filterGemeentenWithPotential(sortGemeenten(searchGemeenten(query)), liveCounts).slice(0, 12),
    );
  }, [query, liveCounts]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setSearchOpen(false);
        setQuery("");
      }
      if (aiWrapRef.current && !aiWrapRef.current.contains(e.target as Node)) {
        setAiOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!searchOpen || visibleMissingResults.length === 0) return;

    const controller = new AbortController();

    Promise.all(
      visibleMissingResults.map(async (g) => {
        const count = await fetchEligibleCountForGemeente(g, controller.signal);
        return [g.code, count] as const;
      }),
    )
      .then((pairs) => {
        if (controller.signal.aborted || pairs.length === 0) return;
        setLiveCounts((prev) => {
          const next = { ...prev };
          let changed = false;
          for (const [code, count] of pairs) {
            if (next[code] !== count) {
              next[code] = count;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") {
          console.error("Eligible count fetch fout:", err);
        }
      });

    return () => controller.abort();
  }, [searchOpen, visibleMissingResults]);

  function handleSelect(code: string) {
    onGemeenteChange(code);
    setSearchOpen(false);
    setQuery("");
  }

  async function handleAiSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = aiQuery.trim();
    if (!trimmed) return;

    setAiLoading(true);
    setAiError("");
    setAiOpen(true);
    setAiHasSearched(true);
    onAiSearchStateChange({ loading: true, query: trimmed });

    try {
      const url = new URL("/api/ai-search", window.location.origin);
      url.searchParams.set("q", trimmed);
      url.searchParams.set("limit", "8");

      const response = await fetch(url.toString());
      const data = (await response.json()) as {
        error?: string;
        results?: AiSearchHit[];
      };

      if (!response.ok) {
        throw new Error(data.error || "AI search mislukt.");
      }

      const hits = data.results ?? [];
      setAiResults(hits);
      onAiSearchResults(hits);
    } catch (error) {
      setAiResults([]);
      onAiSearchResults([]);
      setAiError((error as Error).message);
    } finally {
      setAiLoading(false);
      onAiSearchStateChange({ loading: false, query: trimmed });
    }
  }

  function handleAiResultClick(hit: AiSearchHit) {
    onAiSearchSelect(hit);
    setAiOpen(false);
    setAiQuery("");
  }

  return (
    <header className={styles.topbar}>
      {/* Logo */}
      <div className={styles.logo}>
        <span className={styles.logoNorth}>NORTH</span>
        <span className={styles.logoDivider}>/</span>
        <span className={styles.logoTool}>LEEGSTANDSRADAR</span>
      </div>

      {/* Nav */}
      <nav className={styles.nav}>
        {(["kaart", "tabel", "methodologie"] as NavTab[]).map((tab) => (
          <button
            key={tab}
            className={`${styles.navItem} ${activeTab === tab ? styles.navItemActive : ""}`}
            onClick={() => onTabChange(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      <div className={styles.spacer} />

      {/* Loading indicator */}
      {isLoading && (
        <div className={styles.loadingBar}>
          <div className={styles.loadingPulse} />
          <span className={styles.loadingText}>laden...</span>
        </div>
      )}

      <div className={styles.aiWrap} ref={aiWrapRef}>
        <form className={styles.aiForm} onSubmit={handleAiSubmit}>
          <input
            type="text"
            className={styles.aiInput}
            placeholder="AI zoekvraag, bv. groot nieuw pand dat gesloopt gaat worden"
            value={aiQuery}
            onChange={(event) => setAiQuery(event.target.value)}
            onFocus={() => {
              if (aiHasSearched || aiResults.length > 0 || aiError) {
                setAiOpen(true);
              }
            }}
            aria-label="AI zoekvraag"
          />
          <button type="submit" className={styles.aiButton}>
            AI zoek
          </button>
        </form>

        {aiOpen && (aiLoading || aiError || aiHasSearched) && (
          <div className={styles.aiDropdown}>
            {aiLoading ? (
              <div className={styles.aiState}>AI zoekresultaten laden...</div>
            ) : aiError ? (
              <div className={styles.aiState}>{aiError}</div>
            ) : (
              <ul className={styles.aiList}>
                {aiResults.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      className={styles.aiResult}
                      onClick={() => handleAiResultClick(hit)}
                    >
                      <span className={styles.aiResultMain}>
                        <span className={styles.aiResultTitle}>
                          {hit.gebruiksdoel || "Object"} · {hit.woonplaatsnaam}
                        </span>
                        <span className={styles.aiResultSub}>
                          {hit.status || "status onbekend"} ·{" "}
                          {hit.oppervlakte
                            ? `${Math.round(hit.oppervlakte).toLocaleString("nl-NL")} m²`
                            : "opp. onbekend"}
                        </span>
                      </span>
                      <span className={styles.aiResultMeta}>
                        {Math.round(hit.hybrid_score * 100)}%
                      </span>
                    </button>
                  </li>
                ))}
                {aiResults.length === 0 && (
                  <li className={styles.aiState}>Geen AI matches gevonden.</li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Gemeente selector */}
      <div className={styles.gemeenteWrap} ref={dropdownRef}>
        <button
          className={styles.gemeentePill}
          onClick={() => setSearchOpen((o) => !o)}
          aria-label="Selecteer gemeente"
          aria-expanded={searchOpen}
        >
          <span className={styles.gemeenteName}>{gemeente.name}</span>
          <span className={styles.gemeenteProvince}>
            {gemeente.province.slice(0, 2).toUpperCase()}
          </span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            aria-hidden
          >
            <path
              d="M2 3.5L5 6.5L8 3.5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {searchOpen && (
          <div className={styles.dropdown}>
            <div className={styles.searchWrap}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                className={styles.searchIcon}
                aria-hidden
              >
                <circle
                  cx="5"
                  cy="5"
                  r="3.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path
                  d="M8 8L10.5 10.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              <input
                ref={inputRef}
                type="text"
                className={styles.searchInput}
                placeholder="Zoek gemeente..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Zoek gemeente"
              />
            </div>
            <ul className={styles.resultList} role="listbox">
              {results.map((g) => (
                <li
                  key={g.code}
                  role="option"
                  aria-selected={g.code === gemeente.code}
                >
                  <button
                    className={`${styles.resultItem} ${g.code === gemeente.code ? styles.resultItemActive : ""}`}
                    onClick={() => handleSelect(g.code)}
                  >
                    <span className={styles.resultMain}>
                      <span className={styles.resultName}>{g.name}</span>
                      <span className={styles.resultProvince}>{g.province}</span>
                    </span>
                    <span className={styles.resultMeta}>
                      {formatEligibleCount(g.code, liveCounts)}
                    </span>
                  </button>
                </li>
              ))}
              {results.length === 0 && (
                <li className={styles.noResults}>Geen resultaten</li>
              )}
            </ul>
            <div className={styles.dropdownFooter}>
              <a
                href="https://github.com/thenorthsolution/lumen"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.footerLink}
              >
                Gemeente ontbreekt? Bijdragen via GitHub
              </a>
            </div>
          </div>
        )}
      </div>

      {/* GitHub link */}
      <a
        href="https://github.com/thenorthsolution/lumen"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.githubLink}
        aria-label="Bekijk op GitHub"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden
        >
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
      </a>
    </header>
  );
}

function formatEligibleCount(
  code: string,
  liveCounts: Record<string, number>,
): string {
  const stored = getStoredEligibleCount(code);
  const value = stored ?? liveCounts[code];
  return value === undefined ? "laden..." : `${value.toLocaleString("nl-NL")} cand.`;
}

function sortGemeenten(gemeenten: Gemeente[]): Gemeente[] {
  return [...gemeenten].sort((a, b) => {
    const countA = getStoredEligibleCount(a.code) ?? -1;
    const countB = getStoredEligibleCount(b.code) ?? -1;
    if (countA !== countB) return countB - countA;
    return a.name.localeCompare(b.name, "nl");
  });
}

function getStoredEligibleCount(code: string): number | null {
  const filters = ELIGIBLE_COUNTS.filters as
    | {
        bouwjaarMin?: number;
        oppervlakteMin?: number;
        gebruiksdoelen?: string[];
        vboStatuses?: string[];
        pandStatuses?: string[];
      }
    | undefined;
  const uses = filters?.gebruiksdoelen ?? [];
  const vboStatuses = filters?.vboStatuses ?? [];
  const pandStatuses = filters?.pandStatuses ?? [];
  const matchesShortlistFilters =
    (filters?.bouwjaarMin ?? SHORTLIST_COUNT_FILTERS.bouwjaarMin) ===
      SHORTLIST_COUNT_FILTERS.bouwjaarMin &&
    (filters?.oppervlakteMin ?? SHORTLIST_COUNT_FILTERS.oppervlakteMin) ===
      SHORTLIST_COUNT_FILTERS.oppervlakteMin &&
    uses.length === SHORTLIST_COUNT_FILTERS.gebruiksdoelen.length &&
    uses.every((use) =>
      SHORTLIST_COUNT_FILTERS.gebruiksdoelen.some(
        (candidate) => candidate === use,
      ),
    ) &&
    vboStatuses.length === SHORTLIST_COUNT_FILTERS.vboStatuses.length &&
    vboStatuses.every((status) =>
      SHORTLIST_COUNT_FILTERS.vboStatuses.some(
        (candidate) => candidate === status,
      ),
    ) &&
    pandStatuses.length === SHORTLIST_COUNT_FILTERS.pandStatuses.length &&
    pandStatuses.every((status) =>
      SHORTLIST_COUNT_FILTERS.pandStatuses.some(
        (candidate) => candidate === status,
      ),
    );

  if (!matchesShortlistFilters) return null;

  const counts = ELIGIBLE_COUNTS.counts as Record<
    string,
    { eligibleCount?: number } | undefined
  >;
  const value = counts[code]?.eligibleCount;
  return value === undefined ? null : value;
}

function getEligibleCount(
  code: string,
  liveCounts: Record<string, number>,
): number | null {
  return getStoredEligibleCount(code) ?? liveCounts[code] ?? null;
}

function filterGemeentenWithPotential(
  gemeenten: Gemeente[],
  liveCounts: Record<string, number>,
): Gemeente[] {
  return gemeenten.filter((gemeente) => {
    const count = getEligibleCount(gemeente.code, liveCounts);
    return count === null || count > 0;
  });
}
