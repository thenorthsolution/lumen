import { NextResponse } from "next/server";
import { DATA_SOURCE_CATALOG, TASK_PRESETS } from "@lumen/world";
import { layerRegistry } from "@/lib/world-store";

export const revalidate = 3600;

export function GET() {
  return NextResponse.json({
    layers: layerRegistry,
    presets: TASK_PRESETS,
    sources: DATA_SOURCE_CATALOG,
    generatedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
