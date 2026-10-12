# Lumen Phase 7 completion

Phase 7 combines the first vacancy and space signals into explainable opportunity rankings. It deliberately excludes prototype Pipeline mock data from decision evidence.

## Delivered

- `OpportunityEvidence` identifies vacancy, space or pipeline evidence with its own score, weight, confidence, rationale and provenance.
- `rankOpportunity` calculates a bounded confidence-weighted score and exposes its method version and evidence count.
- The live BAG opportunity endpoint adds a conservative spatial prescreen for infill, redevelopment or transformation. It clearly records that no parcel, ownership or zoning intersection has occurred.
- `rank_world_opportunities` validates its inputs through the shared tool registry and selects the highest scoring loaded candidate through `WorldCommand`.
- Text commands such as `rangschik de beste kansen` use that same action path.

## Pipeline gate

The current Pipeline prototype contains mock permit metrics and province-level aggregates. These are not attached to individual opportunities. Pipeline evidence remains `false` until a reproducible geographic join can provide dated, source-backed delivery context at a defensible scale.

## Next gate

Phase 8 should design persistent project and scenario schemas before enabling the existing `create_project` command. Persistence requires organization scope, authorization, migrations and explicit ownership of generated geometry.
