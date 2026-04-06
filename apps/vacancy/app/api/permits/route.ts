import { NextResponse } from "next/server";

const SRU_BASE =
  "https://zoek.officielebekendmakingen.nl/sru/Search";

type PermitNotice = {
  id: string;
  title: string;
  type: string;
  creator: string;
  modified: string;
  url: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gemeente = searchParams.get("gemeente")?.trim();
  const woonplaats = searchParams.get("woonplaats")?.trim();
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") ?? "6"), 1),
    10,
  );

  if (!gemeente) {
    return NextResponse.json(
      { error: "Query parameter 'gemeente' is verplicht." },
      { status: 400 },
    );
  }

  const clauses = [`title=omgevingsvergunning`, `creator="${escapeCql(gemeente)}"`];
  if (woonplaats && woonplaats.toLowerCase() !== gemeente.toLowerCase()) {
    clauses.push(`title="${escapeCql(woonplaats)}"`);
  }

  const url = new URL(SRU_BASE);
  url.searchParams.set("version", "1.2");
  url.searchParams.set("operation", "searchRetrieve");
  url.searchParams.set("x-connection", "oep");
  url.searchParams.set("startRecord", "1");
  url.searchParams.set("maximumRecords", String(limit));
  url.searchParams.set("query", clauses.join(" AND "));

  const response = await fetch(url.toString(), {
    headers: {
      accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
      "user-agent": "Lumen Vacancy Radar/1.0",
    },
    next: { revalidate: 60 * 30 },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: `Vergunningenbron gaf ${response.status} terug.` },
      { status: 502 },
    );
  }

  const xml = await response.text();
  const notices = parsePermitNotices(xml);
  const total = Number(firstMatch(xml, /<numberOfRecords>(\d+)<\/numberOfRecords>/));
  const resolvedTotal = Number.isFinite(total) ? total : notices.length;
  const summary = buildPermitSummary({
    gemeente,
    woonplaats: woonplaats ?? null,
    total: resolvedTotal,
    notices,
  });

  return NextResponse.json({
    gemeente,
    woonplaats: woonplaats ?? null,
    total: resolvedTotal,
    notices,
    summary,
  });
}

function buildPermitSummary(input: {
  gemeente: string;
  woonplaats: string | null;
  total: number;
  notices: PermitNotice[];
}) {
  return buildDeterministicPermitSummary(input);
}

function buildDeterministicPermitSummary(input: {
  gemeente: string;
  woonplaats: string | null;
  total: number;
  notices: PermitNotice[];
}) {
  const area = input.woonplaats || input.gemeente;
  if (input.notices.length === 0) {
    return `Geen recente vergunningpublicaties gevonden voor ${area}.`;
  }

  const latestNotice = input.notices[0];
  const latest = latestNotice
    ? formatPermitDate(latestNotice.modified)
    : "onbekende datum";
  const topic = summarizePermitTopics(input.notices);

  return `${input.total.toLocaleString("nl-NL")} recente vergunningpublicaties voor ${area}; nadruk op ${topic}. Laatste publicatie: ${latest}.`;
}

function summarizePermitTopics(notices: PermitNotice[]) {
  const topicMatchers = [
    { label: "verbouw of uitbreiding", patterns: ["verbouwen", "uitbreiden", "opbouwen", "aanbouw", "dakopbouw"] },
    { label: "nieuwbouw", patterns: ["nieuwbouw", "bouwen", "realiseren", "oprichten"] },
    { label: "sloopwerk", patterns: ["slopen", "sloop"] },
    { label: "functiewijziging", patterns: ["afwijken", "wijzigen", "omzetten", "transformatie"] },
    { label: "kap of groenwerk", patterns: ["kappen", "vellen", "boom"] },
    { label: "reclame of gevelwijziging", patterns: ["reclame", "gevel", "pui", "kozijnen"] },
    { label: "inrit of terreinwijziging", patterns: ["uitweg", "inrit", "parkeer", "erf", "terrein"] },
  ];

  const counts = new Map<string, number>();
  for (const notice of notices) {
    const haystack = `${notice.title} ${notice.type}`.toLowerCase();
    for (const topic of topicMatchers) {
      if (topic.patterns.some((pattern) => haystack.includes(pattern))) {
        counts.set(topic.label, (counts.get(topic.label) ?? 0) + 1);
      }
    }
  }

  const topTopics = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([label]) => label);

  if (topTopics.length === 0) {
    return "algemene omgevingsvergunningen";
  }
  if (topTopics.length === 1) {
    return topTopics[0];
  }
  return `${topTopics[0]} en ${topTopics[1]}`;
}

function parsePermitNotices(xml: string): PermitNotice[] {
  const records = [...xml.matchAll(/<record>([\s\S]*?)<\/record>/g)];
  return records.map((match) => {
    const block = match[1] ?? "";
    return {
      id: decodeXml(firstMatch(block, /<dcterms:identifier>([\s\S]*?)<\/dcterms:identifier>/)),
      title: decodeXml(firstMatch(block, /<dcterms:title>([\s\S]*?)<\/dcterms:title>/)),
      type: decodeXml(firstMatch(block, /<dcterms:type[^>]*>([\s\S]*?)<\/dcterms:type>/)),
      creator: decodeXml(firstMatch(block, /<dcterms:creator>([\s\S]*?)<\/dcterms:creator>/)),
      modified: decodeXml(firstMatch(block, /<dcterms:modified>([\s\S]*?)<\/dcterms:modified>/)),
      url: decodeXml(firstMatch(block, /<url>([\s\S]*?)<\/url>/)),
    };
  });
}

function firstMatch(input: string, pattern: RegExp): string {
  const match = input.match(pattern);
  return match?.[1]?.trim() ?? "";
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function escapeCql(value: string): string {
  return value.replace(/"/g, '\\"');
}

function formatPermitDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "onbekende datum";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
