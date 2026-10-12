# Lumen Architecture

Status: Phase 0 audit and Phase 1 foundation, 10 September 2026.

## Product boundary

Lumen is one spatial operating system, not a navigation layer over three dashboards. The map or 3D scene is the primary surface. Vacancy, Space, and Pipeline remain independent prototypes until their methods and data are normalized behind shared world entities.

The foundation started without live renderers, then crossed its first migration gate: Lumen now has a MapLibre adapter with live PDOK background and viewport-bounded BAG data, plus a lazy Cesium adapter backed by the keyless Dutch 3D Basisvoorziening. The open-core repository also exposes cloud-neutral entitlement, usage, artifact, and AI-provider contracts. Optional Supabase, Stripe, and Vercel AI Gateway adapters are isolated from renderer state. Voice, realtime collaboration, wholesale legacy migration, and the national tile pipeline remain later work.

## Current repository audit

The repository is a pnpm/Turborepo with three Next.js 15/React 19 applications, small TypeScript domain packages, a Python/DuckDB ingestion pipeline, and a Python/PostGIS/pgvector natural-language search service.

### Proven assets

- `@lumen/bag-utils` contains the clearest reusable domain logic: explicit BAG status semantics and a versioned viability calculation.
- `@lumen/pdok-client` supplies typed municipality metadata and PDOK request construction.
- `pipeline/` produces reproducible, timestamped GeoJSON and PMTiles outputs.
- `services/nls` combines semantic retrieval with conservative SQL filters and returns IDs and coordinates suitable for world navigation.
- The public-interest, access, data-use, methodology, and correction documents already define useful product governance.

### Structural debt

- Each prototype owns a separate shell, selection model, filter model, layer state, map lifecycle, visual tokens, and MapLibre style.
- Vacancy's `MapCanvas.tsx` is more than 1,700 lines and mixes renderer lifecycle, fetching, debouncing, feature conversion, camera behavior, selection, presentation, and experimental 3D behavior.
- The prototype app shells are broad client components. Pipeline additionally mixes substantial inline styling and data-fetch lifecycle into the shell.
- Design variables are repeated and semantically inconsistent. `@lumen/design-system` was only a one-token seed, while `@lumen/ui` is a large generated primitive catalog with a separate theme.
- Map data is primarily loaded as GeoJSON into browser memory. This is useful for municipal prototypes but cannot become the national world architecture.
- Viability rules exist in TypeScript and Python and require manual version synchronization.
- Cesium experiments use global scripts and `any`, and are not an acceptable production renderer boundary.
- Automated test coverage is minimal; several packages expose no test task. Legacy `next lint` scripts are incompatible with newer Next CLI behavior.
- Package versions are uneven across the root, prototypes, and UI package. Framework upgrades must be handled separately from the foundation build.

## One Lumen World

`@lumen/world` is the renderer-neutral contract. It defines branded identifiers, `WorldEntity`, WGS84 geometry references, provenance, camera/selection/layer state, shallow project references, typed commands, structured command results, and `RendererAdapter`.

The new application store is an external store with a stable snapshot and React `useSyncExternalStore` subscription. A later store implementation may add selector helpers, persistence, or transaction history without changing command or renderer contracts.

```text
Mouse / keyboard   Text agent   Realtime voice
        \             |             /
                 WorldCommand
                      |
              command executor
                      |
                 WorldState
            /          |          \
       UI panels   MapLibre     Cesium
```

Direct controls never manipulate a renderer as product state. They dispatch the same commands future agent tools will use. Unsupported commands return `unavailable`; the interface must never confirm an action that did not happen.

## Renderer architecture

Every renderer implements lifecycle, camera, selection, layer, annotation, and capability methods. Renderer instances, animation frames, and high-frequency camera values remain imperative and outside React. Only settled camera values and UI-relevant state return to the store.

MapLibre is the default real adapter. Cesium remains a separate dynamic import, so it is requested only after an explicit 3D switch. Both publish settled camera state through `WorldCommand`; neither exposes renderer objects to product state.

The Cesium path uses a small render governor adapted from God's Eye View. Rendering is idle by default, changes request bounded frames, and camera flights acquire an identity-based continuous-render hold which is released on completion or cancellation. Camera application first compares the desired and current view to prevent store/renderer feedback loops.

