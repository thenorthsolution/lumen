/**
 * lib/pipeline-data.ts — Lumen Pipeline
 *
 * Aggregates construction pipeline data from:
 * - TenderNed (public procurement — stub until account approved)
 * - CBS Statline bouwvergunningen API (planned)
 *
 * Produces per-province pipeline metrics for choropleth map
 * and timeline chart rendering.
 */

import {
  searchTenders,
  RESIDENTIAL_CPV_CODES,
  NUTS_TO_PROVINCE,
  type TenderPublication,
} from "./tendernet";

export interface ProvinceMetrics {
  province: string;
  /** Number of active residential construction tenders in trailing 12 months */
  activeTenderCount: number;
  /** Estimated total contract value (euros) */
  estimatedValue: number;
  /** Trend derived from comparing first vs second half of tender dates */
  trend: "growing" | "stable" | "shrinking";
  /** Normalised activity score 0–1 for choropleth fill */
  activityScore: number;
  /** Bottleneck signal derived from tender/demand ratio */
  bottleneckSignal: "ok" | "warn" | "alert";
  tenders: TenderPublication[];
}

export interface TimelinePoint {
  /** ISO month string "YYYY-MM" */
  month: string;
  /** Human-readable label e.g. "Jan '26" */
  label: string;
  tenderCount: number;
  /** Estimated value in millions of euros */
  estimatedValueMillions: number;
}

export interface PipelineData {
  byProvince: ProvinceMetrics[];
  timeline: TimelinePoint[];
  totalTenders: number;
  totalValueMillions: number;
  lastUpdated: string;
  /** True when TenderNed account is pending and mock data is used */
  isMockData: boolean;
}

/**
 * Fetch and aggregate the full pipeline dataset.
 * Covers the trailing 12 months from today.
 */
export async function fetchPipelineData(
  signal?: AbortSignal,
): Promise<PipelineData> {
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const tenders = await searchTenders(
    {
      cpvCodes: [...RESIDENTIAL_CPV_CODES],
      dateFrom: oneYearAgo.toISOString().split("T")[0],
      dateTo: now.toISOString().split("T")[0],
      pageSize: 100,
    },
    signal,
  );

  const isMockData = tenders.some((t) => t.id.startsWith("mock-"));
  const byProvince = aggregateByProvince(tenders);
  const timeline = buildTimeline(tenders);
  const totalValue = tenders.reduce(
    (sum, t) => sum + (t.estimatedValue ?? 0),
    0,
  );

  return {
    byProvince,
    timeline,
    totalTenders: tenders.length,
    totalValueMillions: Math.round(totalValue / 1_000_000),
    lastUpdated: now.toISOString(),
    isMockData,
  };
}

function aggregateByProvince(tenders: TenderPublication[]): ProvinceMetrics[] {
  const allProvinces = [...new Set(Object.values(NUTS_TO_PROVINCE))];
  const grouped: Record<string, TenderPublication[]> = {};

  for (const province of allProvinces) grouped[province] = [];
  for (const tender of tenders) {
    if (grouped[tender.province]) grouped[tender.province]!.push(tender);
  }

  const counts = Object.values(grouped).map((ts) => ts.length);
  const maxCount = Math.max(...counts, 1);

  return allProvinces
    .map((province) => {
      const provinceTenders = grouped[province] ?? [];
      const totalValue = provinceTenders.reduce(
        (sum, t) => sum + (t.estimatedValue ?? 0),
        0,
      );
      const score = provinceTenders.length / maxCount;

      // Trend heuristic: compare publication volume of first vs second half
      const sorted = [...provinceTenders].sort((a, b) =>
        a.publicationDate.localeCompare(b.publicationDate),
      );
      const midpoint = Math.floor(sorted.length / 2);
      const firstHalf = sorted.slice(0, midpoint).length;
      const secondHalf = sorted.slice(midpoint).length;
      const trend: ProvinceMetrics["trend"] =
        secondHalf > firstHalf * 1.2
          ? "growing"
          : secondHalf < firstHalf * 0.8
            ? "shrinking"
            : "stable";

      // Bottleneck: low activity in high-demand provinces = alert
      const HIGH_DEMAND_PROVINCES = [
        "Noord-Holland",
        "Zuid-Holland",
        "Utrecht",
      ];
      const bottleneckSignal: ProvinceMetrics["bottleneckSignal"] =
        score < 0.15 && HIGH_DEMAND_PROVINCES.includes(province)
          ? "alert"
          : score < 0.3
            ? "warn"
            : "ok";

      return {
        province,
        activeTenderCount: provinceTenders.length,
        estimatedValue: totalValue,
        trend,
        activityScore: score,
        bottleneckSignal,
        tenders: provinceTenders,
      };
    })
    .sort((a, b) => b.activeTenderCount - a.activeTenderCount);
}

function buildTimeline(tenders: TenderPublication[]): TimelinePoint[] {
  const monthMap: Record<string, { count: number; value: number }> = {};

  for (const tender of tenders) {
    const month = tender.publicationDate.slice(0, 7); // "YYYY-MM"
    if (!monthMap[month]) monthMap[month] = { count: 0, value: 0 };
    monthMap[month].count += 1;
    monthMap[month].value += tender.estimatedValue ?? 0;
  }

  return Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => {
      const [year, mo] = month.split("-");
      const date = new Date(Number(year), Number(mo) - 1);
      return {
        month,
        label: date.toLocaleDateString("nl-NL", {
          month: "short",
          year: "2-digit",
        }),
        tenderCount: data.count,
        estimatedValueMillions: Math.round(data.value / 1_000_000),
      };
    });
}
