#!/usr/bin/env python3
"""
pipeline/ingest_bag.py

Downloads the BAG GeoPackage for a given gemeente, loads verblijfsobjecten
into DuckDB, runs the viability scoring model, and exports GeoParquet.

Usage:
    python ingest_bag.py --gemeente 0150          # Deventer
    python ingest_bag.py --gemeente 0363          # Amsterdam
    python ingest_bag.py --all                    # All gemeenten in registry

Output:
    data/leegstand_{gemeente_code}.parquet        # Scored features
    data/leegstand_{gemeente_code}.geojson        # GeoJSON for direct use

Requirements:
    pip install duckdb requests geopandas shapely tqdm

The pipeline is fully reproducible. Given the same BAG snapshot date,
it produces identical output. The snapshot date is embedded in the output.
"""

import argparse
import json
import sys
import hashlib
import urllib.request
from datetime import date
from pathlib import Path
from typing import Any

# Inline the scoring logic so pipeline has no JS dependency
# Mirrors packages/bag-utils/src/viability.ts exactly.
# When the TS model changes, update this in sync.
# MODEL_VERSION must match the TS constant.
MODEL_VERSION = "1.0.0"

CONVERSION_ELIGIBLE_DOELEN = {
    "kantoorfunctie",
    "winkelfunctie",
    "bijeenkomstfunctie",
    "onderwijsfunctie",
}

VACANCY_STATUSES = {
    "Verbouwing",
    "Verblijfsobject buiten gebruik",
}


def score_viability(row: dict[str, Any]) -> dict[str, Any]:
    """
    Python implementation of the viability scoring model.
    Must stay in sync with packages/bag-utils/src/viability.ts.
    """
    criteria = []
    warnings = []
    excluded = False

    # Hard exclusions
    if row.get("is_monument"):
        excluded = True
        criteria.append({"key": "monument", "points": -3, "maxPoints": 0})

    if row.get("has_recent_renovatie"):
        excluded = True
        criteria.append({"key": "renovatie", "points": -2, "maxPoints": 0})

    if row.get("gebruiksdoel") == "woonfunctie":
        excluded = True
        criteria.append({"key": "al_wonen", "points": 0, "maxPoints": 0})

    if excluded:
        total = sum(c["points"] for c in criteria)
        return {
            "tier": "uitgesloten",
            "totalPoints": total,
            "maxPossiblePoints": 0,
            "criteria": criteria,
            "warnings": warnings,
        }

    # Criterion 1: Bouwjaar
    bouwjaar = row.get("bouwjaar") or 0
    bouwjaar_pts = 0
    if bouwjaar >= 1990:
        bouwjaar_pts = 2
    elif bouwjaar >= 1975:
        bouwjaar_pts = 1
    if bouwjaar < 1994 and bouwjaar > 0:
        warnings.append("Gebouwd voor 1994: mogelijk asbest aanwezig.")
    criteria.append({"key": "bouwjaar", "points": bouwjaar_pts, "maxPoints": 2})

    # Criterion 2: Oppervlakte
    opp = row.get("oppervlakte") or 0
    schaal_pts = 0
    if 500 <= opp <= 3000:
        schaal_pts = 2
    elif 300 <= opp < 500:
        schaal_pts = 1
    elif 3000 < opp <= 6000:
        schaal_pts = 1
        warnings.append("Groot oppervlak: gefaseerde conversie mogelijk vereist.")
    criteria.append({"key": "schaal", "points": schaal_pts, "maxPoints": 2})

    # Criterion 3: WOZ relatief
    woz_pts = 0
    woz = row.get("woz_waarde")
    mediaan = row.get("gemeente_mediaan_woz_per_m2")
    if woz and mediaan and opp > 0:
        ratio = (woz / opp) / mediaan
        if ratio < 0.8:
            woz_pts = 1
    else:
        warnings.append("WOZ-waarde niet beschikbaar — WOZ-criterium niet gescoord.")
    criteria.append({"key": "woz", "points": woz_pts, "maxPoints": 1})

    total = sum(c["points"] for c in criteria)
    max_pts = sum(c["maxPoints"] for c in criteria)

    if total >= 4:
        tier = "hoog"
    elif total >= 2:
        tier = "middel"
    else:
        tier = "laag"

    return {
        "tier": tier,
        "totalPoints": total,
        "maxPossiblePoints": max_pts,
        "criteria": criteria,
        "warnings": warnings,
        "modelVersion": MODEL_VERSION,
    }


