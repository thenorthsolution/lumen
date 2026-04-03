# Leegstandsradar — Methodologie & Databronnen

> **Samenvatting:** Leegstandsradar gebruikt openbare BAG-data als proxysignaal voor leegstand. Het toont geen bevestigde leegstand. Altijd lokaal verifiëren voor actie.

---

## Wat dit instrument doet

Leegstandsradar toont gebouwen in Nederlandse gemeenten die op basis van BAG-data mogelijk leeg of onderbezet zijn, en beoordeelt hun haalbaarheid voor woningconversie.

Het instrument is bedoeld voor:

- Gemeentelijk planners en woningcorporaties die een eerste verkenning willen doen
- Ontwikkelaars die potentiële conversiepanden identificeren
- Onderzoekers en journalisten die leegstand willen kwantificeren
- Studenten en burgers die inzicht willen in lokale leegstand

---

## Databron: BAG (Basisregistratie Adressen en Gebouwen)

**Endpoint:** `https://service.pdok.nl/lv/bag/wfs/v2_0`  
**Licentie:** Open data — CC0 (publiek domein)  
**Bijgewerkt:** Dagelijks door het Kadaster  
**Documentatie:** https://www.geobasisregistraties.nl/basisregistraties/adressen-en-gebouwen

### Welke BAG-velden worden gebruikt

| Veld           | Gebruik                                 |
| -------------- | --------------------------------------- |
| `status`       | Primaire leegstandsindicator            |
| `gebruiksdoel` | Filter op conversierelevante functies   |
| `bouwjaar`     | Bouwbesluit-nabijheid scoringscriterium |
| `oppervlakte`  | Schaal scoringscriterium                |
| `gemeentecode` | Geografische scope                      |
| `geometrie`    | Kaartweergave                           |

### Gebruikte statuswaarden als indicator

- `Verbouwing` — verbouwingsstatus kan op leegstand wijzen, maar ook op actieve renovatie
- `Verblijfsobject buiten gebruik` — sterkere indicator, maar zeldzaam in BAG

**Belangrijk:** BAG-status is een administratief gegeven, geen operationele meting. Een pand kan in gebruik zijn terwijl de status verouderd is, en vice versa.

---

## Haalbaarheidsmodel (versie 1.0.0)

Het model scoort elk verblijfsobject op drie criteria. De broncode is volledig openbaar in `packages/bag-utils/src/viability.ts`.

### Criteria

| Criterium                    | Max. punten | Rationale                                                                            |
| ---------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| Bouwjaar ≥ 1990              | +2          | Dichterbij huidige Bouwbesluit-normen (ventilatie, brandcompartimentering, isolatie) |
| Bouwjaar 1975–1989           | +1          | Deels voldoende, aanpassingen vereist                                                |
| Oppervlak 500–3.000 m²       | +2          | Optimale schaal voor 10–40 woningen bij 40–80 m²/woning                              |
| Oppervlak 300–499 m²         | +1          | Klein maar haalbaar                                                                  |
| WOZ/m² onder gemeentemediaan | +1          | Lagere verwervingsdrempel                                                            |

### Uitsluitingen (score niet berekend)

- Rijksmonumenten en gemeentelijke monumenten
- Objecten met recente renovatievergunning (< 3 jaar)
- Objecten met woonfunctie (al residentieel)

### Tiers

| Tier   | Puntentotaal | Betekenis                                           |
| ------ | ------------ | --------------------------------------------------- |
| Hoog   | ≥ 4          | Sterke indicatoren; aanbevolen voor nader onderzoek |
| Middel | 2–3          | Gemengd beeld; diepgaandere analyse gewenst         |
| Laag   | 0–1          | Beperkte haalbaarheid op basis van beschikbare data |

### Wat het model niet weet

- Werkelijke staat van het gebouw (alleen een bouwinspectie geeft uitsluitsel)
- Aanwezigheid van asbest (pre-1994 gebouwen worden gewaarschuwd, niet uitgesloten)
- Eigendomssituatie en beschikbaarheid
- Actuele huurcontracten of tijdelijk gebruik
- Kosten van specifieke aanpassingen (HVAC, liften, brandveiligheid)

---

## Bekende beperkingen

1. **BAG-actualiteit:** Statuswijzigingen worden niet altijd direct doorgevoerd. Een leegstaand pand kan maanden als "in gebruik" geregistreerd staan.

2. **WOZ-data:** WOZ-waardes per object zijn niet nationaal openbaar beschikbaar. Het WOZ-criterium scoort alleen als de gemeente data publiceert via CBS of eigen open data portals. Wanneer niet beschikbaar, wordt dit als waarschuwing getoond.

3. **Geometrie:** BAG-geometrieën zijn pandgrenzen, geen perceelgrenzen. Het werkelijke beschikbare perceel kan groter of kleiner zijn.

4. **Dekking:** Het instrument bevraagt maximaal 5.000 objecten per gemeente. In grote steden (Amsterdam, Rotterdam) kan dit betekenen dat niet alle objecten worden getoond.

5. **Nitrogen:** Leegstandsradar houdt geen rekening met stikstofgevoelige gebieden. Een haalbaar pand in een Natura 2000-nabijheidszone kan toch niet of beperkt converteerbaar zijn.

---

## Data melden

Elke kaartmarkering heeft een knop "Rapporteer dataprobleem". Meldingen worden opgeslagen in een openbare Supabase-tabel en periodiek beoordeeld. Bijdragen kunnen leiden tot uitsluiting van onjuist geclassificeerde objecten in toekomstige versies.

---

## Bijdragen aan het model

Het haalbaarheidsmodel (`packages/bag-utils/src/viability.ts`) is uitdrukkelijk bedoeld als community-eigendom. Verbeteringen zijn welkom via GitHub Pull Request, inclusief:

- Aanvullende criteria (parkeernormen, floorplanhaalbaarheidssignalen)
- Kalibratie van drempelwaarden op basis van gerealiseerde conversies
- Uitbreiding naar andere BAG-objecttypen (bijv. maatschappelijk vastgoed)

Zie `CONTRIBUTING.md` voor de bijdragerichtlijnen.

---

## Licentie

Broncode: GNU 3.0  
Datagebruik: BAG-data is CC0. Gebruik en verdere distributie zijn vrij, zonder attributieverplichting.

---

_Leegstandsradar is een instrument van North Solution — thenorthsolution.com_  
_GitHub: https://github.com/thenorthsolution/lumen_
