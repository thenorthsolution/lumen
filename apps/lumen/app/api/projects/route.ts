import { z } from "zod";
import { getCloudIdentity } from "@/lib/cloud/session";
import { createClient } from "@/lib/supabase/server";
import { worldEntitySchema } from "@/lib/world-entity-schema";

const createSchema = z.object({
  name: z.string().trim().min(1).max(160),
  siteId: z.string().min(1).max(240).optional(),
  siteSnapshot: worldEntitySchema.optional(),
  organizationId: z.string().uuid().optional(),
}).refine((value) => !value.siteSnapshot || value.siteId === value.siteSnapshot.id, { message: "De locatiesnapshot hoort niet bij het project.", path: ["siteSnapshot"] });

export async function GET(request: Request) {
  const rawOrganizationId = new URL(request.url).searchParams.get("organizationId");
  const organizationId = rawOrganizationId && z.string().uuid().safeParse(rawOrganizationId).success ? rawOrganizationId : undefined;
  if (rawOrganizationId && !organizationId) return Response.json({ error: "Ongeldige organisatie." }, { status: 400 });
  const identity = await getCloudIdentity(organizationId);
  const supabase = await createClient();
  if (!identity.user || !supabase) return Response.json({ error: "Niet aangemeld." }, { status: 401 });
  if (organizationId && identity.organization?.id !== organizationId) return Response.json({ error: "Geen toegang tot deze organisatie." }, { status: 403 });
  let query = supabase.from("projects").select("id, workspace_id, organization_id, owner_id, site_entity_id, site_snapshot, name, status, provenance, created_at, updated_at").order("updated_at", { ascending: false }).limit(50);
  query = organizationId ? query.eq("organization_id", organizationId) : query.is("organization_id", null).eq("owner_id", identity.user.id);
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ projects: data });
}

export async function POST(request: Request) {
  const input = createSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Ongeldige projectgegevens." }, { status: 400 });
  const identity = await getCloudIdentity(input.data.organizationId);
  const supabase = await createClient();
  if (!identity.user || !supabase) return Response.json({ error: "Log in om projecten op te slaan." }, { status: 401 });
  if (input.data.organizationId && identity.organization?.id !== input.data.organizationId) return Response.json({ error: "Geen toegang tot deze organisatie." }, { status: 403 });
  if (!identity.entitlements.features.includes("private-projects")) return Response.json({ error: "Projectopslag is niet beschikbaar binnen dit plan." }, { status: 403 });
  if (!input.data.organizationId && identity.entitlements.projectLimit !== null) {
    const { count } = await supabase.from("projects").select("id", { count: "exact", head: true }).is("organization_id", null).eq("owner_id", identity.user.id).neq("status", "archived");
    if ((count ?? 0) >= identity.entitlements.projectLimit) return Response.json({ error: `Je persoonlijke werkruimte bevat maximaal ${identity.entitlements.projectLimit} actieve projecten.` }, { status: 409 });
  }

  const { data: workspace, error: workspaceError } = await supabase.from("workspaces").insert({
    organization_id: input.data.organizationId ?? null,
    owner_id: identity.user.id,
    name: input.data.name,
  }).select("id").single();
  if (workspaceError) return Response.json({ error: workspaceError.message }, { status: 400 });
  const { data: project, error } = await supabase.from("projects").insert({
    workspace_id: workspace.id,
    organization_id: input.data.organizationId ?? null,
    owner_id: identity.user.id,
    site_entity_id: input.data.siteId,
    site_snapshot: input.data.siteSnapshot ?? null,
    name: input.data.name,
    provenance: [],
  }).select("id, workspace_id, site_entity_id, site_snapshot, name, status, created_at, updated_at").single();
  if (error) {
    await supabase.from("workspaces").delete().eq("id", workspace.id);
    return Response.json({ error: error.message }, { status: 400 });
  }
  return Response.json({ project }, { status: 201 });
}
