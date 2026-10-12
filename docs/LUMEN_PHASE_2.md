# Lumen Phase 2 completion

Phase 2 establishes the first live spatial vertical slice without migrating a prototype shell.

## Delivered

- MapLibre is isolated in a client-only renderer boundary and is absent from server rendering.
- A server route requests a bounded BAG `pand` viewport from the PDOK OGC API, aborts slow requests, and normalizes records to `WorldEntity` with retrieval time and source provenance.
- Map gestures publish settled camera snapshots through `WorldCommand`; command-driven navigation is applied back through the adapter without a feedback loop.
- Building visibility, loading, errors, hover, picking, selection, and inspector data use renderer-neutral world state.
- Requests below the useful building zoom are deferred; superseded viewport requests are aborted and result counts are capped.

## Validation and known issue

Type checking, unit/component tests, lint, and the production build pass. The local smoke test reached the route but PDOK did not answer within eight seconds in the implementation environment; the route returned an honest typed HTTP 502 response. No placeholder building is substituted for unavailable source data.

Phase 3 can add Cesium only after browser verification against a responsive PDOK session confirms the Phase 2 selection and camera gate.
