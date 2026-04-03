// ─── Core domain types ────────────────────────────────────────────────────

export type Trend = "growing" | "stable" | "shrinking";
export type BottleneckSignal = "ok" | "warn" | "alert";
export type DateRange = "6m" | "12m" | "24m";

export interface TenderPublication {
  id: string;
  title: string;
  publicationDate: string; // ISO date "YYYY-MM-DD"
  contractingAuthority: string;
  estimatedValue: number | null;
  cpvCodes: string[];
  nutsCode: string;
  province: string;
  gemeente: string;
  status: "active" | "awarded" | "cancelled";
  isMock: boolean;
}

export interface VergunningRecord {
  gemeente: string;
  province: string;
  jaar: number;
  kwartaal: number; // 1–4
  aanvragen: number;
  verleend: number;
  gemiddeldeDoorlooptijdDagen: number | null;
}

export interface ProvinceMetrics {
  province: string;
  activeTenderCount: number;
  estimatedValue: number; // euros
  trend: Trend;
  activityScore: number; // 0–1 normalised
  bottleneckSignal: BottleneckSignal;
  permitGrowthPct: number | null; // YoY % change
  avgPermitDays: number | null;
  tenders: TenderPublication[];
}

export interface GemeenteMetrics {
  gemeente: string;
  province: string;
  activeTenderCount: number;
  estimatedValue: number;
  permitsYTD: number | null;
  permitsYoYPct: number | null;
  avgPermitDays: number | null;
  trend: Trend;
  bottleneckSignal: BottleneckSignal;
}

export interface TimelinePoint {
  month: string; // "YYYY-MM"
  label: string; // "jan '24"
  tenderCount: number;
  estimatedValueM: number; // millions
  permitsGranted: number | null;
}

export interface PipelineData {
  byProvince: ProvinceMetrics[];
  byGemeente: GemeenteMetrics[];
  timeline: TimelinePoint[];
  totalTenders: number;
  totalValueM: number;
  lastUpdated: string;
  isMockData: boolean;
  dateRange: DateRange;
}
