#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
from dataclasses import dataclass
from typing import Any

import psycopg
from pgvector import Vector

from .db import ensure_nls_database_ready
from .embedder import DEFAULT_MODEL, Embedder
from .textify import stringify_bag_record


@dataclass
class SourceRecord:
    id: str
    vbo_identificatie: str
    pand_identificatie: str
    gemeente_code: str
    gemeente_name: str
    woonplaatsnaam: str
    gebruiksdoel: str
    status: str
    pand_status: str
    score_tier: str
    bouwjaar: int
    oppervlakte: float
    lon: float
    lat: float


SELECT_TEMPLATE = """
SELECT
  {id_column}::text AS id,
  COALESCE(vbo_identificatie::text, identificatie::text, {id_column}::text) AS vbo_identificatie,
  COALESCE(pand_identificatie::text, pand_id::text, '') AS pand_identificatie,
  COALESCE(gemeente_code::text, gemeentecode::text, '') AS gemeente_code,
  COALESCE(gemeente_name::text, gemeente::text, '') AS gemeente_name,
  COALESCE(woonplaatsnaam::text, woonplaats::text, '') AS woonplaatsnaam,
  COALESCE(gebruiksdoel::text, '') AS gebruiksdoel,
  COALESCE(status::text, '') AS status,
  COALESCE(pand_status::text, pandstatus::text, '') AS pand_status,
  COALESCE(score_tier::text, '') AS score_tier,
  COALESCE(bouwjaar, 0)::int AS bouwjaar,
  COALESCE(oppervlakte, 0)::double precision AS oppervlakte,
  ST_X(ST_PointOnSurface({geom_column}))::double precision AS lon,
  ST_Y(ST_PointOnSurface({geom_column}))::double precision AS lat
FROM {source_table}
WHERE ({id_column}::text > %s)
ORDER BY {id_column}::text
LIMIT %s
"""


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


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate pgvector embeddings for BAG records.")
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""))
    parser.add_argument("--source-table", default="bag_candidate_source")
    parser.add_argument("--id-column", default="id")
    parser.add_argument("--geom-column", default="geom")
    parser.add_argument("--model", default=os.environ.get("NLS_EMBED_MODEL", DEFAULT_MODEL))
    parser.add_argument("--batch-size", type=int, default=512)
    args = parser.parse_args()

    if not args.database_url:
        raise SystemExit("DATABASE_URL or --database-url is required.")

    select_sql = SELECT_TEMPLATE.format(
        id_column=args.id_column,
        geom_column=args.geom_column,
        source_table=args.source_table,
    )
    embedder = Embedder(args.model)
    last_id = ""
    total = 0

    with psycopg.connect(args.database_url) as conn:
        ensure_nls_database_ready(conn)
        while True:
            with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
                cur.execute(select_sql, (last_id, args.batch_size))
                rows = cur.fetchall()

            if not rows:
                break

            records = [SourceRecord(**row) for row in rows]
            texts = [stringify_bag_record(record.__dict__) for record in records]
            embeddings = embedder.encode(texts)

            payload: list[dict[str, Any]] = []
            for record, text, embedding in zip(records, texts, embeddings, strict=True):
                payload.append({
                    **record.__dict__,
                    "search_text": text,
                    "embedding": Vector(embedding),
                })

            with conn.cursor() as cur:
                cur.executemany(UPSERT_SQL, payload)
            conn.commit()

            total += len(records)
            last_id = records[-1].id
            print(f"Indexed {total} records up to id={last_id}")


if __name__ == "__main__":
    main()
