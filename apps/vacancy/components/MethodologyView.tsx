"use client";

import styles from "./MethodologyView.module.css";

export function MethodologyView() {
  return (
    <section className={styles.shell}>
      <div className={styles.hero}>
        <span className={styles.eyebrow}>Methodologie</span>
        <h1 className={styles.title}>Hoe deze shortlist wordt opgebouwd</h1>
        <p className={styles.subtitle}>
          Leegstandsradar gebruikt BAG als proxysignaal voor mogelijke
          leegstand, onderbenutting en conversiekans. Het instrument toont geen
          bevestigd leegstaand bestand.
        </p>
      </div>

      <div className={styles.grid}>
        <article className={styles.card}>
          <h2>Databronnen</h2>
          <p>
            De shortlist is gebaseerd op BAG-objecten via PDOK. Voor de
            kaartachtergrond gebruikt de app BRT en PDOK luchtfoto.
          </p>
          <ul>
            <li>BAG verblijfsobjecten en panden voor shortlist en status</li>
            <li>PDOK luchtfoto voor actuele orthobeelden</li>
            <li>Gemeenteselectie voor focus, niet voor bewijs van leegstand</li>
          </ul>
        </article>

        <article className={styles.card}>
          <h2>Wat de score doet</h2>
          <p>
            De potentieelscore combineert gebruiksdoel, status, bouwjaar en
            oppervlakte tot een pragmatische eerste screening voor
            conversiekansen.
          </p>
          <ul>
            <li>`Hoog`: sterke signalen voor nader onderzoek</li>
            <li>`Middel`: interessant, maar gemengd beeld</li>
            <li>`Laag`: zwakke match of beperkte haalbaarheid</li>
          </ul>
        </article>

        <article className={styles.card}>
          <h2>Belangrijkste beperking</h2>
          <p>
            BAG-status is administratief. Een object dat als `in gebruik`
            geregistreerd staat, kan in werkelijkheid deels leeg staan, en
            andersom.
          </p>
          <ul>
            <li>Geen directe meting van echte leegstand</li>
            <li>Geen eigendoms- of contractinformatie</li>
            <li>Altijd lokale verificatie nodig voor actie</li>
          </ul>
        </article>

        <article className={styles.card}>
          <h2>Volledige documentatie</h2>
          <p>
            De uitgebreide beschrijving van aannames, beperkingen en
            bronvermelding staat in het projectdocument.
          </p>
          <a
            href="https://github.com/thenorthsolution/lumen/blob/main/apps/vacancy/TOOL.md"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            Open TOOL.md op GitHub
          </a>
        </article>
      </div>
    </section>
  );
}
