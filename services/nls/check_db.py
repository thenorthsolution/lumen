#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os

import psycopg


def main() -> None:
    parser = argparse.ArgumentParser(description="Check NLS database bootstrap state.")
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL", ""))
    args = parser.parse_args()

    if not args.database_url:
        raise SystemExit("DATABASE_URL or --database-url is required.")

    with psycopg.connect(args.database_url) as conn:
        with conn.cursor() as cur:
            cur.execute("select current_database(), current_schema(), current_user")
            identity = cur.fetchone()

            cur.execute(
                """
                select extname
                from pg_extension
                where extname in ('vector', 'postgis')
                order by extname
                """
            )
            extensions = [row[0] for row in cur.fetchall()]

            cur.execute("select to_regclass('public.bag_search_index')::text")
            bag_search_index = cur.fetchone()[0]

            cur.execute(
                """
                select oid::regprocedure::text
                from pg_proc
                where proname = 'bag_search_hybrid'
                order by oid::regprocedure::text
                """
            )
            functions = [row[0] for row in cur.fetchall()]

    print(
        json.dumps(
            {
                "identity": {
                    "database": identity[0],
                    "schema": identity[1],
                    "user": identity[2],
                },
                "extensions": extensions,
                "bag_search_index": bag_search_index,
                "bag_search_hybrid_functions": functions,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
