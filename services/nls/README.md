# BAG Natural Language Search

Self-hosted semantic search for Dutch BAG/PDOK records on PostgreSQL/PostGIS using `pgvector`.

## What this adds

- `bag_search_index` table for 10M+ semantically searchable records
- Dutch-oriented textification of BAG attributes into a searchable blob
- local embeddings via `sentence-transformers` and `BAAI/bge-m3`
- hybrid ranking that combines vector similarity with SQL filters
- output shaped for the frontend: IDs and coordinates for MapLibre fly-to/filter

## Why this design

The shortlist UI already reasons over attributes like:

- `bouwjaar`
- `oppervlakte`
- `status`
- `pand_status`
- `gebruiksdoel`

Natural language search should not replace those fields. It should sit on top of them:

1. semantic embedding for intent understanding
2. SQL filters for cheap narrowing
3. result rows with `id`, `lon`, `lat` for immediate frontend use

## Schema

Apply:

```sql
\i services/nls/sql/001_pgvector_bag_search.sql
```

This creates:

- `bag_search_index`
- HNSW vector index
- GIN index on generated text search column
- `bag_search_hybrid(...)` SQL function

## Python dependencies

```bash
pip install psycopg[binary] pgvector sentence-transformers torch
```

Optional model override:

```bash
export NLS_EMBED_MODEL=BAAI/bge-m3
```

## Direct OGC indexing

The repo now includes a direct PDOK OGC indexer, so you do not need a pre-existing
Postgres staging table just to get started.

Example:

```bash
cd apps/vacancy
pnpm run nls:index -- --gemeente 0150 --replace
```

This will:

- fetch `verblijfsobject` records from the BAG OGC API for the municipality bbox
- fetch `pand` records for the same bbox to resolve `pand_status`
- score a shortlist tier
- stringify the record into Dutch search text
- generate embeddings
- upsert into `bag_search_index`

Use `--all` for a national crawl, but start with one or a few municipalities first.

## Source table expectation

The indexer expects a Postgres source table or view, for example `bag_candidate_source`, with columns like:

- `id`
- `geom`
- `identificatie` or `vbo_identificatie`
- `pand_identificatie`
- `gemeente_code`
- `gemeente_name`
- `woonplaatsnaam`
- `gebruiksdoel`
- `status`
- `pand_status`
- `score_tier`
- `bouwjaar`
- `oppervlakte`

If your upstream table uses different names, either:

- create a compatibility view
- or pass custom `--id-column` / `--geom-column`

## Indexing

```bash
python -m services.nls.index_bag_embeddings \
  --database-url "$DATABASE_URL" \
  --source-table bag_candidate_source
```

The textification step expands Dutch status semantics.

Example:

- `Sloopvergunning verleend` becomes concepts like:
  - `gaat gesloopt worden`
  - `te slopen pand`
  - `demolition planned`

So a query like `Groot nieuw pand dat gesloopt gaat worden` can match even if the raw BAG row only contains structured statuses.

## Search

```bash
python -m services.nls.search_bag \
  "Groot nieuw pand dat gesloopt gaat worden" \
  --database-url "$DATABASE_URL" \
  --limit 20
```

Example output:

```json
{
  "query": "Groot nieuw pand dat gesloopt gaat worden",
  "results": [
    {
      "id": "bag-123",
      "lon": 6.163,
      "lat": 52.255,
      "hybrid_score": 0.88
    }
  ]
}
```

Those IDs and coordinates can be passed directly to the vacancy frontend for:

- filtering a source by IDs
- selecting a feature
- `flyTo([lon, lat])`

## Hybrid search logic

`services/nls/hybrid.py` derives cheap SQL filters from the NL query before vector ranking.

Examples:

- `nieuw` -> `min_bouwjaar >= 1990`
- `groot` -> `min_oppervlakte >= 1000`
- `gesloopt gaat worden` -> `pand_status IN ('Sloopvergunning verleend', 'Pand gesloopt')`

This is intentionally narrow:

- semantics come primarily from embeddings
- SQL filters are used only where they are cheap and obvious

## Suggested next backend step

Make the Python pipeline produce a Postgres-ready staging table:

1. ingest BAG into PostGIS
2. score candidates in Python
3. refresh `bag_candidate_source`
4. run `index_bag_embeddings`
5. expose `bag_search_hybrid` through a small API

That moves sorting and retrieval out of the browser and turns Python into the data backend, which matches the direction you suggested.
