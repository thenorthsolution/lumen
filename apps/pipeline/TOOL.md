# Bouwcapaciteitcheck — Methodologie & Databronnen

> **Samenvatting:** Bouwcapaciteitcheck toont een regionale pijplijnkaart van publiek aanbestede woningbouwprojecten. Het dekt private sector opdrachten niet, en meet geen daadwerkelijke arbeidscapaciteit.

---

## Wat dit instrument doet

Bouwcapaciteitcheck aggregeert openbaar aanbestede woningbouwprojecten via TenderNed en visualiseert:

- **Kaartweergave** — choropleth per provincie: relatieve tenderactiviteit als heatmap
- **Tijdlijn** — maandelijkse tendervolumes over de afgelopen 12 maanden
- **Tabel** — gesorteerd regionaal overzicht met trend- en knelpuntsignalen

Het instrument ondersteunt de these dat het capaciteitsprobleem in de bouw primair een coördinatieprobleem is: aannemers kunnen de pijplijn niet voorspellen, dus investeren ze niet. Zichtbaarheid van de pijplijn is een eerste stap naar vertrouwen.

---

## Databron: TenderNed

**API base:** `https://www.tenderned.nl/papi/tenderned-rs-tns/v2`  
**Licentie:** Openbare data — vrij herbruikbaar  
**Documentatie:** https://www.tenderned.nl/cms/nl/over-tenderned/api

### CPV-filtercodes

| Code     | Omschrijving                                 |
| -------- | -------------------------------------------- |
| 45211000 | Bouw van woningen en woongebouwen (algemeen) |
| 45211100 | Bouw van huizen                              |
| 45211200 | Bouw van houten woningen                     |
| 45211300 | Bouw van flatgebouwen                        |
| 45211340 | Bouw van meergezinswoningen                  |
| 45211350 | Multifunctionele gebouwen                    |

### Wat TenderNed wél bevat

- Aanbestedingen door gemeenten, woningcorporaties, Rijksvastgoedbedrijf
- Projecten boven de Europese aanbestedingsdrempel (~€5,3M voor werken)
- Aanbestedingen door woningcorporaties die conform Woningwet aanbesteden

### Wat TenderNed níet bevat

- Private sector woningbouw door commerciële ontwikkelaars
- Projecten onder de aanbestedingsdrempel (~80% van alle woningbouwprojecten naar aantallen)
- Onderhandse opdrachten aan vaste aannemers

**Conclusie:** TenderNed-data is een indicatief signaal voor de publieke pijplijn, geen volledig beeld van de totale bouwactiviteit.

---

## Activiteitsscore

De choroplethkaart toont een genormaliseerde activiteitsscore per provincie:

```
activiteitscore = actieve_tenders / max(actieve_tenders, alle provincies)
```

Dit is een relatieve maat. Een score van 1.0 betekent de meest actieve provincie in de dataset, niet een absolute referentienorm.

---

## Knelpuntsignaal

Provincies worden als knelpunt gemarkeerd op basis van twee criteria:

1. **Lage tenderactiviteit** (score < 0.15) in combinatie met
2. **Hoge woningvraag** — operationeel gedefinieerd als de Randstad-provincies (Noord-Holland, Zuid-Holland, Utrecht)

Dit is een heuristiek op basis van structurele kennis over woningvraagconcentratie. Een verfijnder model zou vraagdata van ABF Research of CBS integreren. Bijdragen welkom via GitHub.

---

## Trendberekening

Trend per provincie wordt bepaald door de eerste helft van de trailing-12-maanden tenders te vergelijken met de tweede helft:

- **Groeiend:** tweede helft > eerste helft × 1,2
- **Krimpend:** tweede helft < eerste helft × 0,8
- **Stabiel:** anders

Bij kleine aantallen (< 5 tenders) is deze berekening weinig betrouwbaar — de score wordt dan als stabiel weergegeven.

---

## Mockdata

Wanneer de TenderNed API tijdelijk niet bereikbaar is, valt het instrument terug op representatieve voorbeelddata. Dit wordt zichtbaar weergegeven als "voorbeelddata" in de interface (geel badge in topbar, vermelding in statbar).

De mockdata heeft dezelfde structuur als echte TenderNed-data. Specifieke projecttitels, opdrachtgevers en bedragen zijn fictief maar representatief voor het normale datapatroon.

---

## Bekende beperkingen

1. **Dekking:** TenderNed dekt slechts een fractie van de werkelijke bouwactiviteit. Interpreteer als richting, niet als absolute meting.
2. **Vertraging:** Aanbestedingspublicaties volgen op de gunning, niet op de start van de bouw. De pijplijn in dit instrument loopt 3-12 maanden achter op de daadwerkelijke bouwstart.
3. **Gecombineerde CPV-codes:** Sommige tenders bevatten zowel woningbouw als utiliteitscomponenten. Het instrument filtert op CPV-hoofdcode — overfiltering en onderfiltering zijn beide mogelijk.
4. **Geografische toewijzing:** Regio-indeling is gebaseerd op NUTS-3-codes in TenderNed. Niet alle tenders bevatten een NUTS-code.

---

## Bijdragen

Verbeteringen aan de knelpuntheuristiek, vraagdataIntegratie (ABF, CBS), en uitbreiding met omgevingsvergunningendata (Omgevingsloket) zijn welkom via GitHub Pull Request.

Zie [CONTRIBUTING.md](../../CONTRIBUTING.md) voor richtlijnen.

---

_Bouwcapaciteitcheck is een instrument van North Solution — thenorthsolution.com_  
_GitHub: https://github.com/thenorthsolution/lumen_
