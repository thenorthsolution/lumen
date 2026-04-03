"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchPipelineData, type PipelineData, type ProvinceMetrics } from "@/lib/pipeline-data";
import { TopBar } from "./TopBar";
import { ChoroplethMap } from "./ChoroplethMap";
import { TimelineChart } from "./TimelineChart";
import { RegionTable } from "./RegionTable";
import { StatBar } from "./StatBar";

export type ActiveTab = "kaart" | "tijdlijn" | "tabel" | "methodologie";

export function AppShell() {
  const [activeTab, setActiveTab]   = useState<ActiveTab>("kaart");
  const [data, setData]             = useState<PipelineData | null>(null);
  const [selected, setSelected]     = useState<ProvinceMetrics | null>(null);
  const [isLoading, setIsLoading]   = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchPipelineData();
      setData(result);
    } catch (e) {
      setError("Data ophalen mislukt. Probeer opnieuw.");
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="flex flex-col h-dvh w-full overflow-hidden">
      <TopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isLoading={isLoading}
        isMockData={data?.isMockData ?? false}
      />

      <div className="flex flex-1 min-h-0 relative overflow-hidden">
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-50 bg-[var(--color-surface-base)]">
            <span className="text-[13px] text-[var(--color-text-secondary)]">{error}</span>
            <button
              onClick={load}
              className="text-[11px] px-3 py-1.5 border border-[var(--color-border-subtle)] rounded-[var(--radius-md)] text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors cursor-pointer bg-transparent"
            >
              Opnieuw proberen
            </button>
          </div>
        )}

        {activeTab === "kaart"       && <ChoroplethMap data={data} selected={selected} onSelect={setSelected} isLoading={isLoading} />}
        {activeTab === "tijdlijn"    && <TimelineChart data={data} isLoading={isLoading} />}
        {activeTab === "tabel"       && <RegionTable   data={data} isLoading={isLoading} />}
        {activeTab === "methodologie" && <MethodologyView />}
      </div>

      <StatBar data={data} />
    </div>
  );
}

function MethodologyView() {
  return (
    <div className="flex-1 overflow-y-auto bg-[var(--color-surface-base)]">
      <div className="max-w-[720px] mx-auto px-6 py-8">
        <h1 className="text-[18px] font-medium text-[var(--color-text-primary)] mb-6">Methodologie</h1>

        {[
          {
            heading: "Databron: TenderNed (in aanvraag)",
            body: "Lumen Pipeline aggregeert openbaar aanbestede woningbouwprojecten via de TenderNed REST API. Gefilterd op CPV-codes 45211000–45211350. Onze accountaanvraag is ingediend en wordt verwerkt — tot die tijd toont het instrument representatieve voorbeelddata. Dit is duidelijk aangegeven in de interface.",
          },
          {
            heading: "Activiteitsscore",
            body: "De choroplethkaart toont een genormaliseerde activiteitsscore per provincie: het aantal actieve tenders als fractie van de provincie met de meeste tenders. Dit is een relatieve, niet absolute maat.",
          },
          {
            heading: "Knelpuntsignaal",
            body: "Provincies met lage tenderactiviteit maar hoge woningvraag (Noord-Holland, Zuid-Holland, Utrecht) worden gemarkeerd als knelpunt. Dit is een heuristiek — geen actuele capaciteitsmeting.",
          },
          {
            heading: "Tijdlijn",
            body: "De tijdlijn toont het aantal gepubliceerde tenders per maand over de afgelopen 12 maanden. Seizoenspatronen zijn zichtbaar — kwartaal 1 en kwartaal 4 kennen doorgaans lagere publicatievolumes.",
          },
          {
            heading: "Voorbeelddata",
            body: "Zolang de TenderNed API-toegang in behandeling is, valt het instrument terug op representatieve voorbeelddata. De structuur van de data is identiek aan de live API-output; alleen de specifieke projecten zijn fictief.",
          },
        ].map(({ heading, body }) => (
          <div key={heading} className="mb-6">
            <h2 className="text-[13px] font-medium text-[var(--color-text-primary)] mb-2">{heading}</h2>
            <p className="text-[12px] text-[var(--color-text-secondary)] leading-relaxed">{body}</p>
          </div>
        ))}

        <a
          href="https://github.com/thenorthsolution/lumen/blob/main/apps/lumen-pipeline/TOOL.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-[var(--color-accent)] no-underline hover:underline"
        >
          Volledige methodologie op GitHub
        </a>
      </div>
    </div>
  );
}
