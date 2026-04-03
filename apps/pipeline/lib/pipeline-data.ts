import { fetchTenders, NUTS_TO_PROVINCE } from "./tenderned";
import type {
  PipelineData,
  ProvinceMetrics,
  GemeenteMetrics,
  TimelinePoint,
  TenderPublication,
  DateRange,
  Trend,
  BottleneckSignal,
} from "./types";

const ALL_PROVINCES = [...new Set(Object.values(NUTS_TO_PROVINCE))].sort();

// High-demand provinces where low activity = alert
const HIGH_DEMAND = new Set([
  "Noord-Holland",
  "Zuid-Holland",
  "Utrecht",
  "Noord-Brabant",
]);

// Mock permit data keyed by province (avg days, YoY growth %)
const MOCK_PERMITS: Record<string, { days: number; ytdGrowthPct: number }> = {
  "Noord-Holland": { days: 178, ytdGrowthPct: 4.2 },
  "Zuid-Holland": { days: 162, ytdGrowthPct: 7.8 },
  Utrecht: { days: 145, ytdGrowthPct: 11.3 },
  Overijssel: { days: 89, ytdGrowthPct: 18.6 },
  Gelderland: { days: 98, ytdGrowthPct: 14.2 },
  "Noord-Brabant": { days: 121, ytdGrowthPct: 9.5 },
  Limburg: { days: 104, ytdGrowthPct: 6.1 },
  Flevoland: { days: 76, ytdGrowthPct: 22.4 },
  Groningen: { days: 83, ytdGrowthPct: 3.7 },
  Friesland: { days: 91, ytdGrowthPct: 2.1 },
  Drenthe: { days: 88, ytdGrowthPct: 5.3 },
  Zeeland: { days: 72, ytdGrowthPct: 8.9 },
};

const NATIONAL_MEDIAN_DAYS = 112;

function calcTrend(tenders: TenderPublication[]): Trend {
  if (tenders.length < 4) return "stable";
  const sorted = [...tenders].sort((a, b) =>
    a.publicationDate.localeCompare(b.publicationDate),
  );
  const mid = Math.floor(sorted.length / 2);
  const first = sorted.slice(0, mid).length;
  const second = sorted.slice(mid).length;
  if (second > first * 1.2) return "growing";
  if (second < first * 0.8) return "shrinking";
  return "stable";
}

function calcBottleneck(
  score: number,
  province: string,
  avgDays: number | null,
): BottleneckSignal {
  if (avgDays && avgDays > NATIONAL_MEDIAN_DAYS * 2) return "alert";
  if (score < 0.15 && HIGH_DEMAND.has(province)) return "alert";
  if (score < 0.3 || (avgDays && avgDays > NATIONAL_MEDIAN_DAYS * 1.4))
    return "warn";
  return "ok";
}

function buildTimeline(tenders: TenderPublication[]): TimelinePoint[] {
  const map: Record<string, { count: number; value: number }> = {};
  for (const t of tenders) {
    const month = t.publicationDate.slice(0, 7);
    if (!map[month]) map[month] = { count: 0, value: 0 };
    map[month].count += 1;
    map[month].value += t.estimatedValue ?? 0;
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => {
      const [y, mo] = month.split("-");
      const label = new Date(Number(y), Number(mo) - 1).toLocaleDateString(
        "nl-NL",
        { month: "short", year: "2-digit" },
      );
      return {
        month,
        label,
        tenderCount: d.count,
        estimatedValueM: Math.round(d.value / 1_000_000),
        permitsGranted: null,
      };
    });
}

function buildGemeenteMetrics(tenders: TenderPublication[]): GemeenteMetrics[] {
  const grouped: Record<string, TenderPublication[]> = {};
  for (const t of tenders) {
    if (!grouped[t.gemeente]) grouped[t.gemeente] = [];
    grouped[t.gemeente]!.push(t);
  }
  return Object.entries(grouped)
    .map(([gemeente, ts]) => {
      const province = ts[0]!.province;
      const value = ts.reduce((s, t) => s + (t.estimatedValue ?? 0), 0);
      const trend = calcTrend(ts);
      const permitData = MOCK_PERMITS[province];
      const signal: BottleneckSignal =
        (permitData?.days ?? 0) > NATIONAL_MEDIAN_DAYS * 1.5 ? "warn" : "ok";
      return {
        gemeente,
        province,
        activeTenderCount: ts.length,
        estimatedValue: value,
        permitsYTD: Math.round(ts.length * 4.2),
        permitsYoYPct: permitData?.ytdGrowthPct ?? null,
        avgPermitDays: permitData?.days ?? null,
        trend,
        bottleneckSignal: signal,
      } satisfies GemeenteMetrics;
    })
    .sort((a, b) => b.activeTenderCount - a.activeTenderCount);
}

export async function fetchPipelineData(
  range: DateRange,
  signal?: AbortSignal,
): Promise<PipelineData> {
  const { tenders, isMock } = await fetchTenders(range, signal);

  // By-province aggregation
  const grouped: Record<string, TenderPublication[]> = {};
  for (const p of ALL_PROVINCES) grouped[p] = [];
  for (const t of tenders) {
    if (grouped[t.province]) grouped[t.province]!.push(t);
  }

  const counts = Object.values(grouped).map((ts) => ts.length);
  const maxCount = Math.max(...counts, 1);

  const byProvince: ProvinceMetrics[] = ALL_PROVINCES.map((province) => {
    const ts = grouped[province] ?? [];
    const value = ts.reduce((s, t) => s + (t.estimatedValue ?? 0), 0);
    const score = ts.length / maxCount;
    const trend = calcTrend(ts);
    const pd = MOCK_PERMITS[province];
    const bottleneck = calcBottleneck(score, province, pd?.days ?? null);
    return {
      province,
      activeTenderCount: ts.length,
      estimatedValue: value,
      trend,
      activityScore: score,
      bottleneckSignal: bottleneck,
      permitGrowthPct: pd?.ytdGrowthPct ?? null,
      avgPermitDays: pd?.days ?? null,
      tenders: ts,
    };
  }).sort((a, b) => b.activeTenderCount - a.activeTenderCount);

  const totalValue = tenders.reduce((s, t) => s + (t.estimatedValue ?? 0), 0);

  return {
    byProvince,
    byGemeente: buildGemeenteMetrics(tenders),
    timeline: buildTimeline(tenders),
    totalTenders: tenders.length,
    totalValueM: Math.round(totalValue / 1_000_000),
    lastUpdated: new Date().toISOString(),
    isMockData: isMock,
    dateRange: range,
  };
}
