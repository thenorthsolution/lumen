import { milestoneWriteSchema } from "@/lib/project-milestone-schema";
import { getCloudIdentity } from "@/lib/cloud/session";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const updateSchema = milestoneWriteSchema.omit({ id: true }).partial().refine((value) => value.label !== undefined || value.status !== undefined || value.plannedAt !== undefined || value.completedAt !== undefined, "Geen wijziging opgegeven.");

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string; milestoneId: string }> }) {
  const input = updateSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Ongeldige mijlpaalwijziging." }, { status: 400 });
  const identity = await getCloudIdentity(input.data.organizationId); const supabase = await createClient();
  if (!identity.user || !supabase) return Response.json({ error: "Niet aangemeld." }, { status: 401 });
  if (input.data.organizationId && identity.organization?.id !== input.data.organizationId) return Response.json({ error: "Geen toegang tot deze organisatie." }, { status: 403 });
  if (!identity.entitlements.features.includes("private-projects")) return Response.json({ error: "Projectplanning is niet beschikbaar binnen dit plan." }, { status: 403 });
  const { projectId, milestoneId } = await params;
  const changes = { ...(input.data.label !== undefined ? { label: input.data.label } : {}), ...(input.data.status !== undefined ? { status: input.data.status } : {}), ...(input.data.plannedAt !== undefined ? { planned_at: input.data.plannedAt } : {}), ...(input.data.completedAt !== undefined ? { completed_at: input.data.completedAt } : {}) };
  const { data, error } = await supabase.from("project_milestones").update(changes).eq("id", milestoneId).eq("project_id", projectId).select("id,project_id,label,status,planned_at,completed_at,created_at,updated_at").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  if (!data) return Response.json({ error: "Mijlpaal niet gevonden of geen toegang." }, { status: 404 });
  return Response.json({ milestone: data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ projectId: string; milestoneId: string }> }) {
  const raw = new URL(request.url).searchParams.get("organizationId");
  const parsed = raw ? z.string().uuid().safeParse(raw) : null;
  if (parsed && !parsed.success) return Response.json({ error: "Ongeldige organisatie." }, { status: 400 });
  const organizationId = parsed?.success ? parsed.data : undefined;
  const identity = await getCloudIdentity(organizationId); const supabase = await createClient();
  if (!identity.user || !supabase) return Response.json({ error: "Niet aangemeld." }, { status: 401 });
  if (organizationId && identity.organization?.id !== organizationId) return Response.json({ error: "Geen toegang tot deze organisatie." }, { status: 403 });
  if (!identity.entitlements.features.includes("private-projects")) return Response.json({ error: "Projectplanning is niet beschikbaar binnen dit plan." }, { status: 403 });
  const { projectId, milestoneId } = await params;
  const { data, error } = await supabase.from("project_milestones").delete().eq("id", milestoneId).eq("project_id", projectId).select("id").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  if (!data) return Response.json({ error: "Mijlpaal niet gevonden of geen toegang." }, { status: 404 });
  return new Response(null, { status: 204 });
}
