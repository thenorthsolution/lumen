#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import psycopg
from pgvector import Vector

from .db import ensure_nls_database_ready
from .embedder import DEFAULT_MODEL, Embedder
from .textify import stringify_bag_record

BAG_OGC_BASE = "https://api.pdok.nl/kadaster/bag/ogc/v2"
GEMEENTEN_JSON_PATH = Path("packages/pdok-client/src/gemeenten.generated.json")
PAGE_LIMIT = 10000

CONVERSION_ELIGIBLE_DOELEN = {
    "kantoorfunctie",
    "winkelfunctie",
    "bijeenkomstfunctie",
    "onderwijsfunctie",
    "industriefunctie",
}

UPSERT_SQL = """
INSERT INTO bag_search_index (
  id,
  vbo_identificatie,
  pand_identificatie,
  gemeente_code,
  gemeente_name,
  woonplaatsnaam,
  gebruiksdoel,
  status,
  pand_status,
  score_tier,
  bouwjaar,
  oppervlakte,
  lon,
  lat,
  search_text,
  embedding
) VALUES (
  %(id)s,
  %(vbo_identificatie)s,
  %(pand_identificatie)s,
  %(gemeente_code)s,
  %(gemeente_name)s,
  %(woonplaatsnaam)s,
  %(gebruiksdoel)s,
  %(status)s,
  %(pand_status)s,
  %(score_tier)s,
  %(bouwjaar)s,
  %(oppervlakte)s,
  %(lon)s,
  %(lat)s,
  %(search_text)s,
  %(embedding)s
)
ON CONFLICT (id) DO UPDATE SET
  vbo_identificatie = EXCLUDED.vbo_identificatie,
  pand_identificatie = EXCLUDED.pand_identificatie,
  gemeente_code = EXCLUDED.gemeente_code,
  gemeente_name = EXCLUDED.gemeente_name,
  woonplaatsnaam = EXCLUDED.woonplaatsnaam,
  gebruiksdoel = EXCLUDED.gebruiksdoel,
  status = EXCLUDED.status,
  pand_status = EXCLUDED.pand_status,
  score_tier = EXCLUDED.score_tier,
  bouwjaar = EXCLUDED.bouwjaar,
  oppervlakte = EXCLUDED.oppervlakte,
  lon = EXCLUDED.lon,
  lat = EXCLUDED.lat,
  search_text = EXCLUDED.search_text,
  embedding = EXCLUDED.embedding,
  updated_at = now()
"""


@dataclass
class Gemeente:
    code: str
    name: str
    bbox: list[float]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch BAG OGC records and index them into bag_search_index."
    )
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""))
    parser.add_argument("--model", default=os.environ.get("NLS_EMBED_MODEL", DEFAULT_MODEL))
    parser.add_argument("--gemeente", action="append", default=[])
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--page-limit", type=int, default=PAGE_LIMIT)
    parser.add_argument("--replace", action="store_true")
    args = parser.parse_args()

    if not args.database_url:
        raise SystemExit("DATABASE_URL or --database-url is required.")

    gemeenten = load_gemeenten()
    if args.all:
        selected = sorted(gemeenten.values(), key=lambda g: g.code)
    elif args.gemeente:
        selected = []
        for code in args.gemeente:
            g = gemeenten.get(code)
            if not g:
                raise SystemExit(f"Gemeente {code} not found in registry.")
            selected.append(g)
    else:
        raise SystemExit("Pass --gemeente 0150 or --all.")

    embedder = Embedder(args.model)

    with psycopg.connect(args.database_url) as conn:
        ensure_nls_database_ready(conn)
        for gemeente in selected:
            index_gemeente(
                conn=conn,
                gemeente=gemeente,
                embedder=embedder,
                batch_size=args.batch_size,
                page_limit=args.page_limit,
                replace=args.replace,
            )


def load_gemeenten() -> dict[str, Gemeente]:
    raw = json.loads(GEMEENTEN_JSON_PATH.read_text(encoding="utf-8"))
    return {
        code: Gemeente(code=item["code"], name=item["name"], bbox=item["bbox"])
        for code, item in raw.items()
    }


