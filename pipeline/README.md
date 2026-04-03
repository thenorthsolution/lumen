# lumen — Data Pipeline

Reproducible Python pipeline for BAG data ingestion, viability scoring, and PMTiles generation.

## Requirements

```bash
pip install duckdb requests geopandas shapely tqdm
# For PMTiles generation (recommended):
brew install tippecanoe   # macOS
apt install tippecanoe    # Linux
```

## Run the full pipeline

```bash
# Single gemeente (Deventer)
python ingest_bag.py --gemeente 0150
python build_pmtiles.py --gemeente 0150

# All registered gemeenten
python ingest_bag.py --all
python build_pmtiles.py --all
```

## Output

```
pipeline/
├── data/
│   ├── leegstand_0150.geojson    # Scored features — Deventer
│   ├── leegstand_0363.geojson    # Amsterdam
│   └── ...
└── tiles/
    ├── leegstand_0150.pmtiles    # Ready for CDN
    └── ...
```

## Reproducibility

The pipeline is deterministic. Given the same BAG snapshot date, it produces identical output. The snapshot date is embedded in each output file's metadata.

To reproduce the exact dataset used in leegstandsradar.nl, check the `snapshot_date` field in the GeoJSON metadata and run:

```bash
python ingest_bag.py --gemeente 0150 --snapshot 2026-04-01
```

## Deploying tiles to Cloudflare R2

```bash
# Authenticate
wrangler login

# Upload
wrangler r2 object put lumen-tiles/leegstand_0150.pmtiles \
  --file tiles/leegstand_0150.pmtiles \
  --content-type application/octet-stream

# Set CORS for MapLibre access
wrangler r2 bucket cors put lumen-tiles \
  --rules '[{"allowedOrigins":["*"],"allowedMethods":["GET","HEAD"],"allowedHeaders":["Range"]}]'
```

## Model version

The Python scoring model in `ingest_bag.py` mirrors the TypeScript model in `packages/bag-utils/src/viability.ts`. Both carry a `MODEL_VERSION` constant. When the model changes, both files must be updated in sync and the version incremented.
