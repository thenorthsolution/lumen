#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from dataclasses import asdict

import psycopg
from pgvector import Vector

from .db import ensure_nls_database_ready
from .embedder import DEFAULT_MODEL, Embedder
from .hybrid import derive_hybrid_filters


def main() -> None:
    parser = argparse.ArgumentParser(description="Search BAG NLS index.")
    parser.add_argument("query", help="Natural language Dutch query")
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""))
    parser.add_argument("--model", default=os.environ.get("NLS_EMBED_MODEL", DEFAULT_MODEL))
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--gemeente-code", action="append", default=[])
    args = parser.parse_args()

    if not args.database_url:
        raise SystemExit("DATABASE_URL or --database-url is required.")

    embedder = Embedder(args.model)
    query_embedding = Vector(embedder.encode_one(args.query))
    filters = derive_hybrid_filters(args.query)
    gemeente_codes = args.gemeente_code or None

    with psycopg.connect(args.database_url) as conn:
        ensure_nls_database_ready(conn)
        strategy, rows, applied_filters = run_search_with_fallback(
            conn=conn,
            query_embedding=query_embedding,
            query_text=args.query,
            limit_count=args.limit,
            gemeente_codes=gemeente_codes,
            filters=filters,
        )

    print(
        json.dumps(
            {
                "query": args.query,
                "filters": filters.__dict__,
                "applied_filters": applied_filters,
                "strategy": strategy,
                "results": rows,
            },
            ensure_ascii=False,
            indent=2,
            default=str,
        )
    )

def run_search_with_fallback(
    *,
    conn: psycopg.Connection,
    query_embedding: Vector,
    query_text: str,
    limit_count: int,
    gemeente_codes: list[str] | None,
    filters,
):
    base = asdict(filters)
    candidates = [
        (
            "strict_local",
            {
                **base,
                "gemeente_codes": gemeente_codes,
            },
        ),
        (
            "semantic_local",
            {
                **base,
                "gemeente_codes": gemeente_codes,
                "min_bouwjaar": None,
                "max_bouwjaar": None,
                "min_oppervlakte": None,
                "max_oppervlakte": None,
                "score_tiers": [],
            },
        ),
        (
            "strict_global",
            {
                **base,
                "gemeente_codes": None,
            },
        ),
        (
            "semantic_global",
            {
                **base,
                "gemeente_codes": None,
                "min_bouwjaar": None,
                "max_bouwjaar": None,
                "min_oppervlakte": None,
                "max_oppervlakte": None,
                "score_tiers": [],
            },
        ),
        (
            "vector_local",
            {
                "gemeente_codes": gemeente_codes,
                "score_tiers": [],
                "gebruiksdoelen": [],
                "statuses": [],
                "pand_statuses": [],
                "min_bouwjaar": None,
                "max_bouwjaar": None,
                "min_oppervlakte": None,
                "max_oppervlakte": None,
            },
        ),
        (
            "vector_global",
            {
                "gemeente_codes": None,
                "score_tiers": [],
                "gebruiksdoelen": [],
                "statuses": [],
                "pand_statuses": [],
                "min_bouwjaar": None,
                "max_bouwjaar": None,
                "min_oppervlakte": None,
                "max_oppervlakte": None,
            },
        ),
    ]

    for strategy, candidate in candidates:
        rows = execute_search(
            conn=conn,
            query_embedding=query_embedding,
            query_text=query_text,
            limit_count=limit_count,
            gemeente_codes=candidate["gemeente_codes"],
            score_tiers=candidate["score_tiers"] or None,
            gebruiksdoelen=candidate["gebruiksdoelen"] or None,
            statuses=candidate["statuses"] or None,
            pand_statuses=candidate["pand_statuses"] or None,
            min_bouwjaar=candidate["min_bouwjaar"],
            max_bouwjaar=candidate["max_bouwjaar"],
            min_oppervlakte=candidate["min_oppervlakte"],
            max_oppervlakte=candidate["max_oppervlakte"],
        )
        if rows:
            reranked_rows = rerank_results(query_text, rows)
            return strategy, reranked_rows[:limit_count], candidate

    return "none", [], candidates[-1][1]


def execute_search(
    *,
    conn: psycopg.Connection,
    query_embedding: Vector,
    query_text: str,
    limit_count: int,
    gemeente_codes: list[str] | None,
    score_tiers: list[str] | None,
    gebruiksdoelen: list[str] | None,
    statuses: list[str] | None,
    pand_statuses: list[str] | None,
    min_bouwjaar: int | None,
    max_bouwjaar: int | None,
    min_oppervlakte: float | None,
    max_oppervlakte: float | None,
):
    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        cur.execute(
            """
            SELECT *
            FROM bag_search_hybrid(
              %(query_embedding)s::vector,
              %(query_text)s::text,
              %(limit_count)s::integer,
              %(gemeente_codes)s::text[],
              %(score_tiers)s::text[],
              %(gebruiksdoelen)s::text[],
              %(statuses)s::text[],
              %(pand_statuses)s::text[],
              %(min_bouwjaar)s::integer,
              %(max_bouwjaar)s::integer,
              %(min_oppervlakte)s::double precision,
              %(max_oppervlakte)s::double precision
            )
            """,
            {
                "query_embedding": query_embedding,
                "query_text": query_text,
                "limit_count": limit_count,
                "gemeente_codes": gemeente_codes,
                "score_tiers": score_tiers,
                "gebruiksdoelen": gebruiksdoelen,
                "statuses": statuses,
                "pand_statuses": pand_statuses,
                "min_bouwjaar": min_bouwjaar,
                "max_bouwjaar": max_bouwjaar,
                "min_oppervlakte": min_oppervlakte,
                "max_oppervlakte": max_oppervlakte,
            },
        )
        return cur.fetchall()


def rerank_results(query_text: str, rows):
    q = query_text.lower()
    reranked = []

    wants_big = "groot" in q or "grootste" in q
    wants_small = "klein" in q or "kleinste" in q
    wants_new = any(term in q for term in ("nieuw", "nieuwer", "recent", "modern"))
    wants_old = any(term in q for term in ("oud", "historisch", "vooroorlogs"))
    wants_sloop = any(term in q for term in ("sloop", "gesloopt", "te slopen", "demol"))

    for row in rows:
        item = dict(row)
        score = float(item.get("hybrid_score") or 0)
        oppervlakte = float(item.get("oppervlakte") or 0)
        bouwjaar = int(item.get("bouwjaar") or 0)
        pand_status = str(item.get("pand_status") or "")

        if wants_big:
            score += min(oppervlakte / 5000.0, 1.0) * 0.25
        if wants_small and oppervlakte > 0:
            score += min(300.0 / oppervlakte, 1.0) * 0.2
        if wants_new and bouwjaar > 0:
            score += min(max((bouwjaar - 1950) / 80.0, 0), 1.0) * 0.2
        if wants_old and bouwjaar > 0:
            score += min(max((1950 - bouwjaar) / 80.0, 0), 1.0) * 0.2
        if wants_sloop and pand_status in {"Sloopvergunning verleend", "Pand gesloopt"}:
            score += 0.35

        item["hybrid_score"] = score
        reranked.append(item)

    reranked.sort(
        key=lambda item: (
            float(item.get("hybrid_score") or 0),
            float(item.get("oppervlakte") or 0),
            int(item.get("bouwjaar") or 0),
        ),
        reverse=True,
    )
    return reranked


if __name__ == "__main__":
    main()
