import { z } from "zod";
import { getCloudIdentity } from "@/lib/cloud/session";
import { createServiceClient } from "@/lib/supabase/server";
import { createStripeClient } from "@/lib/stripe";

const schema = z.object({ organizationId: z.string().uuid() });

export async function POST(request: Request) {
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Ongeldige organisatie." }, { status: 400 });
  const identity = await getCloudIdentity(input.data.organizationId);
  if (!identity.user || identity.organization?.id !== input.data.organizationId) return Response.json({ error: "Geen toegang." }, { status: 403 });
  if (!(["owner", "admin"] as const).includes(identity.organization.role as "owner" | "admin")) return Response.json({ error: "Alleen een beheerder kan facturatie wijzigen." }, { status: 403 });
  const stripe = createStripeClient();
  const service = createServiceClient();
  const price = process.env.STRIPE_ORGANIZATION_PRICE_ID;
  if (!stripe || !service || !price) return Response.json({ error: "Stripe is nog niet geconfigureerd." }, { status: 503 });

  const { data: existing } = await service.from("subscriptions").select("customer_id").eq("organization_id", input.data.organizationId).maybeSingle();
  let customerId = existing?.customer_id as string | null | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: identity.user.email ?? undefined, name: identity.organization.name, metadata: { lumenOrganizationId: input.data.organizationId } });
    customerId = customer.id;
    await service.from("subscriptions").upsert({ organization_id: input.data.organizationId, customer_id: customerId, status: "incomplete" });
  }
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${origin}/account?billing=success`,
    cancel_url: `${origin}/account?billing=canceled`,
    subscription_data: { metadata: { lumenOrganizationId: input.data.organizationId } },
    metadata: { lumenOrganizationId: input.data.organizationId },
  });
  return Response.json({ url: session.url });
}

