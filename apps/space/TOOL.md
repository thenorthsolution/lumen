# Ruimtevinden — Methodologie & Databronnen

> **Samenvatting:** Ruimtevinden identificeert onderbenutte en bouwbare locaties op basis van BAG-gebruiksdoelen en bestemmingsplandata. Het vervangt geen planologisch onderzoek of marktscan.

---

## Wat dit instrument doet

Ruimtevinden maakt drie typen woningbouwkansen zichtbaar in Nederlandse gemeenten:

| Type | Definitie |
|------|-----------|
| **Inbreiding** | Kleine percelen (200–2.000 m²) met niet-residentieel gebruik, geschikt voor 1–40 woningen zonder bestemmingsplanwijziging |
| **Herbestemming** | Voormalige kantoor- of bedrijfslocaties in zones met gemengde bestemming, geschikt voor directe omzetting naar wonen |
| **Transformatie** | Grotere onderbenutte terreinen (>2.000 m²) die planprocedure vereisen maar substantieel woningbouwpotentieel hebben |

---

## Databronnen

### BAG (Basisregistratie Adressen en Gebouwen)
**Endpoint:** `https://service.pdok.nl/lv/bag/wfs/v2_0`  
**Licentie:** CC0  
**Gebruik:** Primaire bron voor locaties — gebruiksdoel, oppervlakte, bouwjaar, geometrie

### Ruimtelijkeplannen.nl (RO WFS)
**Endpoint:** `https://afnemers.ruimtelijkeplannen.nl/ruimtelijkeplannen/wfs`  
**Licentie:** Open  
**Gebruik:** Bestemmingsvlakken — type bestemming, naam, planidentificatie

---

## Kansclassificatie

### Inbreiding
Criteria:
- Gebruiksdoel: winkelfunctie of overige gebruiksfunctie
- Oppervlakte: 200–2.000 m²
- Bestemmingshoofdgroep: geen industriebestemming

Woningschatting: oppervlakte / 60 m² (conservatief)

### Herbestemming
Criteria:
- Gebruiksdoel: industriefunctie of kantoorfunctie
- Bestemmingshoofdgroep: gemengd of bedrijventerrein

Woningschatting: oppervlakte / 70 m²

### Transformatie
Criteria:
- Gebruiksdoel: industriefunctie of kantoorfunctie
- Oppervlakte: > 2.000 m²

Woningschatting: oppervlakte / 80 m² (conservatief voor gefaseerde ontwikkeling)

---

## Bekende beperkingen

1. **Geen ruimtelijke intersectie:** De classificatie gebruikt BAG-attributen, niet een geometrische overlay met bestemmingsplanvlakken. Dit wordt verbeterd in versie 2.0 via de pipeline (DuckDB + GeoParquet).

2. **Bestemmingsplan actualiteit:** Ruimtelijkeplannen.nl bevat plannen die soms jaren oud zijn. Gemeenten die de Omgevingswet al hebben ingevoerd publiceren onder het nieuwe DSO-stelsel — dekking is nog niet volledig.

3. **Woningschattingen:** De indicatieve woningaantallen zijn gebaseerd op gemiddelde eenheidsmaten. Werkelijke aantallen zijn afhankelijk van programma, bouwhoogte en stedenbouwkundige randvoorwaarden.

4. **Eigendom en beschikbaarheid:** Het instrument heeft geen inzicht in eigendomssituatie, huurcontracten of gemeentelijke grondposities.

5. **Stikstof en geluid:** Locaties in of nabij Natura 2000-gebieden of langs drukke wegen kunnen extra beperkingen kennen die niet in de classificatie zijn opgenomen.

---

## Versie

Classificatiemodel v1.0.0 — zie `lib/land-fetch.ts` voor de volledige logica.

---

*Ruimtevinden is een instrument van North Solution — thenorthsolution.com*