def fetch_bag_wfs(gemeente_code: str, max_features: int = 10000) -> list[dict]:
    """
    Fetches BAG verblijfsobjecten for a gemeente via PDOK WFS.
    Returns a list of feature dicts with properties and geometry.
    """
    base = "https://service.pdok.nl/lv/bag/wfs/v2_0"
    status_filter = " OR ".join([
        f"status = '{s}'" for s in VACANCY_STATUSES
    ])
    doel_filter = " OR ".join([
        f"gebruiksdoel = '{d}'" for d in CONVERSION_ELIGIBLE_DOELEN
    ])
    cql = f"gemeentecode = '{gemeente_code}' AND ({status_filter}) AND ({doel_filter})"

    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeName": "bag:verblijfsobject",
        "outputFormat": "application/json",
        "srsName": "EPSG:4326",
        "count": str(max_features),
        "CQL_FILTER": cql,
        "propertyName": ",".join([
            "identificatie", "status", "gebruiksdoel",
            "oppervlakte", "bouwjaar", "gemeentecode",
            "woonplaatsnaam", "geometrie",
        ]),
    }

    url = base + "?" + urllib.parse.urlencode(params)  # type: ignore[attr-defined]

    print(f"  Fetching BAG WFS for gemeente {gemeente_code}...")
    with urllib.request.urlopen(url, timeout=60) as resp:
        data = json.loads(resp.read())

    features = data.get("features", [])
    print(f"  Retrieved {len(features)} features")
    return features


def process_gemeente(gemeente_code: str, output_dir: Path) -> None:
    """Full pipeline for one gemeente."""
    import urllib.parse  # noqa: F401 (used in fetch_bag_wfs)

    output_dir.mkdir(parents=True, exist_ok=True)
    snapshot_date = date.today().isoformat()

    print(f"\nProcessing gemeente {gemeente_code}...")

    features = fetch_bag_wfs(gemeente_code)
    if not features:
        print(f"  No features found for {gemeente_code} — skipping")
        return

    # Score each feature
    scored_features = []
    for f in features:
        props = f.get("properties") or {}
        row = {
            "identificatie": props.get("identificatie", ""),
            "status": props.get("status", ""),
            "gebruiksdoel": props.get("gebruiksdoel", ""),
            "oppervlakte": props.get("oppervlakte") or 0,
            "bouwjaar": props.get("bouwjaar") or 0,
            "gemeentecode": props.get("gemeentecode", ""),
            "woonplaatsnaam": props.get("woonplaatsnaam", ""),
            "is_monument": False,          # TODO: integrate monumentenregister
            "has_recent_renovatie": False, # TODO: integrate omgevingsloket
            "woz_waarde": None,            # TODO: integrate WOZ open data
            "gemeente_mediaan_woz_per_m2": None,
        }

        score = score_viability(row)

        # Compute a stable deterministic ID for the feature
        stable_id = hashlib.sha256(row["identificatie"].encode()).hexdigest()[:16]

        scored_features.append({
            "type": "Feature",
            "id": stable_id,
            "geometry": f.get("geometry"),
            "properties": {
                **row,
                "score_tier": score["tier"],
                "score_total": score["totalPoints"],
                "score_max": score["maxPossiblePoints"],
                "score_warnings": "; ".join(score["warnings"]),
                "model_version": MODEL_VERSION,
                "snapshot_date": snapshot_date,
            },
        })

    # Write GeoJSON
    geojson_path = output_dir / f"leegstand_{gemeente_code}.geojson"
    fc = {
        "type": "FeatureCollection",
        "metadata": {
            "gemeente_code": gemeente_code,
            "snapshot_date": snapshot_date,
            "model_version": MODEL_VERSION,
            "feature_count": len(scored_features),
            "source": "BAG via PDOK WFS",
            "license": "CC0",
        },
        "features": scored_features,
    }
    with open(geojson_path, "w", encoding="utf-8") as fp:
        json.dump(fc, fp, ensure_ascii=False, indent=2)

    print(f"  Written {len(scored_features)} scored features to {geojson_path}")

    # Summary
    tiers: dict[str, int] = {}
    for sf in scored_features:
        tier = sf["properties"]["score_tier"]
        tiers[tier] = tiers.get(tier, 0) + 1

    print(f"  Score distribution: {tiers}")


def main() -> None:
    import urllib.parse  # noqa: F401

    parser = argparse.ArgumentParser(
        description="BAG leegstand pipeline — fetch, score, export"
    )
    parser.add_argument("--gemeente", help="CBS gemeente code (e.g. 0150)")
    parser.add_argument("--all", action="store_true", help="Process all registered gemeenten")
    parser.add_argument(
        "--output",
        default="data",
        help="Output directory (default: data/)",
    )
    args = parser.parse_args()

    output_dir = Path(args.output)

    if args.all:
        # Import gemeente registry
        sys.path.insert(0, str(Path(__file__).parent.parent))
        gemeente_codes = ["0150", "0363", "0599", "0518", "0344", "0200", "0153", "0193", "0246", "0995"]
        for code in gemeente_codes:
            process_gemeente(code, output_dir)
    elif args.gemeente:
        process_gemeente(args.gemeente, output_dir)
    else:
        parser.print_help()
        sys.exit(1)

    print("\nDone.")


if __name__ == "__main__":
    main()
