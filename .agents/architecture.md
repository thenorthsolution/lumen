# Lumen Architecture Notes

## Product Shape

Lumen is one public-interest housing intelligence platform with three connected domains:

- Vacancy: vacant or underused buildings suitable for conversion research.
- Space: underused land and sites with housing potential.
- Pipeline: permits, tenders, delivery pressure, and bottleneck signals.

Keep these as product modules, not disconnected products.

## Repo Shape

- `apps/vacancy` is currently the first unified MVP shell.
- `apps/space` remains the land-opportunity module.
- `apps/pipeline` remains the delivery/pipeline module.
- `packages/pdok-client` owns municipality metadata and PDOK helpers.
- `packages/bag-utils` owns BAG status constants and conversion scoring.
- `services/nls` is optional semantic-search infrastructure for vacancy.
- `pipeline` is Python/DuckDB geodata infrastructure, separate from the Next.js apps.
- `docs` contains governance and trust documentation.

## Boundary Rules

- Shared geodata helpers belong in `packages/pdok-client`.
- Shared BAG scoring/status logic belongs in `packages/bag-utils`.
- App-specific UI state belongs inside the app that owns the workflow.
- Do not duplicate scoring logic across apps unless there is a documented migration reason.
- If Python and TypeScript scoring diverge, document the divergence and version it.

## Data Rules

- Treat BAG, RO, TenderNed, permits, and pipeline data as signals, not proof.
- Every visible opportunity should expose source, confidence, limitation, and local verification need.
- Do not imply confirmed vacancy, legal buildability, ownership availability, or investment quality unless directly proven by a cited source.
