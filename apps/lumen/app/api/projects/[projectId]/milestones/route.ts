import { z } from "zod";
import { getCloudIdentity } from "@/lib/cloud/session";
import { milestoneWriteSchema } from "@/lib/project-milestone-schema";
import { createClient } from "@/lib/supabase/server";

const organizationFromRequest = (request: Request) => {
  const raw = new URL(request.url).searchParams.get("organizationId");
  if (!raw) return { valid: true as const, value: undefined };
  const parsed = z.string().uuid().safeParse(raw);
  return parsed.success ? { valid: true as const, value: parsed.data } : { valid: false as const };
};

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const organization = organizationFromRequest(request);
  if (!organization.valid) return Response.json({ error: "Ongeldige organisatie." }, { status: 400 });
  const identity = await getCloudIdentity(organization.value); const supabase = await createClient();
  if (!identity.user || !supabase) return Response.json({ error: "Niet aangemeld." }, { status: 401 });
  if (organization.value && identity.organization?.id !== organization.value) return Response.json({ error: "Geen toegang tot deze organisatie." }, { status: 403 });
  const { projectId } = await params;
  const { data, error } = await supabase.from("project_milestones").select("id,project_id,label,status,planned_at,completed_at,created_at,updated_at").eq("project_id", projectId).order("planned_at", { ascending: true, nullsFirst: false });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ milestones: data });
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const input = milestoneWriteSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Ongeldige mijlpaal." }, { status: 400 });
  const identity = await getCloudIdentity(input.data.organizationId); const supabase = await createClient();
  if (!identity.user || !supabase) return Response.json({ error: "Niet aangemeld." }, { status: 401 });
  if (input.data.organizationId && identity.organization?.id !== input.data.organizationId) return Response.json({ error: "Geen toegang tot deze organisatie." }, { status: 403 });
  if (!identity.entitlements.features.includes("private-projects")) return Response.json({ error: "Projectplanning is niet beschikbaar binnen dit plan." }, { status: 403 });
  const { projectId } = await params;
  const { data, error } = await supabase.from("project_milestones").insert({ id: input.data.id, project_id: projectId, created_by: identity.user.id, label: input.data.label, status: input.data.status, planned_at: input.data.plannedAt ?? null, completed_at: input.data.completedAt ?? null }).select("id,project_id,label,status,planned_at,completed_at,created_at,updated_at").single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ milestone: data }, { status: 201 });
}
