import type { Bounds, EntityId, Position, ProjectId, Provenance, RendererMode } from "./index";

export type DataAccess = "public" | "account" | "organization" | "government" | "licensed";
export type DataFreshness = "live" | "daily" | "monthly" | "quarterly" | "annual" | "on-demand";
export type DataAvailability = "available" | "planned" | "requires-connection" | "unavailable";

export interface DataSourceDefinition {
  id: string; label: string; authority: string; description: string;
  access: DataAccess; freshness: DataFreshness; availability: DataAvailability;
  licenseUrl?: string; coverage: "national" | "regional" | "local"; facets: readonly string[];
}

export interface DatasetSnapshot {
  id: string; sourceId: string; version: string; capturedAt: string; validFrom?: string; validUntil?: string;
  coverage?: Bounds; license: string; checksum?: string; methodVersion?: string;
}

export interface SourceRecord {
  id: string; snapshotId: string; externalId: string; entityId?: EntityId; observedAt: string;
  payloadReference?: string; provenance: Provenance;
}

export interface SpatialMetric {
  key: string; label: string; value: number | null; unit: string; status: "measured" | "estimated" | "missing";
  provenance: Provenance; limitations?: readonly string[];
}

export interface SpatialObservation {
  id: string; entityId?: EntityId; geometry?: { center?: Position; bounds?: Bounds };
  theme: string; observedAt: string; metrics: readonly SpatialMetric[]; snapshotId: string;
}

export type TravelMode = "walk" | "bike" | "transit" | "car";
export type AccessibilityTheme = "daily" | "healthcare" | "education" | "mobility" | "environment";
export interface AccessibilityMeasure { destinationType: string; mode: TravelMode; minutes: number | null; distanceMeters: number | null; status: "measured" | "estimated" | "missing"; count5: number; count10: number; count15: number; provenance: Provenance; }
export interface NearbyAmenity { entityId: EntityId; name: string; category: string; amenity: string; distanceMeters: number; provenance: Provenance; }
export interface AccessibilityProfile { entityId?: EntityId; computedAt: string; methodVersion: string; measures: readonly AccessibilityMeasure[]; themes: Readonly<Partial<Record<AccessibilityTheme, { score: number | null; confidence: Provenance["confidence"] }>>>; }

export type SuitabilityDimension = "planning" | "physical" | "environment-safety" | "accessibility" | "market-program" | "deliverability";
export interface SuitabilityBlocker { code: string; label: string; severity: "hard" | "conditional"; explanation: string; provenance: Provenance; }
export interface SuitabilityDimensionResult { dimension: SuitabilityDimension; status: "suitable" | "attention" | "blocked" | "needs-research"; score: number | null; metrics: readonly SpatialMetric[]; confidence: Provenance["confidence"]; }
export interface SuitabilityAssessment { subjectId?: EntityId; assessedAt: string; methodVersion: string; dimensions: readonly SuitabilityDimensionResult[]; blockers: readonly SuitabilityBlocker[]; conclusion: "promising" | "conditional" | "blocked" | "needs-research"; }

export type DrawingKind = "point" | "line" | "polygon" | "rectangle";
export interface DrawingFeature { id: string; projectId?: ProjectId; kind: DrawingKind; name: string; coordinates: readonly Position[]; color: string; note?: string; version: number; createdAt: string; updatedAt: string; }
export interface DrawingMeasurement { lengthMeters: number; areaSquareMeters: number; methodVersion: string; limitations: readonly string[]; }
export interface KnownSuitabilityInputs { areaM2?: number | null; permittedUse?: boolean | null; hasBuildProhibition?: boolean | null; contaminated?: boolean | null; floodRisk?: "low" | "medium" | "high" | null; accessAvailable?: boolean | null; ownershipCount?: number | null; }
export interface PermitPublication { id: string; entityId?: EntityId; authority: string; publicationType: string; status: string; publishedAt: string; officialUrl: string; provenance: Provenance; }
export interface TenderRecord { id: string; projectId?: ProjectId; title: string; authority: string; phase: string; publishedAt: string; officialUrl: string; provenance: Provenance; }
export interface ProjectMilestone { id: string; projectId: ProjectId; label: string; status: "planned" | "active" | "complete" | "blocked"; plannedAt?: string; completedAt?: string; }
export interface MarketListingReference { id: string; entityId?: EntityId; provider: string; externalUrl: string; observedAt: string; access: "authorized" | "licensed"; }
export interface DataConnector { id: string; label: string; sourceId: string; status: "disconnected" | "connected" | "degraded"; access: DataAccess; lastSyncAt?: string; }

