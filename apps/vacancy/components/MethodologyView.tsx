"use client";

import styles from "./MethodologyView.module.css";

export function MethodologyView() {
  return (
    <section className={styles.shell}>
      <div className={styles.hero}>
        <span className={styles.eyebrow}>Trust layer</span>
        <h1 className={styles.title}>Publiek belang, bronuitleg en grenzen</h1>
        <p className={styles.subtitle}>
          Lumen toont publieke signalen over leegstand, ruimte en pijplijn
          zonder ze te verkopen als exploitatie-instrument. Elke score blijft
          een controleerbaar proxysignaal met bron, confidence en beperking.
        </p>
      </div>

      <div className={styles.grid}>
        <article className={styles.card}>
          <h2>Publieke kern</h2>
          <p>
            Informatie die helpt om het woningtekort te begrijpen blijft vrij
            beschikbaar wanneer publicatie veilig kan. Lumen bouwt geen
            betaalmuur rond publieke woningmarktzichtbaarheid.
          </p>
          <ul>
            <li>Geen login voor de publieke MVP-laag</li>
            <li>Geen betaalmuur voor publieke signalen</li>
            <li>Geen marktplaats of leadgeneratie</li>
          </ul>
        </article>

        <article className={styles.card}>
          <h2>Methodologie-register</h2>
          <p>
            Elke module moet tonen welke bron wordt gebruikt, hoe zeker het
            signaal is en welke lokale verificatie nodig blijft.
          </p>
          <ul>
            <li>Leegstand: BAG-proxy, geen bevestigde leegstand</li>
            <li>Ruimte: BAG + RO, geen juridisch bouwrecht</li>
            <li>Pijplijn: TenderNed + bekendmakingen, geen volledige markt</li>
          </ul>
        </article>

        <article className={styles.card}>
          <h2>Verboden gebruik</h2>
          <p>
            Lumen mag niet worden gebruikt voor buyer targeting, druk op
            bewoners, kwetsbare-groepsegmentatie, speculatieve acquisitielijsten
            of exclusieve controle over publieke signalen.
          </p>
          <ul>
            <li>Geen individuele druk of targeting</li>
            <li>Geen investerings- of acquisitielijst</li>
            <li>Geen claim dat proxydata feitelijk bewijs is</li>
          </ul>
        </article>

        <article className={styles.card}>
          <h2>Correcties en tegenspraak</h2>
          <p>
            Gemeenten, eigenaren, bewoners, onderzoekers en journalisten moeten
            onjuiste classificaties, verouderde brondata of misleidende
            conclusies kunnen melden.
          </p>
          <ul>
            <li>Fouten worden gecorrigeerd of zichtbaar beperkt</li>
            <li>Onzekerheid wordt gelabeld, niet verborgen</li>
            <li>Juridische documenten blijven counsel-review nodig hebben</li>
          </ul>
        </article>

        <article className={styles.card}>
          <h2>Bronnen en scoring</h2>
          <p>
            De huidige leegstandsscore combineert BAG-status, gebruiksdoel,
            bouwjaar en oppervlakte tot een eerste gemeentelijke shortlist.
          </p>
          <ul>
            <li>Hoog: sterke signalen voor nader onderzoek</li>
            <li>Middel: interessant, maar gemengd beeld</li>
            <li>Laag: beperkte match of lagere haalbaarheid</li>
          </ul>
        </article>

        <article className={styles.card}>
          <h2>Documentatie</h2>
          <p>
            De repo bevat de productcharter, data-use policy, access policy,
            methodology register en correction policy als governance drafts.
          </p>
          <a
            href="https://github.com/thenorthsolution/lumen/blob/main/apps/vacancy/TOOL.md"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.link}
          >
            Open technische methodologie
          </a>
        </article>
      </div>
    </section>
  );
}
