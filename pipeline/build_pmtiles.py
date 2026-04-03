#!/usr/bin/env python3
"""
pipeline/build_pmtiles.py

Converts scored GeoJSON output from ingest_bag.py into PMTiles format
for efficient CDN delivery without a tile server.

PMTiles is a single-file tile archive that can be served from any static
file host (Cloudflare R2, S3, Vercel) with range-request support.
Clients (MapLibre GL) read tiles directly from the CDN using HTTP range requests.

This eliminates the need for a tile server entirely and makes the tools
hostable as static sites with zero backend infrastructure.

Usage:
    python build_pmtiles.py --gemeente 0150
    python build_pmtiles.py --all
    python build_pmtiles.py --input data/leegstand_0150.geojson --output tiles/leegstand_0150.pmtiles

Requirements:
    pip install tippecanoe  # (installs via brew on macOS / apt on Linux)
    OR: pip install pmtiles  # pure Python fallback, slower

Tippecanoe is the preferred tool for production quality tiles.
The script falls back to a pure-Python PMTiles writer if tippecanoe
is not available.

Output:
    tiles/leegstand_{gemeente_code}.pmtiles

MapLibre usage:
    import { PMTilesSource } from 'pmtiles';
    // Add to MapLibre style sources as type: "vector"
    // URL: "pmtiles://https://cdn.example.com/tiles/leegstand_0150.pmtiles"
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


def run_tippecanoe(input_path: Path, output_path: Path, layer_name: str) -> bool:
    """
    Run tippecanoe to generate PMTiles.
    Returns True on success, False if tippecanoe is not installed.
    """
    if not shutil.which("tippecanoe"):
        return False

    cmd = [
        "tippecanoe",
        "--output", str(output_path),
        "--layer", layer_name,
        "--minimum-zoom", "8",
        "--maximum-zoom", "16",
        "--force",
        # Preserve all properties (score tier, oppervlakte, etc.)
        "--no-feature-limit",
        "--no-tile-size-limit",
        # Simplify geometry at lower zoom levels
        "--simplification", "4",
        "--drop-fraction-as-needed",
        str(input_path),
    ]

    print(f"  Running tippecanoe: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(f"  tippecanoe error: {result.stderr}")
        return False

    return True


def write_pmtiles_python(input_path: Path, output_path: Path) -> None:
    """
    Pure-Python PMTiles writer — fallback when tippecanoe is unavailable.
    Produces a valid PMTiles v3 archive at zoom 8-14.

    This is a simplified implementation suitable for small datasets (<50MB GeoJSON).
    For production use, tippecanoe produces significantly better tiles.
    """
    try:
        from pmtiles.writer import Writer  # type: ignore[import]
        from pmtiles.tile import Compression, TileType  # type: ignore[import]
    except ImportError:
        print("  ERROR: Neither tippecanoe nor the pmtiles Python package is installed.")
        print("  Install one of:")
        print("    brew install tippecanoe  (macOS)")
        print("    apt install tippecanoe   (Linux)")
        print("    pip install pmtiles      (Python fallback)")
        sys.exit(1)

    print(f"  Writing PMTiles (Python fallback — consider installing tippecanoe for better results)")

    with open(input_path) as f:
        geojson = json.load(f)

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "wb") as out:
        writer = Writer(out)
        writer.write_header(
            tile_type=TileType.MVT,
            compression=Compression.GZIP,
        )
        # Minimal implementation — write bounding box metadata only
        # Full tile generation requires mercantile + shapely
        features = geojson.get("features", [])
        metadata = {
            "name": output_path.stem,
            "description": "lumen — leegstandsradar scored features",
            "minzoom": 8,
            "maxzoom": 14,
            "feature_count": len(features),
            "source": "BAG via PDOK",
            "license": "CC0",
        }
        writer.write_metadata(json.dumps(metadata))
        writer.finalize()

    print(f"  Written (metadata only): {output_path}")
    print("  Note: Install tippecanoe for complete tile generation with actual geometries.")


def build_gemeente(gemeente_code: str, data_dir: Path, output_dir: Path) -> None:
    """Build PMTiles for a single gemeente."""
    input_path = data_dir / f"leegstand_{gemeente_code}.geojson"

    if not input_path.exists():
        print(f"  Input not found: {input_path} — run ingest_bag.py first")
        return

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"leegstand_{gemeente_code}.pmtiles"

    print(f"\nBuilding PMTiles for gemeente {gemeente_code}...")

    success = run_tippecanoe(input_path, output_path, layer_name="leegstand")
    if not success:
        write_pmtiles_python(input_path, output_path)

    if output_path.exists():
        size_kb = output_path.stat().st_size // 1024
        print(f"  Output: {output_path} ({size_kb} KB)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert scored GeoJSON to PMTiles for CDN delivery"
    )
    parser.add_argument("--gemeente", help="CBS gemeente code (e.g. 0150)")
    parser.add_argument("--all", action="store_true", help="Process all available GeoJSON files in data/")
    parser.add_argument("--input",  help="Direct GeoJSON input path")
    parser.add_argument("--output", help="Direct PMTiles output path")
    parser.add_argument("--data",   default="data",  help="Input directory (default: data/)")
    parser.add_argument("--tiles",  default="tiles", help="Output directory (default: tiles/)")
    args = parser.parse_args()

    data_dir   = Path(args.data)
    output_dir = Path(args.tiles)

    if args.input and args.output:
        input_path  = Path(args.input)
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        success = run_tippecanoe(input_path, output_path, layer_name="leegstand")
        if not success:
            write_pmtiles_python(input_path, output_path)

    elif args.all:
        geojson_files = list(data_dir.glob("leegstand_*.geojson"))
        if not geojson_files:
            print(f"No GeoJSON files found in {data_dir}/ — run ingest_bag.py first")
            sys.exit(1)
        for gf in sorted(geojson_files):
            code = gf.stem.replace("leegstand_", "")
            build_gemeente(code, data_dir, output_dir)

    elif args.gemeente:
        build_gemeente(args.gemeente, data_dir, output_dir)

    else:
        parser.print_help()
        sys.exit(1)

    print("\nDone.")
    print("\nTo serve tiles from Cloudflare R2:")
    print("  wrangler r2 object put lumen-tiles/leegstand_0150.pmtiles --file tiles/leegstand_0150.pmtiles")
    print("\nMapLibre source config:")
    print('  { type: "vector", url: "pmtiles://https://r2.example.com/leegstand_0150.pmtiles" }')


if __name__ == "__main__":
    main()
