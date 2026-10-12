# Lumen Migration

## Strategy

Capabilities move into the unified world by domain contract, never by copying a prototype screen. Each migration must preserve methodology and provenance, normalize output to `WorldEntity`, expose behavior through typed commands, and prove 2D/3D synchronization before the originating prototype can be retired.

## Migration matrix

| Area | Decision | Treatment |
| --- | --- | --- |
| BAG status and viability methodology | KEEP | Preserve formulas, tests, version, limitations, and public documentation. |
| PDOK helpers and municipality registry | KEEP | Reuse behind server/data adapters; retain typed request construction. |
| Python pipeline and PMTiles approach | KEEP | Preserve reproducibility and snapshot metadata; evolve outputs toward canonical entities. |
| NLS hybrid retrieval concepts | KEEP | Use for candidate discovery; validate facts with deterministic tools. |
| Pipeline methodology and visual analysis | KEEP | Reframe as location and delivery intelligence instead of a separate destination. |
| Prototype data fetching | REFACTOR | Move fetch, abort, cache, validation, provenance, and normalization into dedicated services. |
| Map sources and layer definitions | REFACTOR | Convert to registry-backed renderer definitions with stable IDs and lifecycle state. |
| Vacancy and Space scoring/results | REFACTOR | Normalize into one Opportunity model while preserving source-specific evidence. |
| Design system and UI primitives | REFACTOR | Use canonical Lumen tokens and curate only needed accessible primitives. |
| Prototype shells and navigation | REPLACE | Use the world-first workspace and contextual panels. |
| App-local selection/camera/filter state | REPLACE | Use canonical world state and typed commands. |
| Duplicated MapLibre lifecycle/style code | REPLACE | Implement one adapter and registry-driven layer modules. |
| Global-script/untyped Cesium experiment | REPLACE | A lazy typed adapter now exists; continue hardening it rather than migrating the prototype script. |
| Tactical styling or realtime contact systems | ARCHIVE/REJECT | Not relevant to the built-environment product. |
| Obsolete experiments | ARCHIVE LATER | Archive only after replacement parity and documented approval; delete nothing now. |

## Phased migration gates

### Phase 2 — core spatial world

- [x] Implement MapLibre behind `RendererAdapter` and synchronize settled camera state.
- [x] Load viewport-bounded PDOK/BAG data and normalize selectable Deventer buildings to `WorldEntity` with source attribution.
- [x] Route feature selection, camera, and layer state through world commands.
- [x] Abort superseded viewport requests and ignore stale responses.
- [ ] Replace broad WFS viewport responses with a tile/LOD path suitable for national scale and add production telemetry.

Gate: a user opens Lumen, navigates Deventer, selects a real building, and sees a provenance-bearing inspector without importing a prototype shell.

### Phase 3 — high-fidelity 3D

- [x] Add a lazy typed Cesium adapter with PDOK imagery and 3D BAG tiles.
- [x] Port the God's Eye View idle-render governor, provider fallback, and safe pick validation.
- [x] Preserve canonical camera, selection, layers, annotations, and scenario objects across renderer switches.
- [ ] Add exact 3D-feature-to-BAG identity mapping, terrain policy, navigation ownership for competing tools, and measured performance budgets.

Gate: one selected real building remains selected and correctly framed across 2D and 3D.

### Phases 4–7 — interaction and intelligence

- [x] Register the first validated, client-executed agent tools over `WorldCommand` and add an optional streaming AI Gateway route.
- [x] Add cloud-neutral entitlement, usage-ledger, action-risk, artifact and provider contracts.
- [ ] Add review and confirmation UI before project-changing or external-effect tools become available to the model.
- Add realtime voice only as another command producer.
- Normalize Vacancy and Space into Opportunity entities, then add Pipeline evidence as delivery context.

Gate: combined results are ranked with visible evidence and never expose the legacy app boundaries.

### Phases 8–10 — projects and organizations

- [x] Add the first Supabase migration for profiles, organizations, memberships, workspaces, projects, scenarios, artifacts, private-default sharing, subscriptions, audit and provider usage.
- [x] Add passwordless account entry, a 14-day organization-trial path, project saving, Stripe checkout/portal/webhook boundaries and RLS policies.
- [ ] Add invitation acceptance, collaboration, share-link management, artifact persistence and enterprise SSO.
- Add deterministic capacity, cost, schedule, planning, sustainability, and risk tools.
- Introduce organization-scoped retrieval and authorization before private data ingestion.

## Compatibility and retirement

All three prototype applications remain buildable and deployable during migration. Shared packages use additive changes until a prototype is formally retired. A capability is eligible for retirement only when methodology parity, provenance, accessibility, performance, and regression checks are documented. Old experiments may then move to an archive branch or history; Phase 0–1 performs no deletion.

## Known migration risks

- Browser-loaded municipal GeoJSON will not scale nationally; tile and PostGIS boundaries are required early.
- TypeScript/Python scoring parity can drift; use shared fixtures and version gates before methodology changes.
- Camera feedback loops are guarded and flights hold the render governor; explicit priority arbitration is still required before tools can compete for navigation.
- Public source latency and schema changes require abortable adapters, validation, caching, and visible freshness.
- Organization intelligence introduces strict tenancy and retrieval boundaries and must not be layered onto public indexing implicitly.
