import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { createStripeClient } from "@/lib/stripe";

function subscriptionValues(subscription: Stripe.Subscription) {
  const organizationId = subscription.metadata.lumenOrganizationId;
  const item = subscription.items.data[0];
  return organizationId ? {
    p_organization_id: organizationId,
    p_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    p_subscription_id: subscription.id,
    p_price_id: item?.price.id,
    p_status: subscription.status === "unpaid" ? "past_due" : subscription.status === "incomplete_expired" ? "canceled" : subscription.status,
    p_current_period_end: item ? new Date(item.current_period_end * 1000).toISOString() : null,
    p_cancel_at_period_end: subscription.cancel_at_period_end,
  } : null;
}

export async function POST(request: Request) {
  const stripe = createStripeClient();
  const service = createServiceClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !service || !secret) return Response.json({ error: "Webhook is niet geconfigureerd." }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Ontbrekende handtekening." }, { status: 400 });
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(await request.text(), signature, secret); }
  catch { return Response.json({ error: "Ongeldige handtekening." }, { status: 400 }); }

  let values: ReturnType<typeof subscriptionValues> = null;
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    values = subscriptionValues(event.data.object);
  }
  const { data, error } = await service.rpc("apply_stripe_subscription_event", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_event_created: event.created,
    p_payload: event,
    ...values,
  });
  if (error) return Response.json({ error: "Event kon niet atomisch worden verwerkt." }, { status: 500 });
  return Response.json({ received: true, result: data });
}
