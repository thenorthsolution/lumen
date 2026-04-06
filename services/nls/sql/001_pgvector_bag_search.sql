CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS bag_search_index (
  id text PRIMARY KEY,
  vbo_identificatie text NOT NULL,
  pand_identificatie text NOT NULL DEFAULT '',
  gemeente_code text NOT NULL DEFAULT '',
  gemeente_name text NOT NULL DEFAULT '',
  woonplaatsnaam text NOT NULL DEFAULT '',
  gebruiksdoel text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '',
  pand_status text NOT NULL DEFAULT '',
  score_tier text NOT NULL DEFAULT '',
  bouwjaar integer NOT NULL DEFAULT 0,
  oppervlakte double precision NOT NULL DEFAULT 0,
  lon double precision NOT NULL,
  lat double precision NOT NULL,
  search_text text NOT NULL,
  search_document tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(search_text, ''))
  ) STORED,
  embedding vector(1024) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bag_search_index_embedding_hnsw
  ON bag_search_index
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS bag_search_index_search_document_idx
  ON bag_search_index
  USING gin (search_document);

CREATE INDEX IF NOT EXISTS bag_search_index_gemeente_code_idx
  ON bag_search_index (gemeente_code);

CREATE INDEX IF NOT EXISTS bag_search_index_status_idx
  ON bag_search_index (status);

CREATE INDEX IF NOT EXISTS bag_search_index_pand_status_idx
  ON bag_search_index (pand_status);

CREATE INDEX IF NOT EXISTS bag_search_index_gebruiksdoel_idx
  ON bag_search_index (gebruiksdoel);

CREATE OR REPLACE FUNCTION bag_search_hybrid(
  query_embedding vector(1024),
  query_text text,
  limit_count integer DEFAULT 25,
  gemeente_codes text[] DEFAULT NULL,
  score_tiers text[] DEFAULT NULL,
  gebruiksdoelen text[] DEFAULT NULL,
  statuses text[] DEFAULT NULL,
  pand_statuses text[] DEFAULT NULL,
  min_bouwjaar integer DEFAULT NULL,
  max_bouwjaar integer DEFAULT NULL,
  min_oppervlakte double precision DEFAULT NULL,
  max_oppervlakte double precision DEFAULT NULL
)
RETURNS TABLE (
  id text,
  vbo_identificatie text,
  pand_identificatie text,
  gemeente_code text,
  gemeente_name text,
  woonplaatsnaam text,
  gebruiksdoel text,
  status text,
  pand_status text,
  score_tier text,
  bouwjaar integer,
  oppervlakte double precision,
  lon double precision,
  lat double precision,
  similarity double precision,
  lexical_rank real,
  hybrid_score double precision
)
LANGUAGE sql
STABLE
AS $$
WITH filtered AS (
  SELECT
    b.*,
    1 - (b.embedding <=> query_embedding) AS similarity,
    ts_rank_cd(
      b.search_document,
      websearch_to_tsquery('simple', coalesce(nullif(query_text, ''), '*'))
    ) AS lexical_rank
  FROM bag_search_index b
  WHERE (gemeente_codes IS NULL OR b.gemeente_code = ANY(gemeente_codes))
    AND (score_tiers IS NULL OR b.score_tier = ANY(score_tiers))
    AND (gebruiksdoelen IS NULL OR b.gebruiksdoel = ANY(gebruiksdoelen))
    AND (statuses IS NULL OR b.status = ANY(statuses))
    AND (pand_statuses IS NULL OR b.pand_status = ANY(pand_statuses))
    AND (min_bouwjaar IS NULL OR b.bouwjaar >= min_bouwjaar)
    AND (max_bouwjaar IS NULL OR b.bouwjaar <= max_bouwjaar)
    AND (min_oppervlakte IS NULL OR b.oppervlakte >= min_oppervlakte)
    AND (max_oppervlakte IS NULL OR b.oppervlakte <= max_oppervlakte)
),
ranked AS (
  SELECT
    *,
    (similarity * 0.75) + (COALESCE(lexical_rank, 0) * 0.25) AS hybrid_score
  FROM filtered
)
SELECT
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
  similarity,
  lexical_rank,
  hybrid_score
FROM ranked
ORDER BY hybrid_score DESC, similarity DESC, oppervlakte DESC
LIMIT limit_count;
$$;
