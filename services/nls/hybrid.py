from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class HybridFilters:
    min_bouwjaar: int | None = None
    max_bouwjaar: int | None = None
    min_oppervlakte: float | None = None
    max_oppervlakte: float | None = None
    statuses: list[str] = field(default_factory=list)
    pand_statuses: list[str] = field(default_factory=list)
    gebruiksdoelen: list[str] = field(default_factory=list)
    score_tiers: list[str] = field(default_factory=list)


def derive_hybrid_filters(query: str) -> HybridFilters:
    q = query.lower()
    filters = HybridFilters()

    if any(term in q for term in ("gesloopt", "te slopen", "sloop", "demol")):
        filters.pand_statuses.extend(["Sloopvergunning verleend", "Pand gesloopt"])
    if any(term in q for term in ("leeg", "vacant", "buiten gebruik", "verlaten")):
        filters.statuses.append("Verblijfsobject buiten gebruik")
    if any(term in q for term in ("verbouwing", "renovatie", "renoveren")):
        filters.statuses.append("Verbouwing verblijfsobject")

    gebruiksdoelen = {
        "kantoor": "kantoorfunctie",
        "winkel": "winkelfunctie",
        "retail": "winkelfunctie",
        "school": "onderwijsfunctie",
        "onderwijs": "onderwijsfunctie",
        "industrie": "industriefunctie",
        "maatschappelijk": "bijeenkomstfunctie",
    }
    for term, mapped in gebruiksdoelen.items():
        if term in q and mapped not in filters.gebruiksdoelen:
            filters.gebruiksdoelen.append(mapped)

    if "hoog potentieel" in q:
        filters.score_tiers.append("hoog")
    if "middel potentieel" in q:
        filters.score_tiers.append("middel")

    explicit_years = [int(value) for value in re.findall(r"\b(19\d{2}|20\d{2})\b", q)]
    if explicit_years:
        if "na " in q or "vanaf " in q:
            filters.min_bouwjaar = max(explicit_years)
        elif "voor " in q or "tot " in q:
            filters.max_bouwjaar = min(explicit_years)

    explicit_area = re.findall(r"\b(\d{2,5})\s*(m2|m²|vierkante meter)\b", q)
    if explicit_area:
        area = float(explicit_area[0][0])
        if any(term in q for term in ("minimaal", "ten minste", "groter dan", "meer dan")):
            filters.min_oppervlakte = area
        elif any(term in q for term in ("maximaal", "kleiner dan", "minder dan")):
            filters.max_oppervlakte = area

    return filters
