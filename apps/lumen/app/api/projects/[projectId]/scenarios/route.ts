import { z } from "zod";
import { getCloudIdentity } from "@/lib/cloud/session";
import { createClient } from "@/lib/supabase/server";
import { scenarioWriteSchema } from "@/lib/cloud/scenario-record";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const rawOrganizationId = new URL(request.url).searchParams.get("organizationId");
  const organizationId = rawOrganizationId && z.string().uuid().safeParse(rawOrganizationId).success ? rawOrganizationId : undefined;
  if (rawOrganizationId && !organizationId) return Response.json({ error: "Ongeldige organisatie." }, { status: 400 });
  const identity = await getCloudIdentity(organizationId); const supabase = await createClient();
  if (!identity.user || !supabase) return Response.json({ error: "Niet aangemeld." }, { status: 401 });
  if (organizationId && identity.organization?.id !== organizationId) return Response.json({ error: "Geen toegang tot deze organisatie." }, { status: 403 });
  const { projectId } = await params;
  const { data, error } = await supabase.from("scenarios").select("id,project_id,name,status,assumptions,objects,calculation,created_at,updated_at").eq("project_id", projectId).neq("status", "archived").order("updated_at", { ascending: false }).limit(20);
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ scenarios: data });
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const input = scenarioWriteSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Ongeldige scenariogegevens." }, { status: 400 });
  const identity = await getCloudIdentity(input.data.organizationId);
  const supabase = await createClient();
  if (!identity.user || !supabase) return Response.json({ error: "Log in om scenario’s op te slaan." }, { status: 401 });
  if (input.data.organizationId && identity.organization?.id !== input.data.organizationId) return Response.json({ error: "Geen toegang tot deze organisatie." }, { status: 403 });
  if (!identity.entitlements.features.includes("private-projects")) return Response.json({ error: "Scenario-opslag is niet beschikbaar binnen dit plan." }, { status: 403 });
  const { projectId } = await params;
  const { data, error } = await supabase.from("scenarios").insert({
    project_id: projectId, name: input.data.name, status: input.data.calculation ? "calculated" : "draft",
    assumptions: input.data.assumptions, objects: input.data.objects, calculation: input.data.calculation ?? null, created_by: identity.user.id,
  }).select("id,project_id,name,status,assumptions,objects,calculation,created_at,updated_at").single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ scenario: data }, { status: 201 });
}
