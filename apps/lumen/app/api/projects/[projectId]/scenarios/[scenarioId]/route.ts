import { getCloudIdentity } from "@/lib/cloud/session";
import { createClient } from "@/lib/supabase/server";
import { scenarioWriteSchema } from "@/lib/cloud/scenario-record";

const updateSchema = scenarioWriteSchema.partial().refine(
  (value) => value.name !== undefined || value.assumptions !== undefined || value.objects !== undefined || value.calculation !== undefined,
  "Geen wijziging opgegeven.",
);

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string; scenarioId: string }> }) {
  const input = updateSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Ongeldige scenariowijziging." }, { status: 400 });
  const identity = await getCloudIdentity(input.data.organizationId);
  const supabase = await createClient();
  if (!identity.user || !supabase) return Response.json({ error: "Niet aangemeld." }, { status: 401 });
  if (input.data.organizationId && identity.organization?.id !== input.data.organizationId) return Response.json({ error: "Geen toegang tot deze organisatie." }, { status: 403 });
  if (!identity.entitlements.features.includes("private-projects")) return Response.json({ error: "Scenario-opslag is niet beschikbaar binnen dit plan." }, { status: 403 });
  const { projectId, scenarioId } = await params;
  const changes = {
    ...(input.data.name !== undefined ? { name: input.data.name } : {}),
    ...(input.data.assumptions !== undefined ? { assumptions: input.data.assumptions } : {}),
    ...(input.data.objects !== undefined ? { objects: input.data.objects } : {}),
    ...(input.data.calculation !== undefined ? { calculation: input.data.calculation, status: input.data.calculation ? "calculated" : "draft" } : {}),
  };
  const { data, error } = await supabase.from("scenarios").update(changes).eq("id", scenarioId).eq("project_id", projectId).select("id,project_id,name,status,assumptions,objects,calculation,created_at,updated_at").maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  if (!data) return Response.json({ error: "Scenario niet gevonden of geen toegang." }, { status: 404 });
  return Response.json({ scenario: data });
}
