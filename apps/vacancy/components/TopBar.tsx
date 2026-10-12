"use client";

import { useState, useRef, useEffect } from "react";
import { searchGemeenten, type Gemeente } from "@lumen/pdok-client";
import { SHORTLIST_COUNT_FILTERS } from "@/lib/bag-fetch";
import ELIGIBLE_COUNTS from "@/data/eligible-counts.generated.json";
import styles from "./TopBar.module.css";

interface TopBarProps {
  gemeente: Gemeente;
  onGemeenteChange: (code: string) => void;
  isLoading: boolean;
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

export type NavTab =
  | "overzicht"
  | "leegstand"
  | "ruimte"
  | "pijplijn"
  | "tabel"
  | "methodologie";

const NAV_ITEMS: Array<{ value: NavTab; label: string }> = [
  { value: "overzicht", label: "overzicht" },
  { value: "leegstand", label: "leegstand" },
  { value: "ruimte", label: "ruimte" },
  { value: "pijplijn", label: "pijplijn" },
  { value: "tabel", label: "objecten" },
  { value: "methodologie", label: "trust" },
];

export function TopBar({
  gemeente,
  onGemeenteChange,
  isLoading,
  activeTab,
  onTabChange,
}: TopBarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Gemeente[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchOpen) {
      inputRef.current?.focus();
      setResults(filterGemeentenWithPotential(sortGemeenten(searchGemeenten(""))).slice(0, 12));
    }
  }, [searchOpen]);

  useEffect(() => {
    setResults(
      filterGemeentenWithPotential(sortGemeenten(searchGemeenten(query))).slice(0, 12),
    );
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setSearchOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(code: string) {
    onGemeenteChange(code);
    setSearchOpen(false);
    setQuery("");
  }

  return (
    <header className={styles.topbar}>
      {/* Logo */}
      <div className={styles.logo}>
        <span className={styles.logoNorth}>LUMEN</span>
        <span className={styles.logoDivider}>/</span>
        <span className={styles.logoTool}>MUNICIPALITY INTELLIGENCE</span>
      </div>

      {/* Nav */}
      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.value}
            className={`${styles.navItem} ${activeTab === item.value ? styles.navItemActive : ""}`}
            onClick={() => onTabChange(item.value)}
          >
            {item.label}
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
                      {formatEligibleCount(g.code)}
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

function formatEligibleCount(code: string): string {
  const stored = getStoredEligibleCount(code);
  return stored === null ? "open kaart" : `${stored.toLocaleString("nl-NL")} cand.`;
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
): number | null {
  return getStoredEligibleCount(code);
}

function filterGemeentenWithPotential(gemeenten: Gemeente[]): Gemeente[] {
  return gemeenten.filter((gemeente) => {
    const count = getEligibleCount(gemeente.code);
    return count === null || count > 0;
  });
}
