import { z } from "zod";
import { getCloudIdentity } from "@/lib/cloud/session";
import { createClient } from "@/lib/supabase/server";
import { drawingGeometry, drawingKindSchema, drawingPositionSchema } from "@/lib/cloud/drawing-record";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  note: z.string().max(4000).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  kind: drawingKindSchema.optional(),
  coordinates: z.array(drawingPositionSchema).min(1).max(5000).optional(),
  organizationId: z.string().uuid().optional(),
}).refine((value) => value.name !== undefined || value.note !== undefined || value.color !== undefined || value.coordinates !== undefined, "Geen wijziging opgegeven.")
  .refine((value) => value.coordinates === undefined || value.kind !== undefined, "Het geometrie-type ontbreekt.");

async function authorizedClient(organizationId?: string) {
  const identity = await getCloudIdentity(organizationId);
  const supabase = await createClient();
  return { identity, supabase };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string; drawingId: string }> }) {
  const input = updateSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Ongeldige wijziging." }, { status: 400 });
  const { identity, supabase } = await authorizedClient(input.data.organizationId);
  if (!identity.user || !supabase) return Response.json({ error: "Niet aangemeld." }, { status: 401 });
  if (input.data.organizationId && identity.organization?.id !== input.data.organizationId) return Response.json({ error: "Geen toegang tot deze organisatie." }, { status: 403 });
  if (!identity.entitlements.features.includes("private-projects")) return Response.json({ error: "Tekeningopslag is niet beschikbaar binnen dit plan." }, { status: 403 });
  const { projectId, drawingId } = await params;
  const geometry = input.data.coordinates && input.data.kind ? drawingGeometry(input.data.kind, input.data.coordinates) : undefined;
  if (input.data.coordinates && !geometry) return Response.json({ error: "De geometrie is niet compleet." }, { status: 400 });
  const changes = { ...(input.data.name !== undefined ? { name: input.data.name } : {}), ...(input.data.note !== undefined ? { note: input.data.note } : {}), ...(input.data.color !== undefined ? { color: input.data.color } : {}), ...(geometry ? { geometry } : {}) };
  const { data, error } = await supabase.from("project_drawings").update(changes).eq("id", drawingId).eq("project_id", projectId).select("id,project_id,name,kind,geometry,color,note,version,created_at,updated_at").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  if (!data) return Response.json({ error: "Tekening niet gevonden of geen toegang." }, { status: 404 });
  return Response.json({ drawing: data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ projectId: string; drawingId: string }> }) {
  const rawOrganizationId = new URL(request.url).searchParams.get("organizationId");
  const organizationId = rawOrganizationId && z.string().uuid().safeParse(rawOrganizationId).success ? rawOrganizationId : undefined;
  if (rawOrganizationId && !organizationId) return Response.json({ error: "Ongeldige organisatie." }, { status: 400 });
  const { identity, supabase } = await authorizedClient(organizationId);
  if (!identity.user || !supabase) return Response.json({ error: "Niet aangemeld." }, { status: 401 });
  if (organizationId && identity.organization?.id !== organizationId) return Response.json({ error: "Geen toegang tot deze organisatie." }, { status: 403 });
  if (!identity.entitlements.features.includes("private-projects")) return Response.json({ error: "Tekeningopslag is niet beschikbaar binnen dit plan." }, { status: 403 });
  const { projectId, drawingId } = await params;
  const { data, error } = await supabase.from("project_drawings").delete().eq("id", drawingId).eq("project_id", projectId).select("id").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  if (!data) return Response.json({ error: "Tekening niet gevonden of geen toegang." }, { status: 404 });
  return new Response(null, { status: 204 });
}
