# Lumen Phase 8 foundation

Phase 8 introduces versioned project and scenario contracts and enables honest session-only project creation.

## Delivered

- `ProjectRecord` includes schema version, workspace, optional site, lifecycle status, organization and actor scope, provenance and audit timestamps.
- `ScenarioRecord` contains structured scenario objects, assumptions and lifecycle state.
- `ScenarioObject` supports footprints, massing, landscape, demolition, infrastructure and phase boundaries as WGS84 geometry with parameters and provenance.
- `ProjectRepository` defines scoped read and write operations without prescribing a database.
- Validation rejects cross-organization project access, invalid versions, mismatched scenarios and generated geometry without provenance.
- `create_project` now creates an explicit session project from the selected world entity.
- `save_workspace` remains unavailable and states why. No UI implies that a session project has been persisted.

## Persistence gate

Durable storage requires authenticated organization and actor identity, repository migrations, row-level authorization, retention rules and audit logging. Those dependencies must exist before a repository adapter can enable `save_workspace`.
