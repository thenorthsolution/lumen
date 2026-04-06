# Project Lumen: Master Roadmap 🛰️

**Vision:** Evolve Project Lumen from a static spatial mapping tool into an AI-powered Spatial Operating System. The goal is a "Command Center" experience where municipal planners and researchers can interrogate building data at scale, moving from macro-level regional pipelines to micro-level building ontologies in seconds.

---

## Phase 1: The "Command Center" UI/UX

_Status: In Progress_

The interface must handle high-density data without overwhelming the user. We are moving away from standard map popups to a robust "Deep Dive" architecture.

- **The Entity Panel:** Replacing basic map popups with a sliding right-hand drawer that acts as a comprehensive dossier for a selected building (Pand/Verblijfsobject).
- **High-Density Data Tables:** Implement Shadcn-based collapsible data tables beneath the map for batch analysis of filtered regions.
- **Property Timeline:** A visual timeline component within the Entity Panel showing the history of a building (e.g., Year built -> Permit granted -> Status changed -> Flagged by user).
- **Keyboard Navigation:** Command-K (macOS) / Ctrl-K (Windows) shortcut to instantly search addresses, IDs, or municipalities without touching the mouse.

---

## Phase 2: Project Lumen AIP (AI Integration)

_Status: Local Proof-of-Concept_

Deploying our natural language spatial query engine to production. This allows users to search the map using prompts rather than manual filters.

- **Decoupled AI Architecture:** Migrate the HuggingFace Python backend off Vercel to a dedicated microservice (Modal / Fly.io) to bypass serverless execution limits.
- **Natural Language to GIS:** Translate user prompts (e.g., _"Show me all offices over 500m2 built before 1990 near Deventer station that haven't changed status in 10 years"_) into DuckDB/SQL spatial queries.
- **Semantic Search Panel:** A terminal-style input bar on the UI where users can run natural language queries and see the AI's parameter breakdown before execution.
- **Automated Viability Insights:** LLM-generated summaries inside the Entity Panel explaining _why_ a specific building scored high on the conversion viability index.

---

## Phase 3: The Building Ontology (Deep Data Integration)

_Status: Planned_

A building is more than its BAG record. We need to ingest secondary and tertiary datasets to prove the "Hidden Vacancy" thesis.

- **KvK (Chamber of Commerce) Cross-Referencing:** Overlay business registry data. If a building is "In gebruik" as an office, but no active KvK entities are registered there, flag it as a "Ghost Office."
- **Energy Label API Integration:** Add EPBD data to the Entity Panel to instantly assess the sustainability retrofit cost of a conversion candidate.
- **Omgevingsloket Historical Interrogation:** Scrape or ingest historical permit requests to see if a developer previously tried and failed to convert a specific plot.
- **Streetview / 3D Context:** Embed PDOK 3D building models or Mapillary open street-level imagery directly into the Entity Panel to assess physical condition without a site visit.

---

## Phase 4: Multi-Purpose & Collaboration Workflow

_Status: Planned_

Lumen must become a tool for action, not just observation.

- **The "Flag & Correct" Engine (Supabase):** Finalize the crowdsourcing loop. Users can submit ground-truth corrections (e.g., "This building is empty") which are visually distinguished on the map as "Community Intelligence."
- **Workspace States:** Allow researchers to save a specific map state (filters, AI query results, selected buildings) and generate a shareable, unique URL.
- **Export & Reporting:** One-click export of a selected geographic bounding box into a structured CSV, GeoJSON, or PDF Dossier for municipal policy meetings.
- **Overlays (Multi-purpose):** Add toggleable layers for broader urban planning context, such as Flood Risk Zones (Klimaateffectatlas) and Public Transit Isochrones.

---

## Technical Debt & Infrastructure

- **Vector Tile Optimization:** Pre-generate PMTiles for static layers (like Bouwjaren) to reduce live WFS query load on PDOK and ensure 60fps rendering.
- **Type Safety:** Enforce strict generic typing across the `packages/logic` scoring engine so external datasets can easily plug into the viability math.
