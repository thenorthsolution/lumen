from __future__ import annotations

import psycopg
from pgvector.psycopg import register_vector


BOOTSTRAP_SQL_PATH = "services/nls/sql/001_pgvector_bag_search.sql"


def ensure_nls_database_ready(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              EXISTS (
                SELECT 1
                FROM pg_extension
                WHERE extname = 'vector'
              ) AS has_vector,
              to_regclass('public.bag_search_index')::text AS index_table,
              to_regprocedure(
                'bag_search_hybrid(vector,text,integer,text[],text[],text[],text[],text[],integer,integer,double precision,double precision)'
              )::text AS hybrid_fn
            """
        )
        row = cur.fetchone()

    if not row:
        raise SystemExit(
            "NLS database preflight failed unexpectedly. "
            f"Apply {BOOTSTRAP_SQL_PATH} to the target database."
        )

    has_vector, index_table, hybrid_fn = row

    if not has_vector:
        raise SystemExit(
            "The target database does not have the pgvector extension enabled. "
            f"Run the SQL bootstrap in {BOOTSTRAP_SQL_PATH} "
            "(at minimum: CREATE EXTENSION IF NOT EXISTS vector;)."
        )

    if not index_table or not hybrid_fn:
        raise SystemExit(
            "The NLS schema is incomplete in the target database. "
            f"Apply {BOOTSTRAP_SQL_PATH} to create bag_search_index and bag_search_hybrid(...)."
        )

    register_vector(conn)
