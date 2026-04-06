#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os

import psycopg


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect NLS search index contents.")
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""))
    args = parser.parse_args()

    if not args.database_url:
        raise SystemExit("DATABASE_URL or --database-url is required.")

    with psycopg.connect(args.database_url) as conn:
        with conn.cursor() as cur:
            cur.execute("select count(*) from bag_search_index")
            total = cur.fetchone()[0]

            cur.execute(
                """
                select gemeente_code, count(*)
                from bag_search_index
                group by 1
                order by 2 desc
                limit 15
                """
            )
            top_gemeenten = cur.fetchall()

            cur.execute(
                """
                select pand_status, count(*)
                from bag_search_index
                group by 1
                order by 2 desc
                limit 15
                """
            )
            top_pand_statuses = cur.fetchall()

            cur.execute(
                """
                select count(*)
                from bag_search_index
                where pand_status = 'Sloopvergunning verleend'
                """
            )
            sloop_count = cur.fetchone()[0]

            cur.execute(
                """
                select
                  vbo_identificatie,
                  gemeente_code,
                  woonplaatsnaam,
                  gebruiksdoel,
                  status,
                  pand_status,
                  bouwjaar,
                  oppervlakte
                from bag_search_index
                where pand_status = 'Sloopvergunning verleend'
                order by bouwjaar desc nulls last, oppervlakte desc
                limit 10
                """
            )
            sloop_examples = cur.fetchall()

    print(
        json.dumps(
            {
                "total_rows": total,
                "top_gemeenten": top_gemeenten,
                "top_pand_statuses": top_pand_statuses,
                "sloopvergunning_rows": sloop_count,
                "sloop_examples": sloop_examples,
            },
            ensure_ascii=False,
            indent=2,
            default=str,
        )
    )


if __name__ == "__main__":
    main()
