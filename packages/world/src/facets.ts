import type { Provenance, WorldEntity } from "./index";

export type EntityFacetId = "overview" | "environment" | "energy" | "market" | "planning" | "opportunities" | "buildability" | "accessibility" | "delivery" | "population" | "housing" | "amenities" | "projects" | "program" | "documents" | "history";

export interface EntityFacetValue {
  key: string;
  label: string;
  value: string | number | boolean;
  provenance: readonly Provenance[];
}

export interface EntityFacet {
  id: EntityFacetId;
  availability: "available" | "partial" | "missing";
  values: readonly EntityFacetValue[];
  missing: readonly { key: string; label: string }[];
}

const labels: Readonly<Record<string, string>> = {
  identificatie: "Registratie-ID", status: "Status", documentdatum: "BAG-mutatie", bouwjaar: "Bouwjaar", oppervlakte: "Oppervlakte", areaM2: "Oppervlakte", kadastraleOppervlakteM2: "Kadastrale oppervlakte", sectie: "Sectie", perceelnummer: "Perceelnummer", kadastraleGemeente: "Kadastrale gemeente", gebruiksdoel: "Gebruiksdoel",
  energielabel: "Energielabel", energyLabel: "Energielabel", wozValue: "WOZ-waarde", transactionPrice: "Transactieprijs", permittedUse: "Gebruik toegestaan",
  buildProhibition: "Bouwverbod", contaminated: "Bodemverontreiniging", floodRisk: "Overstromingsrisico", accessAvailable: "Ontsluiting beschikbaar",
  ownershipCount: "Aantal eigenaren", score: "Kansscore", candidate: "Kandidaat", estimatedHomes: "Indicatief aantal woningen", methodology: "Methode",
  population: "Inwoners", households: "Huishoudens", housingStock: "Woningvoorraad", projectPhase: "Projectfase", responsibleParty: "Verantwoordelijke",
};

const keysByFacet: Readonly<Record<EntityFacetId, readonly string[]>> = {
  overview: ["identificatie", "status", "documentdatum", "bouwjaar", "oppervlakte", "areaM2", "kadastraleOppervlakteM2", "kadastraleGemeente", "sectie", "perceelnummer", "gebruiksdoel"],
  environment: ["floodRisk", "contaminated"], energy: ["energielabel", "energyLabel"], market: ["wozValue", "transactionPrice"],
  planning: ["permittedUse", "buildProhibition"], opportunities: ["score", "candidate", "estimatedHomes", "methodology"],
  buildability: ["areaM2", "oppervlakte", "kadastraleOppervlakteM2", "permittedUse", "buildProhibition", "contaminated", "floodRisk", "accessAvailable", "ownershipCount"],
  accessibility: ["accessAvailable"], delivery: ["ownershipCount", "projectPhase", "responsibleParty"],
  population: ["population", "households"], housing: ["housingStock"], amenities: [], projects: ["projectPhase", "responsibleParty"],
  program: ["estimatedHomes", "projectPhase"], documents: [], history: ["status"],
};

export function buildEntityFacet(entity: WorldEntity, id: EntityFacetId): EntityFacet {
  const keys = keysByFacet[id];
  const seen = new Set<string>();
  const values = keys.flatMap((key) => {
    const value = entity.properties[key];
    if (value === null || value === undefined || value === "" || seen.has(key)) return [];
    seen.add(key);
    return [{ key, label: labels[key] ?? key, value, provenance: entity.provenance }];
  });
  const missing = keys.filter((key) => !seen.has(key)).map((key) => ({ key, label: labels[key] ?? key }));
  return { id, availability: values.length === 0 ? "missing" : missing.length === 0 ? "available" : "partial", values, missing };
}