def index_gemeente(
    *,
    conn: psycopg.Connection,
    gemeente: Gemeente,
    embedder: Embedder,
    batch_size: int,
    page_limit: int,
    replace: bool,
) -> None:
    print(f"Indexing gemeente {gemeente.code} {gemeente.name}...")

    pand_features = fetch_collection_all_pages("pand", gemeente.bbox, page_limit)
    pand_status_by_uri: dict[str, str] = {}
    for feature in pand_features:
        feature_id = str(feature.get("id") or "")
        if not feature_id:
            continue
        status = string_value(feature.get("properties", {}).get("status"))
        pand_status_by_uri[f"{BAG_OGC_BASE}/collections/pand/items/{feature_id}"] = status

    if replace:
        with conn.cursor() as cur:
            cur.execute("delete from bag_search_index where gemeente_code = %s", (gemeente.code,))
        conn.commit()

    buffer: list[dict[str, Any]] = []
    total_indexed = 0

    for page in iter_collection_pages("verblijfsobject", gemeente.bbox, page_limit):
        for feature in page:
            record = feature_to_index_record(feature, gemeente, pand_status_by_uri)
            if not record:
                continue
            buffer.append(record)
            if len(buffer) >= batch_size:
                total_indexed += flush_records(conn, embedder, buffer)
                print(f"  Indexed {total_indexed} records...")
                buffer.clear()

    if buffer:
        total_indexed += flush_records(conn, embedder, buffer)
        buffer.clear()

    print(f"Finished gemeente {gemeente.code}: {total_indexed} records indexed")


def flush_records(
    conn: psycopg.Connection,
    embedder: Embedder,
    records: list[dict[str, Any]],
) -> int:
    texts = [stringify_bag_record(record) for record in records]
    embeddings = embedder.encode(texts)
    payload: list[dict[str, Any]] = []
    for record, text, embedding in zip(records, texts, embeddings, strict=True):
        payload.append({
            **record,
            "search_text": text,
            "embedding": Vector(embedding),
        })

    with conn.cursor() as cur:
        cur.executemany(UPSERT_SQL, payload)
    conn.commit()
    return len(payload)


def feature_to_index_record(
    feature: dict[str, Any],
    gemeente: Gemeente,
    pand_status_by_uri: dict[str, str],
) -> dict[str, Any] | None:
    props = feature.get("properties") or {}
    geometry = feature.get("geometry") or {}
    coordinates = geometry.get("coordinates") or []

    lon, lat = extract_center(geometry)
    if lon is None or lat is None:
        return None

    gebruiksdoel = string_value(
        props.get("gebruiksdoel") or props.get("gebruiksdoelverblijfsobject")
    ).lower()
    if gebruiksdoel not in CONVERSION_ELIGIBLE_DOELEN:
        return None

    vbo_identificatie = string_value(props.get("identificatie") or feature.get("id"))
    pand_identificatie = resolve_pand_identificatie(props)
    pand_status = resolve_pand_status(props, pand_status_by_uri)
    bouwjaar = int_value(props.get("bouwjaar") or props.get("BOUWJAAR"))
    oppervlakte = float_value(
        props.get("oppervlakte") or props.get("oppervlakteverblijfsobject")
    )
    status = string_value(props.get("status") or props.get("STATUS"))
    woonplaatsnaam = string_value(
        props.get("woonplaats_naam")
        or props.get("woonplaatsnaam")
        or props.get("WOONPLAATSNAAM")
    )
    score_tier = score_viability_tier(
        gebruiksdoel=gebruiksdoel,
        vbo_status=status,
        pand_status=pand_status,
        bouwjaar=bouwjaar,
        oppervlakte=oppervlakte,
    )

    return {
        "id": vbo_identificatie,
        "vbo_identificatie": vbo_identificatie,
        "pand_identificatie": pand_identificatie,
        "gemeente_code": gemeente.code,
        "gemeente_name": gemeente.name,
        "woonplaatsnaam": woonplaatsnaam,
        "gebruiksdoel": gebruiksdoel,
        "status": status,
        "pand_status": pand_status,
        "score_tier": score_tier,
        "bouwjaar": bouwjaar,
        "oppervlakte": oppervlakte,
        "lon": lon,
        "lat": lat,
    }


