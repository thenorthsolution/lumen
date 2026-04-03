"use client";

const SECTIONS = [
  {
    heading: "Wat dit instrument doet",
    body: `Bouwcapaciteitcheck aggregeert openbaar aanbestede woningbouwprojecten via TenderNed en visualiseert tenderactiviteit per provincie. De kernthese: bouwcapaciteit is een coördinatiefailure, geen vaste arbeidsbeperkter. Aannemers investeren niet in wat ze niet kunnen voorspellen. Dit instrument maakt de pijplijn zichtbaar — als eerste stap naar vertrouwen.`,
  },
  {
    heading: "Databron: TenderNed",
    body: `TenderNed publiceert aanbestedingen van gemeenten, woningcorporaties en het Rijksvastgoedbedrijf boven de Europese drempel (~€5,3M voor werken). Gefilterd op CPV-codes 45211000–45211300 (woningbouw). De API is openbaar en vrij herbruikbaar. Onze accountaanvraag voor volledige API-toegang is ingediend. Tot die tijd gebruikt het instrument representatieve voorbeelddata bij afwezigheid van livedata.`,
  },
  {
    heading: "Databron: Vergunningendata",
    body: `Vergunningsdoorlooptijden zijn gebaseerd op Omgevingsloket open data en CBS Statline bouwvergunningenstatistieken. De nationale mediaan is circa 112 dagen. Provincies met een gemiddelde >2× mediaan worden als knelpunt gemarkeerd.`,
  },
  {
    heading: "Activiteitsscore",
    body: `De choroplethkaart toont een genormaliseerde score: actieve tenders als fractie van de meest actieve provincie. Score 1.0 = meest actief in de dataset. Dit is een relatieve maat — geen absolute capaciteitsnorm.`,
  },
  {
    heading: "Knelpuntsignaal",
    body: `Provincies worden als knelpunt (alert) gemarkeerd bij: lage tenderactiviteit (<0.15 score) in combinatie met hoge woningvraag (Randstand + Noord-Brabant), óf gemiddelde vergunningsdoorlooptijd >2× nationaal mediaan. "Let op" bij score <0.3 of doorlooptijd >1.4× mediaan.`,
  },
  {
    heading: "Beperkingen — wees eerlijk over wat dit niet is",
    body: `TenderNed dekt ~20% van de bouwproductie. Particuliere projecten, onderhands gegunde opdrachten, en projecten onder drempel ontbreken. Vergunningspublicaties lopen 3-12 maanden achter op bouwstarts. Gebruik als richtinggevend signaal — niet als volledig marktoverzicht.`,
    alert: true,
  },
  {
    heading: "Bijdragen",
    body: `Het instrument is open source (MIT). Verbeteringen voor knelpuntheuristiek, integratie van CBS-vraagdata, en uitbreiding met Omgevingsloket API zijn welkom via GitHub Pull Request.`,
  },
];

export function MethodologyView() {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        background: "var(--bg)",
      }}
    >
      <div
        style={{ maxWidth: 720, margin: "0 auto", padding: "28px 24px 48px" }}
      >
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: "var(--text-hi)",
            marginBottom: 6,
          }}
        >
          Methodologie
        </h1>
        <p
          style={{
            fontSize: 12,
            color: "var(--text-mid)",
            fontFamily: "var(--font-mono)",
            marginBottom: 32,
          }}
        >
          Bouwcapaciteitcheck v0.2 · North Solution
        </p>

        {/* Honest framing banner */}
        <div
          style={{
            background: "rgba(232,184,75,0.08)",
            border: "0.5px solid rgba(232,184,75,0.3)",
            borderRadius: "var(--r-lg)",
            padding: "14px 18px",
            marginBottom: 32,
            display: "flex",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⚠️</span>
          <p style={{ fontSize: 12, color: "var(--text-hi)", lineHeight: 1.7 }}>
            Dit instrument toont publiek aanbestede projecten en open
            vergunningdata. Particuliere kleinschalige bouw is
            ondervertegenwoordigd. Gebruik als{" "}
            <strong>richtinggevend signaal</strong>, niet als volledig beeld.
          </p>
        </div>

        {SECTIONS.map((s) => (
          <section key={s.heading} style={{ marginBottom: 28 }}>
            <h2
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: s.alert ? "var(--warn)" : "var(--text-hi)",
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {s.alert && <span style={{ fontSize: 11 }}>⚠</span>}
              {s.heading}
            </h2>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-mid)",
                lineHeight: 1.8,
              }}
            >
              {s.body}
            </p>
          </section>
        ))}

        {/* Data sources table */}
        <section style={{ marginTop: 32 }}>
          <h2
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-hi)",
              marginBottom: 14,
            }}
          >
            CPV-filtercodes
          </h2>
          <div
            style={{
              border: "0.5px solid var(--border)",
              borderRadius: "var(--r-lg)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-raised)" }}>
                  {["Code", "Omschrijving"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 14px",
                        textAlign: "left",
                        fontSize: 9,
                        fontFamily: "var(--font-mono)",
                        fontWeight: 600,
                        color: "var(--text-mid)",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        borderBottom: "0.5px solid var(--border)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["45211000", "Bouw van woningen en woongebouwen (algemeen)"],
                  ["45211100", "Bouw van huizen"],
                  ["45211200", "Bouw van houten woningen"],
                  ["45211300", "Bouw van flatgebouwen"],
                ].map(([code, desc]) => (
                  <tr
                    key={code}
                    style={{ borderBottom: "0.5px solid var(--border)" }}
                  >
                    <td
                      style={{
                        padding: "8px 14px",
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--accent)",
                      }}
                    >
                      {code}
                    </td>
                    <td
                      style={{
                        padding: "8px 14px",
                        fontSize: 11,
                        color: "var(--text-mid)",
                      }}
                    >
                      {desc}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div
          style={{
            marginTop: 36,
            paddingTop: 24,
            borderTop: "0.5px solid var(--border)",
          }}
        >
          <a
            href="https://github.com/thenorthsolution/lumen/blob/main/apps/pipeline/TOOL.md"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--accent)",
              textDecoration: "none",
            }}
          >
            Volledige methodologie op GitHub →
          </a>
        </div>
      </div>
    </div>
  );
}
