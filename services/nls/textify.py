from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .status_semantics import semantic_blob


def stringify_bag_record(record: Mapping[str, Any]) -> str:
    gebruiksdoel = _string(record.get("gebruiksdoel"))
    status = _string(record.get("status"))
    pand_status = _string(record.get("pand_status") or record.get("pandStatus"))
    gemeente = _string(record.get("gemeente_name") or record.get("gemeente"))
    woonplaats = _string(record.get("woonplaatsnaam") or record.get("woonplaats"))
    score_tier = _string(record.get("score_tier"))
    pand_id = _string(record.get("pand_identificatie") or record.get("pandIdentificatie"))
    object_id = _string(record.get("vbo_identificatie") or record.get("identificatie") or record.get("id"))
    bouwjaar = _int(record.get("bouwjaar"))
    oppervlakte = _float(record.get("oppervlakte"))

    age_bucket = (
        "nieuw gebouw"
        if bouwjaar and bouwjaar >= 2015
        else "relatief nieuw gebouw"
        if bouwjaar and bouwjaar >= 1990
        else "ouder gebouw"
        if bouwjaar and bouwjaar >= 1945
        else "historisch of vooroorlogs gebouw"
        if bouwjaar
        else "bouwjaar onbekend"
    )
    size_bucket = (
        "zeer groot pand"
        if oppervlakte >= 5000
        else "groot pand"
        if oppervlakte >= 1000
        else "middelgroot pand"
        if oppervlakte >= 300
        else "klein pand"
        if oppervlakte > 0
        else "oppervlakte onbekend"
    )

    semantic_text = semantic_blob([status, pand_status, gebruiksdoel])
    parts = [
        f"BAG record {object_id}".strip(),
        f"Pand {pand_id}".strip(),
        f"In {woonplaats}, gemeente {gemeente}".strip(", "),
        f"Gebruiksdoel {gebruiksdoel or 'onbekend'}",
        f"Verblijfsobject status {status or 'onbekend'}",
        f"Pand status {pand_status or 'onbekend'}",
        f"Bouwjaar {bouwjaar}" if bouwjaar else "Bouwjaar onbekend",
        f"Oppervlakte {int(oppervlakte)} vierkante meter"
        if oppervlakte > 0
        else "Oppervlakte onbekend",
        age_bucket,
        size_bucket,
        f"Score tier {score_tier}" if score_tier else "",
        f"Semantische hints: {semantic_text}" if semantic_text else "",
        _narrative_hint(gebruiksdoel, status, pand_status, bouwjaar, oppervlakte),
    ]
    return ". ".join(part for part in parts if part)


def _narrative_hint(
    gebruiksdoel: str,
    status: str,
    pand_status: str,
    bouwjaar: int,
    oppervlakte: float,
) -> str:
    snippets: list[str] = []

    if oppervlakte >= 1000:
        snippets.append("Dit is een groot pand met veel bruikbare vloeroppervlakte")
    elif oppervlakte >= 300:
        snippets.append("Dit pand heeft voldoende schaal voor herontwikkeling")

    if bouwjaar >= 2015:
        snippets.append("Het gebouw is nieuw of recent gebouwd")
    elif bouwjaar and bouwjaar < 1950:
        snippets.append("Het gebouw is oud en mogelijk lastig aanpasbaar")

    if "Sloopvergunning verleend" in {status, pand_status}:
        snippets.append("Er zijn aanwijzingen dat het gebouw gesloopt gaat worden")
    if "buiten gebruik" in status.lower():
        snippets.append("Het object staat administratief buiten gebruik en kan leegstaan")
    if gebruiksdoel == "kantoorfunctie":
        snippets.append("Het gaat om een kantoorpand of kantoorvolume")
    if gebruiksdoel == "winkelfunctie":
        snippets.append("Het gaat om een winkelpand of retailobject")

    return ". ".join(snippets)


def _string(value: Any) -> str:
    return str(value or "").strip()


def _int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0

