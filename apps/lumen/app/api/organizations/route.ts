import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({ name: z.string().trim().min(2).max(120) });

function slugify(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48);
}

export async function POST(request: Request) {
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Vul een geldige organisatienaam in." }, { status: 400 });
  const supabase = await createClient();
  if (!supabase) return Response.json({ error: "Accounts zijn niet geconfigureerd." }, { status: 503 });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return Response.json({ error: "Niet aangemeld." }, { status: 401 });
  const slug = `${slugify(input.data.name)}-${crypto.randomUUID().slice(0, 6)}`;
  const { data, error } = await supabase.from("organizations").insert({ name: input.data.name, slug, created_by: auth.user.id }).select("id, name, trial_ends_at").single();
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json(data, { status: 201 });
}

