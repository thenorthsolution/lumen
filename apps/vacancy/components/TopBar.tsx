"use client";

import { useState, useRef, useEffect } from "react";
import { searchGemeenten, type Gemeente } from "@lumen/pdok-client";
import styles from "./TopBar.module.css";

interface TopBarProps {
  gemeente: Gemeente;
  onGemeenteChange: (code: string) => void;
  isLoading: boolean;
}

type NavTab = "kaart" | "tabel" | "methodologie";

export function TopBar({ gemeente, onGemeenteChange, isLoading }: TopBarProps) {
  const [activeTab, setActiveTab] = useState<NavTab>("kaart");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Gemeente[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchOpen) {
      inputRef.current?.focus();
      setResults(searchGemeenten("").slice(0, 8));
    }
  }, [searchOpen]);

  useEffect(() => {
    setResults(searchGemeenten(query).slice(0, 8));
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
            onClick={() => setActiveTab(tab)}
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
                    <span className={styles.resultName}>{g.name}</span>
                    <span className={styles.resultProvince}>{g.province}</span>
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