export type WorkspaceTool = "explore" | "search" | "layers" | "analyze" | "draw" | "compare" | "projects";
export type TaskPresetId = "living" | "vacancy" | "development" | "delivery";
export interface TaskPreset { id: TaskPresetId; label: string; description: string; layerIds: readonly string[]; }

export const TASK_PRESETS: readonly TaskPreset[] = [
  { id: "living", label: "Wonen & omgeving", description: "Woningen, voorzieningen, bereikbaarheid, energie en markt.", layerIds: ["buildings", "amenities", "mobility"] },
  { id: "vacancy", label: "Gebouwen benutten", description: "Leegstand, transformatie, monumenten en gebouwkwaliteit.", layerIds: ["buildings", "vacancy", "constraints"] },
  { id: "development", label: "Ruimte ontwikkelen", description: "Percelen, regels, milieu, infrastructuur en bouwbaarheid.", layerIds: ["buildings", "parcels", "constraints", "mobility"] },
  { id: "delivery", label: "Realisatie volgen", description: "Projecten, vergunningen, tenders, planning en knelpunten.", layerIds: ["buildings", "constraints"] },
] as const;

export const DATA_SOURCE_CATALOG: readonly DataSourceDefinition[] = [
  { id: "bag", label: "BAG", authority: "Kadaster", description: "Adressen, panden en verblijfsobjecten.", access: "public", freshness: "daily", availability: "available", licenseUrl: "https://www.pdok.nl/introductie/-/article/basisregistratie-adressen-en-gebouwen-ba-1", coverage: "national", facets: ["building", "address"] },
  { id: "bgt", label: "BGT", authority: "Landelijke voorziening BGT", description: "Fysieke inrichting, wegen, water en groen.", access: "public", freshness: "daily", availability: "available", licenseUrl: "https://www.pdok.nl/introductie/-/article/basisregistratie-grootschalige-topografie-bgt-", coverage: "national", facets: ["context", "infrastructure"] },
  { id: "brk", label: "Kadastrale kaart", authority: "Kadaster", description: "Openbare perceelgrenzen en geregistreerde perceelkenmerken.", access: "public", freshness: "daily", availability: "available", licenseUrl: "https://www.pdok.nl/introductie/-/article/kadastrale-kaart", coverage: "national", facets: ["parcel"] },
  { id: "cbs", label: "CBS wijken en buurten", authority: "CBS", description: "Gebiedsindeling en officiële statistieken.", access: "public", freshness: "annual", availability: "available", licenseUrl: "https://www.cbs.nl/nl-nl/dossier/nederland-regionaal/geografische-data/wijk-en-buurtkaart-2025", coverage: "national", facets: ["area", "accessibility"] },
  { id: "openstreetmap", label: "OpenStreetMap", authority: "OpenStreetMap contributors", description: "Aanvullende voorzieningsfuncties; niet volledig en niet normatief.", access: "public", freshness: "live", availability: "available", licenseUrl: "https://www.openstreetmap.org/copyright", coverage: "national", facets: ["amenities"] },
  { id: "dso", label: "DSO", authority: "IPLO", description: "Omgevingsdocumenten en toepasbare regels.", access: "public", freshness: "live", availability: "planned", licenseUrl: "https://iplo.nl/digitaal-stelsel/aansluiten/open-data-api/", coverage: "national", facets: ["planning", "permits"] },
  { id: "tenderned", label: "TenderNed", authority: "TenderNed", description: "Publieke aanbestedingen en gunningen via periodieke datasets.", access: "public", freshness: "daily", availability: "planned", licenseUrl: "https://www.tenderned.nl/cms/nl/aanbesteden-in-cijfers/datasets-aanbestedingen", coverage: "national", facets: ["tenders"] },
  { id: "brainbay", label: "Brainbay", authority: "Brainbay", description: "Geautoriseerde object-, markt- en referentiedata.", access: "licensed", freshness: "live", availability: "requires-connection", licenseUrl: "https://brainbay.nl/producten/object-informatie/", coverage: "national", facets: ["market"] },
  { id: "kadaster-commercial", label: "Kadaster zakelijk", authority: "Kadaster", description: "Doelgebonden transactie- en eigendomsproducten.", access: "licensed", freshness: "on-demand", availability: "requires-connection", licenseUrl: "https://www.kadaster.nl/zakelijk/over-ons/financieel/tarieven", coverage: "national", facets: ["transactions", "ownership"] },
] as const;

export const rendererSupportsDrawing = (renderer: RendererMode) => renderer === "map-2d";
