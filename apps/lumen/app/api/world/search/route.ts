import { z } from "zod";
import { findPdokLocations } from "@/lib/ai/pdok-location";

const querySchema = z.string().trim().min(2).max(160);

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(new URL(request.url).searchParams.get("q"));
  if (!parsed.success) return Response.json({ status: "invalid", message: "Vul minimaal twee tekens in.", locations: [] }, { status: 400 });
  const result = await findPdokLocations(parsed.data);
  return Response.json(result, { status: result.status === "unavailable" ? 503 : 200, headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
}
