/**
 * @lumen/bag-utils — viability scoring model
 *
 * Scores vacant or underused buildings on their realistic potential
 * for housing conversion. Used by leegstandsradar.nl.
 *
 * METHODOLOGY
 * -----------
 * The model applies a simple additive scoring system based on proxy
 * signals from BAG and WOZ data. It intentionally avoids false
 * precision — the output is Low / Medium / High, not a percentage.
 *
 * Each criterion is documented with its rationale and data source.
 * The model is public, versioned, and open to community critique.
 * See packages/bag-utils/SCORING.md for the full methodology.
 *
 * KNOWN LIMITATIONS
 * -----------------
 * - Bouwbesluit compliance cost is not modelled (requires site survey)
 * - Asbestos risk (pre-1994 buildings) is flagged but not scored
 * - Actual vacancy is not confirmed — BAG status is a proxy signal
 * - Monument status lookup requires separate API call (marked optional)
 *
 * VERSION: 1.0.0
 */

export interface VboInput {
  /** BAG identificatie */
  identificatie: string;
  bouwjaar: number;
  /** m² gebruiksoppervlakte */
  oppervlakte: number;
  gebruiksdoel: string;
  /** BAG verblijfsobject status */
  vboStatus?: string;
  /** BAG pand status */
  pandStatus?: string;
  /** WOZ value in euros (optional — improves score accuracy) */
  wozWaarde?: number;
  /** Gemeente median WOZ per m² (optional) */
  gemeenteMediaanWozPerM2?: number;
  /** Whether a monument designation exists */
  isMonument?: boolean;
  /** Whether a recent (< 3yr) renovation permit exists */
  hasRecentRenovatievergunning?: boolean;
}

export type ViabilityTier = "hoog" | "middel" | "laag" | "uitgesloten";

export interface ScoringCriterion {
  key: string;
  label: string;
  points: number;
  maxPoints: number;
  rationale: string;
  dataSource: string;
}

export interface ViabilityScore {
  identificatie: string;
  tier: ViabilityTier;
  totalPoints: number;
  maxPossiblePoints: number;
  criteria: ScoringCriterion[];
  /** Human-readable explanation of the tier assignment */
  explanation: string;
  /** Flags that don't affect score but should be surfaced in UI */
  warnings: string[];
}

const TIER_THRESHOLDS: Record<ViabilityTier, number> = {
  hoog: 4,
  middel: 2,
  laag: 0,
  uitgesloten: -999,
};

/**
 * Score a single verblijfsobject for housing conversion viability.
 *
 * Returns `null` if the object is categorically excluded
 * (monument, recent renovation, already residential).
 */