def score_viability_tier(
    *,
    gebruiksdoel: str,
    vbo_status: str,
    pand_status: str,
    bouwjaar: int,
    oppervlakte: float,
) -> str:
    if gebruiksdoel == "woonfunctie":
        return "uitgesloten"

    total = 0

    if vbo_status == "Verblijfsobject buiten gebruik":
        total += 3
    elif vbo_status == "Verblijfsobject gevormd":
        total += 2
    elif vbo_status in {"Niet gerealiseerd verblijfsobject", "Verblijfsobject ingetrokken"}:
        total += 1
    elif vbo_status == "Verbouwing verblijfsobject":
        total -= 2

    if pand_status == "Sloopvergunning verleend":
        total += 2
    elif pand_status == "Bouwvergunning verleend":
        total += 1
    elif pand_status == "Bouw gestart":
        total -= 1
    elif pand_status == "Pand gesloopt":
        total -= 1

    if bouwjaar >= 1990:
        total += 2
    elif bouwjaar >= 1975:
        total += 1

    if 500 <= oppervlakte <= 3000:
        total += 2
    elif 300 <= oppervlakte < 500:
        total += 1
    elif 3000 < oppervlakte <= 6000:
        total += 1

    if total >= 4:
        return "hoog"
    if total >= 2:
        return "middel"
    return "laag"


def resolve_pand_identificatie(props: dict[str, Any]) -> str:
    href = first_pand_href(props)
    if href:
        return href.rsplit("/", 1)[-1]
    return ""


def resolve_pand_status(props: dict[str, Any], pand_status_by_uri: dict[str, str]) -> str:
    href = first_pand_href(props)
    if href and href in pand_status_by_uri:
        return pand_status_by_uri[href]
    return ""


def first_pand_href(props: dict[str, Any]) -> str:
    hrefs = props.get("pand.href")
    if isinstance(hrefs, list):
        for href in hrefs:
            value = string_value(href)
            if value:
                return value

    for item in props.get("maakt_deel_uit_van", []) or []:
        if isinstance(item, dict):
            value = string_value(item.get("href"))
            if value:
                return value
    return ""


def iter_collection_pages(
    collection: str,
    bbox: list[float],
    limit: int,
) -> Iterable[list[dict[str, Any]]]:
    next_url = build_collection_url(collection, bbox, limit)
    while next_url:
        payload = fetch_json(next_url)
        yield payload.get("features", [])
        next_href = ""
        for link in payload.get("links", []) or []:
            if isinstance(link, dict) and link.get("rel") == "next":
                next_href = string_value(link.get("href"))
                break
        next_url = next_href


def fetch_collection_all_pages(
    collection: str,
    bbox: list[float],
    limit: int,
) -> list[dict[str, Any]]:
    features: list[dict[str, Any]] = []
    for page in iter_collection_pages(collection, bbox, limit):
        features.extend(page)
    return features


def build_collection_url(collection: str, bbox: list[float], limit: int) -> str:
    params = urllib.parse.urlencode(
        {
            "f": "json",
            "limit": str(limit),
            "bbox": ",".join(str(value) for value in bbox),
        }
    )
    return f"{BAG_OGC_BASE}/collections/{collection}/items?{params}"


def fetch_json(url: str) -> dict[str, Any]:
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/geo+json, application/json;q=0.9, */*;q=0.8",
            "User-Agent": "lumen-nls-indexer/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read())


def extract_center(geometry: dict[str, Any]) -> tuple[float | None, float | None]:
    geom_type = string_value(geometry.get("type"))
    coords = geometry.get("coordinates")
    if geom_type == "Point" and isinstance(coords, list) and len(coords) >= 2:
        return float_value(coords[0]), float_value(coords[1])
    flattened = flatten_coordinates(coords)
    if not flattened:
        return None, None
    xs = [pt[0] for pt in flattened]
    ys = [pt[1] for pt in flattened]
    return (min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0


def flatten_coordinates(value: Any) -> list[tuple[float, float]]:
    if not isinstance(value, list):
        return []
    if len(value) >= 2 and all(isinstance(v, (int, float)) for v in value[:2]):
        return [(float(value[0]), float(value[1]))]
    result: list[tuple[float, float]] = []
    for item in value:
        result.extend(flatten_coordinates(item))
    return result


def string_value(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def int_value(value: Any) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def float_value(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


if __name__ == "__main__":
    main()
