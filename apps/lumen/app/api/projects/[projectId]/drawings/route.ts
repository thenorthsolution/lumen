import { z } from "zod";
import { getCloudIdentity } from "@/lib/cloud/session";
import { createClient } from "@/lib/supabase/server";
import { drawingGeometry, drawingKindSchema, drawingPositionSchema } from "@/lib/cloud/drawing-record";

const drawingSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(160), kind: drawingKindSchema,
  coordinates: z.array(drawingPositionSchema).min(1).max(5000), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#315df0"),
  note: z.string().max(4000).optional(), organizationId: z.string().uuid().optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const rawOrganizationId = new URL(request.url).searchParams.get("organizationId");
  const organizationId = rawOrganizationId && z.string().uuid().safeParse(rawOrganizationId).success ? rawOrganizationId : undefined;
  if (rawOrganizationId && !organizationId) return Response.json({ error: "Ongeldige organisatie." }, { status: 400 });
  const identity = await getCloudIdentity(organizationId); const supabase = await createClient();
  if (!identity.user || !supabase) return Response.json({ error: "Niet aangemeld." }, { status: 401 });
  if (organizationId && identity.organization?.id !== organizationId) return Response.json({ error: "Geen toegang tot deze organisatie." }, { status: 403 });
  const { projectId } = await params;
  const { data, error } = await supabase.from("project_drawings").select("id,project_id,name,kind,geometry,color,note,version,created_at,updated_at").eq("project_id", projectId).order("updated_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ drawings: data });
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const input = drawingSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Ongeldige tekening." }, { status: 400 });
  const identity = await getCloudIdentity(input.data.organizationId); const supabase = await createClient();
  if (!identity.user || !supabase) return Response.json({ error: "Log in om tekeningen op te slaan." }, { status: 401 });
  if (input.data.organizationId && identity.organization?.id !== input.data.organizationId) return Response.json({ error: "Geen toegang tot deze organisatie." }, { status: 403 });
  if (!identity.entitlements.features.includes("private-projects")) return Response.json({ error: "Tekeningopslag is niet beschikbaar binnen dit plan." }, { status: 403 });
  const shape = drawingGeometry(input.data.kind, input.data.coordinates);
  if (!shape) return Response.json({ error: "De geometrie is niet compleet." }, { status: 400 });
  const { projectId } = await params;
  const { data, error } = await supabase.from("project_drawings").insert({ id: input.data.id, project_id: projectId, created_by: identity.user.id, name: input.data.name, kind: input.data.kind, geometry: shape, color: input.data.color, note: input.data.note ?? null }).select("id,project_id,name,kind,geometry,color,note,version,created_at,updated_at").single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ drawing: data }, { status: 201 });
}