Camera changes require a single owner. User gestures, selection fly-to, scene playback, and agent navigation must acquire and release navigation ownership so two render loops cannot write the camera simultaneously.

## Data and provenance

Spatial services normalize source records into `WorldEntity` values at the boundary. Derived facts retain source identity, retrieval time, confidence, assumptions, and method version. Large datasets remain in tiles or spatial databases rather than React state. The client stores only viewport results, identifiers, interaction state, and compact derived summaries.

The NLS service is retrieval infrastructure, not an authority. Semantic matches supply candidate IDs; deterministic spatial/domain tools validate facts and calculations before state changes or explanations.

## Performance architecture

- Lazy-load MapLibre/Cesium modules and activate only the selected renderer.
- Use vector/3D tiles, LOD, viewport queries, and server-side PostGIS operations for national data.
- Keep render loops and pointer/camera transients outside React; subscribe panels to narrow settled state.
- Run expensive client geometry conversion in Web Workers and transfer compact typed data.
- Abort superseded requests and guard asynchronous results by request/view version.
- Stream agent execution independently of the render loop and apply incremental, typed results.
- Cache by query, source snapshot, method version, and organization boundary; never separate cached values from provenance.
- Measure initial bundle size, renderer activation latency, frame time, long tasks, tile latency, and memory before Phase 3.

## God’s Eye View assessment and source adoption

Patterns adopted from the reference project include the world-first surface, modular layer lifecycle, agent actions that operate the scene, explicit camera ownership, structured annotations, progressive loading, and truthful action results. The project demonstrates why scene state and tools must be separate from a particular input method.

Source adaptations are pinned to upstream commit `759652207fd1279ece97f0f19af566feb9a82146` and recorded in the root `THIRD_PARTY_NOTICES.md`. The current port covers:

- identity-based idle/continuous Cesium render governance;
- deterministic keyless 3D Basisvoorziening startup through PDOK;
- defensive Cartesian pick validation before positions enter Lumen commands;
- settled camera readback and feedback-loop prevention.

The port is deliberately narrow. No upstream dataset, model, media, credential, military layer, moving-object system, or application shell is copied. Provider-specific objects remain inside the Cesium adapter and selections are resolved back to canonical `WorldEntity` identifiers.

Lumen rejects its tactical/surveillance language, realtime moving-object architecture, monolithic vanilla-JS UI, Cesium-bound domain state, spectacle-only shaders, and direct voice-to-renderer coupling. Lumen uses the interaction principles, not the product identity or implementation architecture.

## Design and accessibility

`@lumen/design-system` owns semantic tokens for both color schemes, spatial/data states, confidence, provenance, motion, focus, and map/chart colors. Phase 1 defaults to a quiet graphite and warm-white dark environment with gold used for focus and opportunity—not generic AI decoration.

The shell is keyboard operable: Command/Ctrl-K focuses the composer, L toggles the layer rail outside inputs, Escape closes transient context, and every icon control has an accessible name. Status changes use a polite live region and motion respects `prefers-reduced-motion`.

## Open core and managed cloud

The public repository must remain independently useful. It owns the world contracts, renderer adapters, public data pipelines, deterministic methods, provenance and local/public viewer. A separate private `lumen-cloud` repository may import these packages and add managed prompts, evaluations, collaboration, commercial connectors, deployment configuration and enterprise operations. Provider absence is a supported state, not an application error.

Identity uses Supabase cookie sessions. Organization and project rows are protected with RLS. Usage is reserved atomically before provider work, then settled from measured results or released after failure. Stripe webhooks are signature-verified and applied through an idempotent, event-time-aware database function. Browser clients never determine their own plan, price, or quota.

The AI route streams through AI Gateway and exposes client-executed world tools only for reversible world actions. The existing `WorldCommand` executor remains authoritative. Expensive or externally visible actions require a later review/confirmation UI before tools are registered for model use.

## Decision log and risks

- Keep Next.js 15/React 19 for Phase 1; version alignment is a separate change.
- Persist project/workspace identity now, while keeping scenario and artifact content shallow and versioned until the domain engines mature.
- Keep the legacy applications unchanged. Shared changes must remain backwards compatible.
- The first live adapters validate the boundary and interaction model; they are not yet a national-scale data architecture.
- Full selection fidelity across complex 3D Tiles, CRS transformation, collaboration UI, durable AI conversations, artifact generation, and production storage policies remain later-phase work.