export function scoreViability(input: VboInput): ViabilityScore {
  const criteria: ScoringCriterion[] = [];
  const warnings: string[] = [];
  let excluded = false;

  // --- Hard exclusions (score not computed) ---
  if (input.isMonument) {
    excluded = true;
    criteria.push({
      key: "monument",
      label: "Monumentstatus",
      points: -3,
      maxPoints: 0,
      rationale:
        "Monumenten vereisen specialistische aanpak en zijn financieel vrijwel niet rendabel voor standaardconversie.",
      dataSource: "Monumentenregister (RCE)",
    });
  }

  if (input.hasRecentRenovatievergunning) {
    excluded = true;
    criteria.push({
      key: "renovatie",
      label: "Recente vergunning",
      points: -2,
      maxPoints: 0,
      rationale:
        "Object heeft een recente renovatievergunning — waarschijnlijk al in transformatie.",
      dataSource: "Omgevingsloket",
    });
  }

  if (input.gebruiksdoel === "woonfunctie") {
    excluded = true;
    criteria.push({
      key: "al_wonen",
      label: "Al woonfunctie",
      points: 0,
      maxPoints: 0,
      rationale: "Object heeft al een woonfunctie en valt buiten de scope.",
      dataSource: "BAG gebruiksdoel",
    });
  }

  if (excluded) {
    const total = criteria.reduce((s, c) => s + c.points, 0);
    return {
      identificatie: input.identificatie,
      tier: "uitgesloten",
      totalPoints: total,
      maxPossiblePoints: 0,
      criteria,
      explanation:
        "Object is uitgesloten van scoring op basis van een harde uitsluitingsgrond.",
      warnings,
    };
  }

  // --- Criterion 1: Status signal ---
  let statusPoints = 0;
  let statusRationale =
    "Geen aanvullend status-signaal uit BAG. Beoordeel object primair op type, schaal en lokale context.";

  switch (input.vboStatus) {
    case "Verblijfsobject buiten gebruik":
      statusPoints += 3;
      statusRationale =
        "Object staat administratief buiten gebruik. Dit is het sterkste BAG-signaal voor leegstand of stilstand.";
      break;
    case "Verblijfsobject gevormd":
      statusPoints += 2;
      statusRationale =
        "Object is gevormd maar nog niet in gebruik. Dit kan onbenutte of nog niet gerealiseerde capaciteit aanduiden.";
      break;
    case "Niet gerealiseerd verblijfsobject":
      statusPoints += 1;
      warnings.push(
        "Niet gerealiseerd verblijfsobject: plan of vergunning is niet tot gebruik gekomen. Controleer waarom ontwikkeling is stilgevallen.",
      );
      statusRationale =
        "Niet gerealiseerde objecten kunnen wijzen op stilgevallen plannen of onbenutte capaciteit.";
      break;
    case "Verblijfsobject ingetrokken":
      statusPoints += 1;
      warnings.push(
        "Verblijfsobject ingetrokken: adres of eenheid bestaat niet meer zelfstandig. Controleer of oppervlak of programma elders is samengevoegd.",
      );
      statusRationale =
        "Ingetrokken eenheden kunnen duiden op samengevoegde of verdwenen programmatische capaciteit.";
      break;
    case "Verbouwing verblijfsobject":
      statusPoints -= 2;
      warnings.push(
        "Object staat in verbouwing. Dit is minder kansrijk als directe interventie, omdat al aan het pand wordt gewerkt.",
      );
      statusRationale =
        "Actieve verbouwing verlaagt de kans op een directe opportunity, omdat transformatie mogelijk al loopt.";
      break;
    case "Verblijfsobject in gebruik":
    case "Verblijfsobject in gebruik (niet ingemeten)":
      warnings.push(
        "BAG markeert dit object als in gebruik. Dat sluit onderbenutting niet uit, maar is geen direct leegstandssignaal.",
      );
      statusRationale =
        "Status in gebruik is geen leegstandsbevestiging, maar sluit onderbenutting of herpositionering niet uit.";
      break;
  }

  switch (input.pandStatus) {
    case "Sloopvergunning verleend":
      statusPoints += 2;
      warnings.push(
        "Pand heeft een sloopvergunning. Dit kan een herontwikkelkans zijn, maar vraagt een andere strategie dan pure gebouwconversie.",
      );
      break;
    case "Bouwvergunning verleend":
      statusPoints += 1;
      warnings.push(
        "Pand heeft een actieve bouwvergunning. Mogelijk bestaat hier nog ongebouwde of wijzigbare capaciteit.",
      );
      break;
    case "Bouw gestart":
      statusPoints -= 1;
      warnings.push(
        "Bouw is gestart. Dit object is minder kansrijk als directe opportunity omdat uitvoering al loopt.",
      );
      break;
    case "Pand gesloopt":
      statusPoints -= 1;
      warnings.push(
        "Pand is al gesloopt. Dit is eerder een grondpositie dan een gebouwconversie-opportunity.",
      );
      break;
  }

  criteria.push({
    key: "status",
    label: "Statussignaal",
    points: statusPoints,
    maxPoints: 3,
    rationale: statusRationale,
    dataSource: "BAG verblijfsobject / pand status",
  });

  // --- Criterion 2: Bouwjaar ---
  // Post-1990 buildings are closer to current Bouwbesluit standards.
  // Pre-1994 may contain asbestos — flagged as warning.
  let bouwjaarPoints = 0;
  if (input.bouwjaar >= 1990) {
    bouwjaarPoints = 2;
  } else if (input.bouwjaar >= 1975) {
    bouwjaarPoints = 1;
  }
  if (input.bouwjaar < 1994) {
    warnings.push(
      "Gebouwd voor 1994: mogelijk asbest aanwezig. Altijd laten onderzoeken voor aanvang werkzaamheden.",
    );
  }
  criteria.push({
    key: "bouwjaar",
    label: "Bouwjaar",
    points: bouwjaarPoints,
    maxPoints: 2,
    rationale:
      "Recentere gebouwen zijn dichter bij huidige Bouwbesluit-normen (ventilatie, isolatie, brandcompartimentering).",
    dataSource: "BAG bouwjaar",
  });

  // --- Criterion 3: Schaal (oppervlakte) ---
  // 500–3000 m² is the optimal range for residential conversion.
  // Too small: uneconomical. Too large: phased conversion complexity.
  let schaalPoints = 0;
  if (input.oppervlakte >= 500 && input.oppervlakte <= 3000) {
    schaalPoints = 2;
  } else if (input.oppervlakte >= 300 && input.oppervlakte < 500) {
    schaalPoints = 1;
  } else if (input.oppervlakte > 3000 && input.oppervlakte <= 6000) {
    schaalPoints = 1;
    warnings.push(
      "Grote vloeroppervlakte: gefaseerde conversie of splitsen in deelprojecten kan nodig zijn.",
    );
  }
  criteria.push({
    key: "schaal",
    label: "Vloeroppervlak",
    points: schaalPoints,
    maxPoints: 2,
    rationale:
      "500–3.000 m² is de optimale schaal voor rendabele woningconversie (15–40 woningen bij 40–80 m² per woning).",
    dataSource: "BAG oppervlakte",
  });

  // --- Criterion 4: WOZ relatief aan gemeente mediaan ---
  // Lower WOZ per m² relative to municipality median = lower acquisition cost
  let wozPoints = 0;
  if (
    input.wozWaarde !== undefined &&
    input.gemeenteMediaanWozPerM2 !== undefined &&
    input.oppervlakte > 0
  ) {
    const wozPerM2 = input.wozWaarde / input.oppervlakte;
    const ratio = wozPerM2 / input.gemeenteMediaanWozPerM2;
    if (ratio < 0.8) {
      wozPoints = 1;
    }
  } else {
    warnings.push("WOZ-waarde niet beschikbaar — WOZ-criterium niet gescoord.");
  }
  criteria.push({
    key: "woz",
    label: "WOZ relatief",
    points: wozPoints,
    maxPoints: 1,
    rationale:
      "Een WOZ-waarde onder de gemeentelijke mediaan per m² wijst op een lagere verwervingsprijs.",
    dataSource: "WOZ open data / CBS",
  });

  const totalPoints = criteria.reduce((s, c) => s + c.points, 0);
  const maxPossible = criteria.reduce((s, c) => s + c.maxPoints, 0);

  let tier: ViabilityTier;
  if (totalPoints >= TIER_THRESHOLDS.hoog) {
    tier = "hoog";
  } else if (totalPoints >= TIER_THRESHOLDS.middel) {
    tier = "middel";
  } else {
    tier = "laag";
  }

  const explanations: Record<ViabilityTier, string> = {
    hoog: "Sterke indicatoren voor haalbare woningconversie. Aanbevolen voor nader onderzoek.",
    middel:
      "Gemengd beeld. Conversie mogelijk haalbaar maar vereist diepgaander analyse van bouwkundige staat.",
    laag: "Beperkte haalbaarheid op basis van beschikbare data. Niet uitsluiten zonder lokale verificatie.",
    uitgesloten: "",
  };

  return {
    identificatie: input.identificatie,
    tier,
    totalPoints,
    maxPossiblePoints: maxPossible,
    criteria,
    explanation: explanations[tier] ?? "",
    warnings,
  };
}

/**
 * Score a batch of verblijfsobjecten.
 * Returns results sorted by totalPoints descending.
 */
export function scoreBatch(inputs: VboInput[]): ViabilityScore[] {
  return inputs
    .map(scoreViability)
    .sort((a, b) => b.totalPoints - a.totalPoints);
}

/** Count results by tier */
export function countByTier(
  scores: ViabilityScore[],
): Record<ViabilityTier, number> {
  return scores.reduce(
    (acc, s) => {
      acc[s.tier] = (acc[s.tier] ?? 0) + 1;
      return acc;
    },
    { hoog: 0, middel: 0, laag: 0, uitgesloten: 0 } as Record<
      ViabilityTier,
      number
    >,
  );
}
