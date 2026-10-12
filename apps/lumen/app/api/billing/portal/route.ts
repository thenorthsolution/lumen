import { z } from "zod";
import { getCloudIdentity } from "@/lib/cloud/session";
import { createServiceClient } from "@/lib/supabase/server";
import { createStripeClient } from "@/lib/stripe";

const schema = z.object({ organizationId: z.string().uuid() });

export async function POST(request: Request) {
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Ongeldige organisatie." }, { status: 400 });
  const identity = await getCloudIdentity(input.data.organizationId);
  if (!identity.user || identity.organization?.id !== input.data.organizationId || !["owner", "admin"].includes(identity.organization.role)) return Response.json({ error: "Geen toegang." }, { status: 403 });
  const stripe = createStripeClient();
  const service = createServiceClient();
  if (!stripe || !service) return Response.json({ error: "Stripe is nog niet geconfigureerd." }, { status: 503 });
  const { data } = await service.from("subscriptions").select("customer_id").eq("organization_id", input.data.organizationId).maybeSingle();
  if (!data?.customer_id) return Response.json({ error: "Er is nog geen actief facturatieprofiel." }, { status: 404 });
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const session = await stripe.billingPortal.sessions.create({ customer: data.customer_id, return_url: `${origin}/account` });
  return Response.json({ url: session.url });
}

