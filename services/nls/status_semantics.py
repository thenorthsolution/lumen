from __future__ import annotations

from collections.abc import Iterable

STATUS_SEMANTICS: dict[str, tuple[str, ...]] = {
    "Verblijfsobject gevormd": (
        "nieuw gevormd verblijfsobject",
        "nog niet gerealiseerd",
        "planfase",
        "onbenutte capaciteit",
        "bouwvergunning verleend",
    ),
    "Niet gerealiseerd": (
        "niet gerealiseerd",
        "geannuleerd plan",
        "afgevallen ontwikkeling",
        "zombie plot",
    ),
    "Verblijfsobject in gebruik": (
        "in gebruik",
        "officieel bezet",
        "mogelijk onderbenut",
    ),
    "In gebruik (niet ingemeten)": (
        "in gebruik",
        "niet ingemeten",
        "nog niet definitief ingemeten",
    ),
    "Verblijfsobject buiten gebruik": (
        "buiten gebruik",
        "leegstaand",
        "verlaten",
        "officieel vacant",
    ),
    "Verbouwing verblijfsobject": (
        "verbouwing",
        "renovatie bezig",
        "werk in uitvoering",
    ),
    "Verblijfsobject ingetrokken": (
        "ingetrokken",
        "adres vervallen",
        "samengevoegd of verwijderd",
        "verloren vierkante meters",
    ),
    "Bouwvergunning verleend": (
        "bouwvergunning verleend",
        "nieuwbouw toegestaan",
        "project kan starten",
    ),
    "Bouw gestart": (
        "bouw gestart",
        "in aanbouw",
        "ontwikkeling bezig",
    ),
    "Pand in gebruik": (
        "pand in gebruik",
        "gebouw operationeel",
        "mogelijk onderbenut",
    ),
    "Sloopvergunning verleend": (
        "sloopvergunning verleend",
        "gaat gesloopt worden",
        "te slopen pand",
        "demolition planned",
    ),
    "Pand gesloopt": (
        "pand gesloopt",
        "leeg terrein",
        "gebouw verdwenen",
    ),
}

GEBRUIKSDOEL_SEMANTICS: dict[str, tuple[str, ...]] = {
    "kantoorfunctie": ("kantoor", "office", "werkplekken"),
    "winkelfunctie": ("winkel", "retail", "winkelpand"),
    "bijeenkomstfunctie": ("bijeenkomst", "maatschappelijk", "zaal"),
    "onderwijsfunctie": ("onderwijs", "school", "lesgebouw"),
    "industriefunctie": ("industrie", "bedrijfsruimte", "productie"),
    "woonfunctie": ("wonen", "residentieel", "woning"),
}


def semantic_tokens(value: str | None) -> list[str]:
    if not value:
        return []
    tokens = list(STATUS_SEMANTICS.get(value, ()))
    tokens.extend(GEBRUIKSDOEL_SEMANTICS.get(value.lower(), ()))
    return tokens


def semantic_blob(values: Iterable[str | None]) -> str:
    unique: list[str] = []
    for value in values:
        for token in semantic_tokens(value):
            if token not in unique:
                unique.append(token)
    return ", ".join(unique)
