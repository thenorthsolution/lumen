# Contributing to Lumen

First: thank you. These tools exist to serve the public interest, and community contributions make them better than any single team can.

---

## Ways to contribute

### 1. Report a data problem (no coding required)

The fastest way to improve data quality: use the **"Rapporteer dataprobleem"** button inside any tool. Your report is stored and reviewed. No GitHub account needed.

### 2. Add a gemeente to the registry

The gemeente registry (`packages/pdok-client/src/gemeente.ts`) currently covers a selection of municipalities. Adding your gemeente is a great first PR.

**Format:**

```ts
"XXXX": {
  code: "XXXX",           // CBS gemeentecode, zero-padded to 4 digits
  name: "Gemeente naam",
  province: "Provincie",
  bbox: [west, south, east, north], // WGS84
  centroid: [lng, lat],             // WGS84
  zoom: 12,                         // MapLibre default zoom (12 = gemeente, 13 = city centre)
},
```

**Where to find the values:**

- CBS gemeentecode: https://www.cbs.nl/nl-nl/onze-diensten/methoden/classificaties/overig/gemeentelijke-indelingen-per-jaar
- Bounding box and centroid: https://nominatim.openstreetmap.org (search your gemeente, check the JSON response)

### 3. Improve the viability scoring model

The model lives in `packages/bag-utils/src/viability.ts`. It is intentionally simple and explicitly designed to be improved.

Good improvement directions:

- **WOZ integration:** Add real WOZ data lookup via CBS or gemeente open data APIs
- **Asbestos risk:** Pre-1994 flag is a warning only — improving this with Bodemloket data would be valuable
- **Floor plate analysis:** Corridor buildings (pre-1990 kantoorpanden) convert differently than open-floor plates
- **Nitrogen proximity:** Cross-reference with RIVM stikstofkaart to flag objects in sensitive zones
- **Doorstroming score:** Score objects for suitability as senior/intermediate housing

**When changing the model:**

- Increment the `VERSION` constant in `viability.ts`
- Update `SCORING.md` with the rationale for any changed criterion
- Add tests in `viability.test.ts` for the new logic

### 4. Build ruimtevinden or bouwcapaciteitcheck

These tools follow the same architecture as leegstandsradar. The Claude prompts that specify each tool are in the project README. Good first issues are labeled `good-first-issue` on GitHub.

---

## Code standards

**TypeScript:**

- Strict mode is on. No `any`. No `as unknown as X` chains.
- Exported functions must have JSDoc comments.
- Types live close to their usage — avoid a global `types.ts` file.

**CSS:**

- CSS Modules only. No inline styles except for dynamic values.
- Use design tokens from `globals.css`. No hardcoded hex values.
- Dark mode is not optional — test every change with `prefers-color-scheme: dark`.

**Components:**

- One component per file.
- Client components (`"use client"`) only where needed — prefer server components for static content.
- Accessibility: all interactive elements need ARIA labels. Maps need `role="application"`.

**Commits:**

```
feat(leegstandsradar): add WOZ scoring criterion
fix(pdok-client): correct Deventer bounding box
docs(bag-utils): expand viability model limitations
```

---

## Pull request process

1. Fork the repo and create a branch: `git checkout -b feat/my-change`
2. Make your changes with tests where applicable
3. Run `npm run type-check` and `npm run lint` — both must pass
4. Open a PR with a clear description of what changed and why
5. Reference any related issues

PRs that add new scoring criteria must include:

- The criterion rationale
- The data source
- A note on the criterion's limitations

---

## Data pipeline contributions (Python)

The `pipeline/` directory contains the data preprocessing scripts. These require:

- Python 3.11+
- DuckDB (`pip install duckdb`)
- GDAL for GeoPackage handling (`pip install gdal` or via conda)

Run the full pipeline:

```bash
cd pipeline
python ingest_bag.py      # Downloads BAG GeoPackage for a gemeente
python score_leegstand.py # Runs viability model, outputs GeoParquet
python build_pmtiles.py   # Converts to PMTiles for CDN serving
```

The pipeline is intentionally reproducible — given the same BAG snapshot, it produces identical output.

---

## Questions

Open a GitHub Discussion for anything that isn't a bug or a PR. We respond within a few days.

---

_North Solution — thenorthsolution.com_
