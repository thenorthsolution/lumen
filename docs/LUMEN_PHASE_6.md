# Lumen Phase 6 completion

Phase 6 introduces the first canonical opportunity slice while keeping the Vacancy and Space applications operational and unmigrated.

## Delivered

- `OpportunityEntity` adds a renderer-neutral opportunity kind, tier, score, methodology version, candidate flag and optional housing estimate.
- A server-side viewport endpoint requests a bounded set of BAG verblijfsobjecten and applies the existing `@lumen/bag-utils` viability method.
- Results retain the BAG source, retrieval time, method version and the explicit assumption that BAG status is a proxy rather than confirmed vacancy.
- The MapLibre adapter loads opportunity points independently from building footprints, supports cancellation and viewport caching, and registers them under the existing Vacancy layer.
- Building and opportunity entity sets can refresh independently without deleting each other or invalidating an unrelated selection.

## Deliberate limits

This slice is not a national opportunity search and does not claim verified vacancy. Space classification, zoning intersection, combined ranking and Pipeline evidence remain outside this phase. They should move server-side before being exposed as one ranked result set.
