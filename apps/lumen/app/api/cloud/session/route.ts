import { getCloudIdentity } from "@/lib/cloud/session";

export async function GET() {
  return Response.json(await getCloudIdentity(), { headers: { "Cache-Control": "private, no-store" } });
}

